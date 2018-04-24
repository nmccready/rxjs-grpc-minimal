const { Server, ServerCredentials } = require('grpc');

const through2 = require('through2');
const debug = require('../../debug').spawn('test:utils:helloServer');

function mockService() {
  return {
    sayHello(call, callback) {
      callback(null, { message: reply(call.request.name) });
    },
    streamSayHello(client, mainCb) {
      const dbg = debug.spawn('streamSayHello');
      let message;

      /*
        NOT USING LEGACY NODE STREAMS API 'data', and 'end'
        NOTE: https://github.com/substack/stream-handbook#classic-readable-streams
      */
      const transform = (m, enc, cb) => {
        dbg({ m });
        message = m;
        cb();
      };

      const flush = cb => {
        const { name } = message;
        mainCb(null, { message: reply(name) });
        cb();
      };

      client.pipe(through2.obj(transform, flush));
    },
    sayMultiHello(client) {
      // STREAMING RESPONSE
      const dbg = debug.spawn('sayMultiHello');
      /* eslint-disable camelcase, prefer-const */
      // SINGLE REQUEST
      let {
        request: { name, num_greetings }
      } = client;
      dbg({ name, num_greetings });
      num_greetings = num_greetings || 1;
      while (num_greetings-- >= 0) {
        dbg('wrote');
        client.write({ message: reply(name) });
      }
      dbg('end');
      client.end();
      /* eslint-enable camelcase */
    }
  };
}

function initServer({ uri, grpcAPI, serviceName }) {
  const server = new Server();
  const GrpcService = grpcAPI[serviceName];

  server.bind(uri, ServerCredentials.createInsecure());
  server.addService(GrpcService.service, mockService());
  server.start();

  return {
    server,
    GrpcService
  };
}

function reply(name) {
  return `Hello ${name}!`;
}

module.exports = {
  initServer,
  reply
};
