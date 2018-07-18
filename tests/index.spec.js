const { loadObject, credentials } = require('grpc');
const { loadSync } = require('protobufjs');
const { expect } = require('chai');
const { Subject, ReplaySubject, Observable } = require('rxjs');

const getProtoPath = require('./utils/getProtoPath');
const server = require('../examples/helloworld/impls/server');
const serverRx = require('../examples/helloworld/impls/serverRx');
const { toRxClient } = require('../src');

const toGrpc = loadObject;

const protPath = getProtoPath(__dirname)(
  '../examples/helloworld/helloworld.proto'
);
const URI = '127.0.0.1:56001';
const servers = { server, serverRx };

for (const name in servers) {
  runSuite(servers[name], name);
}

function runSuite({ initServer, reply }, serverName) {
  describe(`Rx helloworld with ${serverName}`, () => {
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

        initServerPayload = initServer({
          uri: URI,
          grpcAPI,
          serviceName: 'Greeter'
        });

        conn = new initServerPayload.GrpcService(
          URI,
          credentials.createInsecure()
        );
      });

      afterEach(() => {
        const { server } = initServerPayload;
        conn.close();
        if (server) server.forceShutdown();
        initServerPayload = undefined;
      });

      it('created', () => {
        expect(initServerPayload.GrpcService).to.be.ok;
      });

      // grpc (grpc-node) 1.11.x breaking change
      it('$method_names is not a function', () => {
        /* eslint-disable camelcase */
        const { $method_names } = initServerPayload.GrpcService.prototype;
        expect($method_names).to.be.ok;
        expect(typeof $method_names).to.be.eql('object');
        /* eslint-enable camelcase */
      });

      describe('connection', () => {
        it('connect', () => {
          expect(conn).to.be.ok;
          expect(conn.$channel).to.be.ok;
        });

        describe('Greeter', () => {
          it('non stream', () => {
            const name = 'Bob';
            return conn.sayHelloRx({ name }).forEach(resp => {
              expect(resp).to.deep.equal({ message: reply(name) });
            });
          });

          describe('stream reply', () => {
            let callObs, name;
            let expectedCalls = 2;

            function makeCall(doComplete = true) {
              name = 'Brody';
              callObs = conn.sayMultiHelloRx({
                name,
                numGreetings: expectedCalls,
                doComplete
              });
            }

            it('works', () => {
              makeCall();
              return callObs
                .forEach(resp => {
                  expect(resp).to.deep.equal({
                    message: reply(name)
                  });
                  expectedCalls--;
                })
                .then(() => expect(expectedCalls).to.equal(0));
            });

            it('has .grpcCancel', () => {
              makeCall();
              return callObs.forEach(resp => {}).then(() => {
                expect(callObs.grpcCancel).to.be.ok;
              });
            });

            it('cancelCache is empty upon completion', done => {
              makeCall(true); // complete!
              return callObs.subscribe({
                next() {
                  console.log('called next');
                },
                error: done,
                complete() {
                  expect(grpcAPI.cancelCache.size).to.be.equal(0);
                  done();
                }
              });
            });

            it('cancelCache is cleaned on cancel (when un-completed)', (done) => {
              makeCall(false);
              return callObs.subscribe({
                next() {
                  expectedCalls--;
                  console.log('called next');
                  if (expectedCalls === 0) {
                    callObs.grpcCancel();
                  }
                  // callObs.grpcCancel();
                  // expect(Object.keys(grpcAPI.cancelCache).length).to.be.equal(0);
                },
                error: (cancelError) => {
                  // we full expect the cancel error
                  console.log(cancelError.message);
                  expect(grpcAPI.cancelCache.size).to.be.equal(0);
                  done();
                },
                complete() {
                  throw new Error('should not complete');
                }
              });
            });
          });

          it('streamish - ReplaySubject', () => {
            const name = 'ReplaySubject';
            const writer = new ReplaySubject();
            const observable = conn.streamSayHelloRx(writer);

            writer.next({ name }); // buffered for replay!
            writer.complete();

            // internal observable actually loads into memory now!
            return observable
              .forEach(resp => {
                expect(resp).to.deep.equal({ message: reply(name) });
              })
              .then(() => {
                writer.unsubscribe();
              });
          });

          it('streamish - Subject', () => {
            const name = 'Subject';
            const writer = new Subject();
            const observable = conn.streamSayHelloRx(writer);

            const promise = observable
              .forEach(resp => {
                expect(resp).to.deep.equal({ message: reply(name) });
              })
              .then(() => {
                writer.unsubscribe();
              });
            // ok we're now subscribed
            writer.next({ name });
            writer.complete();

            return promise;
          });

          it('streamish - of', () => {
            const name = 'of';
            return conn
              .streamSayHelloRx(Observable.of({ name }))
              .forEach(resp => {
                expect(resp).to.deep.equal({ message: reply(name) });
              });
          });
        });
      });
    });
  });
}
