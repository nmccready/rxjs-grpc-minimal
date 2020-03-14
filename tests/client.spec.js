const { take, delay: rxjsDelay } = require('rxjs/operators');
const { loadObject, credentials } = require('grpc');
const { loadSync } = require('protobufjs');
const { expect } = require('chai');
const { once } = require('lodash');
const sinon = require('sinon');

const getProtoPath = require('./utils/getProtoPath');
const serverRx = require('../examples/helloworld/impls/serverRx');
const { toRxClient } = require('../src');

const toGrpc = loadObject;

const protPath = getProtoPath(__dirname)(
  '../examples/helloworld/helloworld.proto'
);
const URI = '127.0.0.1:56001';
const debug = require('../debug').spawn('test:index');

describe(`client`, () => {
  let grpcAPI, initServerPayload, conn;

  describe('grpc client', () => {
    beforeEach(() => {
      // if you care about num_greetings casing..
      // use new Root().loadSync(protPath, { keepCase: true});
      const pbAPI = loadSync(protPath).lookup('helloworld');
      grpcAPI = toGrpc(pbAPI);
      // run anyway to make sure it does not
      // kill original API
      toRxClient(grpcAPI);

      initServerPayload = serverRx.initServer({
        uri: URI,
        grpcAPI,
        serviceName: 'Greeter'
      });

      conn = new initServerPayload.GrpcService(
        URI,
        credentials.createInsecure()
      );

      sinon.spy(conn, 'sayMultiHelloRx');
    });

    describe('stream reply', () => {
      let name;

      function makeCall(doComplete = true, expectedCalls = 2, delayMs) {
        name = 'Brody';

        return conn.sayMultiHelloRx({
          name,
          numGreetings: expectedCalls,
          doComplete,
          delayMs
        });
      }

      it('rxWrapper is called once', () => {
        const { server } = initServerPayload;
        makeCall();
        expect(conn.sayMultiHelloRx.calledOnce).to.be.ok;
        conn.close();
        server.forceShutdown();
      });

      it('queueing many calls holds connection', done => {
        const { impl, server } = initServerPayload;
        const callObs = makeCall(false);
        callObs.subscribe({
          next: once(() => {
            expect(impl.sayMultiHello.holdingObservers.size).to.be.eql(1);
            for (const cancel of grpcAPI.cancelCache) {
              cancel();
            }
          }),
          error: maybeError => {
            setTimeout(() => {
              if (maybeError.details === 'Cancelled') {
                expect(impl.sayMultiHello.holdingObservers.size).to.be.eql(0);
                expect(grpcAPI.cancelCache.size).to.be.eql(0);
                done();
                return;
              }
              done(maybeError);
            }, 50);
            conn.close();
            server.forceShutdown();
          }
        });
      });

      describe('unsubscribe serverside', () => {
        it('queueing many calls and unsubscribe early', done => {
          const { impl, server } = initServerPayload;
          let nextCalls = 0;
          const delayMs = 100;
          const expectedCalls = 2;

          const callObs = makeCall(false, 10, delayMs);

          const ret = callObs.subscribe({
            next: () => {
              debug(() => `called ${nextCalls}`);
              expect(impl.sayMultiHello.holdingObservers.size).to.be.eql(1);
              nextCalls++;
            },
            error: maybeError => {
              done(maybeError);
            },
            complete: () => {
              // we should unsub before getting a completion
              done(new Error('should not complete'));
            }
          });

          // wait an amount of time to get some expected calls
          setTimeout(() => {
            ret.unsubscribe();
            debug(() => 'unsubscribed !!!!!!!!!!!!!!!!!');

            expect(nextCalls).to.not.be.eql(10);
            expect(nextCalls).to.be.eql(expectedCalls);
            setTimeout(() => {
              expect(impl.sayMultiHello.holdingObservers.size).to.be.eql(0);
              expect(grpcAPI.cancelCache.size).to.be.eql(0);
              done();
            }, 20);

            conn.close();
            server.forceShutdown(done);
          }, delayMs * expectedCalls + 20);
        });
      });

      /**
       * A streaming response that is ended early using take(1), takeUntil(), etc.
       * Must also stop the incoming stream from GRPC or it will leak.
       * RXJS operators like take(), takeUntil, etc. call complete() then unsubscribe().
       * Users can also unsubscribe() directly in which case the complete() method
       * will never run.
       */
      describe('unsubscribe from responseStream', () => {
        it('via take operator', done => {
          const { impl, server } = initServerPayload;
          const callObs = makeCall(false, 10);

          let nextCalls = 0;
          const expectedCalls = 2;

          callObs.pipe(take(expectedCalls)).subscribe({
            next: () => {
              expect(impl.sayMultiHello.holdingObservers.size).to.be.eql(1);
              nextCalls++;
            },
            error: maybeError => {
              done(maybeError);
            },
            complete: () => {
              setTimeout(() => {
                expect(nextCalls).to.be.eql(expectedCalls);
                expect(impl.sayMultiHello.holdingObservers.size).to.be.eql(0);
                // This next line is key, if stream is still open cancelCache will have length.
                // Checking its 0 ensures we've closed stream for good.
                expect(grpcAPI.cancelCache.size).to.be.eql(0);
                done();
              }, 50);
              conn.close();
              server.forceShutdown();
            }
          });
        });
        it('manually', done => {
          const { impl, server } = initServerPayload;
          const callObs = makeCall(false, 10);

          let nextCalls = 0;
          const expectedCalls = 4;

          const ret = callObs.subscribe({
            next: () => {
              expect(impl.sayMultiHello.holdingObservers.size).to.be.eql(1);
              nextCalls++;
              if (nextCalls === expectedCalls) {
                ret.unsubscribe();
              }
              if (nextCalls > expectedCalls) {
                throw new Error('Too many next calls');
              }
            },
            error: maybeError => {
              done(maybeError);
            },
            complete: () => {
              done(new Error('Unsubscribe should not run complete'));
            }
          });
          // add RXJS teardown logic called on unsubscribe
          ret.add(() => {
            conn.close();
            server.forceShutdown();
            setTimeout(() => {
              expect(nextCalls).to.be.eql(expectedCalls, 'nextCalls eql expectedCalls');
              expect(impl.sayMultiHello.holdingObservers.size).to.be.eql(0, 'holdingObservers eql 0');
              expect(grpcAPI.cancelCache.size).to.be.eql(0, 'cancelCache eql 0');
              done();
            }, 50); // give test connection time to shut down
          });
        });
        it('manually after delay so all responseStreams have come in', done => {
          const { impl, server } = initServerPayload;
          const callObs = makeCall(false, 10);

          let nextCalls = 0;
          const delay = 100;
          const expectedCalls = 4;

          const ret = callObs.pipe(rxjsDelay(delay)).subscribe({
            next: () => {
              expect(impl.sayMultiHello.holdingObservers.size).to.be.eql(1);
              nextCalls++;
              if (nextCalls === expectedCalls) {
                ret.unsubscribe();
              }
              if (nextCalls > expectedCalls) {
                throw new Error('Too many next calls');
              }
            },
            error: maybeError => {
              done(maybeError);
            },
            complete: () => {
              done(new Error('Unsubscribe should not run complete'));
            }
          });
          // add RXJS teardown logic called on unsubscribe
          ret.add(() => {
            conn.close();
            server.forceShutdown();
            setTimeout(() => {
              expect(nextCalls).to.be.eql(expectedCalls, 'nextCalls eql expectedCalls');
              expect(impl.sayMultiHello.holdingObservers.size).to.be.eql(0, 'holdingObservers eql 0');
              expect(grpcAPI.cancelCache.size).to.be.eql(0, 'cancelCache eql 0');
              done();
            }, 50); // give test connection time to shut down
          });
        });
      });
    });
  });
});
