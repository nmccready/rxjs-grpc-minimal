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
const servers = {
  server,
  serverRx
};

const debug = require('../debug').spawn('test:index');

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
          describe('non stream', () => {
            it('works', () => {
              const name = 'Bob';
              const obs = conn.sayHelloRx({ name });
              return obs
                .forEach(resp => {
                  expect(obs.grpcCancel).to.not.be.ok;
                  expect(grpcAPI.cancelCache.size).to.be.eql(0);
                  expect(resp).to.deep.equal({ message: reply(name) });
                })
                .then(() => {
                  expect(grpcAPI.cancelCache.size).to.be.eql(0);
                });
            });
          });

          describe('stream reply', () => {
            let name;
            let expectedCalls;

            function makeCall(doComplete = true) {
              expectedCalls = 2;
              name = 'Brody';

              return conn.sayMultiHelloRx({
                name,
                numGreetings: expectedCalls,
                doComplete
              });
            }

            it('works', () => {
              const callObs = makeCall(true);
              return callObs
                .forEach(resp => {
                  expect(callObs.grpcCancel).to.be.ok;
                  expect(grpcAPI.cancelCache.size).to.be.eql(1);
                  expect(resp).to.deep.equal({
                    message: reply(name)
                  });
                  expectedCalls--;
                })
                .then(() => {
                  expect(grpcAPI.cancelCache.size).to.be.equal(0);
                  expect(expectedCalls).to.equal(0);
                });
            });

            it('has .grpcCancel', () => {
              const callObs = makeCall();
              return callObs
                .forEach(resp => {})
                .then(() => {
                  expect(callObs.grpcCancel).to.be.ok;
                });
            });

            it('cancelCache is empty upon completion', done => {
              const callObs = makeCall(true); // complete!
              return callObs.subscribe({
                next() {
                  expect(callObs.grpcCancel).to.be.ok;
                  expect(grpcAPI.cancelCache.size).to.be.eql(1);
                  debug(() => 'called next');
                },
                error: done,
                complete() {
                  expect(grpcAPI.cancelCache.size).to.be.equal(0);
                  done();
                }
              });
            });

            it('cancelCache is cleaned on cancel (when un-completed)', done => {
              const callObs = makeCall(false);
              return callObs.subscribe({
                next() {
                  expect(callObs.grpcCancel).to.be.ok;
                  expect(grpcAPI.cancelCache.size).to.be.eql(1);
                  expectedCalls--;
                  debug(() => 'called next');
                  if (expectedCalls === 0) {
                    callObs.grpcCancel();
                  }
                  // callObs.grpcCancel();
                  // expect(Object.keys(grpcAPI.cancelCache).length).to.be.equal(0);
                },
                error: cancelError => {
                  // we full expect the cancel error
                  debug(() => cancelError.message);
                  expect(grpcAPI.cancelCache.size).to.be.equal(0);
                  done();
                },
                complete() {
                  throw new Error('should not complete');
                }
              });
            });
          });
          describe('streamed request', () => {
            it('ReplaySubject - streamed | completed ahead of consumption', () => {
              const name = 'ReplaySubject';
              const writer = new ReplaySubject();
              const observable = conn.streamSayHelloRx(writer);

              writer.next({ name }); // buffered for replay!
              writer.complete();

              // internal observable actually loads into memory now!
              return observable
                .forEach(resp => {
                  expect(observable.grpcCancel).to.not.be.ok;
                  expect(grpcAPI.cancelCache.size).to.be.eql(0);
                  expect(resp).to.deep.equal({ message: reply(name) });
                })
                .then(() => {
                  expect(grpcAPI.cancelCache.size).to.be.eql(0);
                  writer.unsubscribe();
                });
            });

            it('Subject - post streaming', () => {
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

              expect(observable.grpcCancel).to.be.ok;
              expect(grpcAPI.cancelCache.size).to.be.eql(1);
              // ok we're now subscribed
              writer.next({ name });
              writer.complete();

              expect(grpcAPI.cancelCache.size).to.be.eql(0);

              return promise;
            });

            it('streamish - of', () => {
              const name = 'of';
              return conn
                .streamSayHelloRx(Observable.of({ name }))
                .forEach(resp => {
                  expect(grpcAPI.cancelCache.size).to.be.eql(0);
                  expect(resp).to.deep.equal({ message: reply(name) });
                });
            });
          });
        });
      });
    });
  });
}
