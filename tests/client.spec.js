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

      it.only('rxWrapper is called once', () => {
        const { impl, server } = initServerPayload;
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
    });
  });
});
