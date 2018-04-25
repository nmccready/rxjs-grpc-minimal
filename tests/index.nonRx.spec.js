const JSONStream = require('JSONStream');
const through2 = require('through2');
const { loadObject, credentials } = require('grpc');
const { loadSync } = require('protobufjs');
const { expect } = require('chai');

const debug = require('../debug').spawn('test:helloworld');
const getProtoPath = require('./utils/getProtoPath');
const StringStream = require('./utils/StringStream');
const logStream = require('./utils/logStream');
const { initServer, reply } = require('../examples/helloworld/impls/server');
const { toRxClient } = require('../src');

const toGrpc = loadObject;

const protPath = getProtoPath(__dirname)(
  '../examples/helloworld/helloworld.proto'
);
const URI = '127.0.0.1:56001';

describe('helloworld', () => {
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

    describe('connection', () => {
      it('connect', () => {
        expect(conn).to.be.ok;
        expect(conn.$channel).to.be.ok;
      });

      describe('Greeter', () => {
        it('non stream', done => {
          const name = 'Bob';
          conn.sayHello({ name }, (err, resp) => {
            if (err) return done(err);
            expect(resp).to.deep.equal({ message: reply(name) });
            done();
          });
        });

        it('stream reply', done => {
          const name = 'Brody';
          let expectedCalls = 2;
          conn
            .sayMultiHello({ name, numGreetings: String(expectedCalls) })
            .once('error', done)
            .once('status', stat => {
              debug(() => ({ stat }));
            })
            .pipe(through2.obj(onData));

          function onData(resp, enc, cb) {
            debug({ resp });
            expect(resp).to.deep.equal({
              message: reply(name)
            });
            expectedCalls--;
            cb();
            if (!expectedCalls) {
              done();
            }
          }
        });
        it('streamish (entire req message is buffered) request, non-stream reply', done => {
          const name = 'STREAM';
          const stream = conn
            .streamSayHello((err, resp) => {
              expect(resp).to.deep.equal({ message: reply(name) });
              // setTimeout(done, 500);
              done();
            })
            .once('error', done)
            .once('status', stat => {
              debug(() => ({ stat }));
            });

          stream.write({ name });
          stream.end();
        });

        it('pure-stream still.. (entire req message is buffered to json)', done => {
          const name = 'STREAM';
          const stream = conn
            .streamSayHello((err, resp) => {
              expect(resp).to.deep.equal({ message: reply(name) });
              done();
            })
            .once('error', done)
            .once('status', stat => {
              debug(() => ({ stat }));
            });

          // let's pretend this stream came from a large file
          const clientStream = new StringStream(JSON.stringify({ name }));
          // pipe it out , log, make json (makes grpc happy), then send to client
          clientStream
            .pipe(logStream())
            .pipe(JSONStream.parse())
            .pipe(stream);
        });
      });
    });
  });
});
