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
// const debug = require('../debug').spawn('test:index');

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

      function makeCall(doComplete = true, expectedCalls = 2) {
        name = 'Brody';

        return conn.sayMultiHelloRx({
          name,
          numGreetings: expectedCalls,
          doComplete
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

      describe.only('unsubscribe', () => {
        it('queueing many calls and unsubscribe early', done => {
          const { impl, server } = initServerPayload;
          const callObs = makeCall(false, 10);

          let nextCalls = 0;
          const delay = 25;
          const expectedCalls = 2;

          const ret = callObs.delay(delay).subscribe({
            next: () => {
              expect(impl.sayMultiHello.holdingObservers.size).to.be.eql(1);
              nextCalls++;
            },
            error: maybeError => {
              // done(maybeError);
            },
            complete: () => {
              // we should unsub before getting a completion
              done(new Error('should not complete'));
            }
          });

          // wait an amount of time to get some expected calls
          setTimeout(() => {
            ret.unsubscribe();

            setTimeout(() => {
              expect(nextCalls).to.be.eql(expectedCalls);
              // expect(impl.sayMultiHello.holdingObservers.size).to.be.eql(0);
              // expect(grpcAPI.cancelCache.size).to.be.eql(0);
              done();
            }, 50);

            conn.close();
            server.forceShutdown(done);
          }, delay * expectedCalls);
        });
      });
    });
  });
});
