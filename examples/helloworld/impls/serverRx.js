const { Server, ServerCredentials } = require('grpc');
const { Observable } = require('rxjs');
const { toRxServer } = require('../../../src');

function mockService() {
  return {
    sayHello({ value: { name } }) {
      return Observable.of({
        message: reply(name)
      });
    },
    streamSayHello(observable) {
      return Observable.create(async observer => {
        await observable.forEach(val => {
          observer.next({ message: reply(val.name) });
        });
        observer.complete();
      });
    },
    sayMultiHello({ value: { name, numGreetings } }) {
      return Observable.create(observer => {
        numGreetings = numGreetings || 1;
        while (--numGreetings >= 0) {
          observer.next({ message: reply(name) });
        }
        observer.complete();
      });
      /* eslint-enable camelcase */
    }
  };
}

function initServer({ uri, grpcAPI, serviceName }) {
  const server = new Server();
  const GrpcService = grpcAPI[serviceName];

  server.bind(uri, ServerCredentials.createInsecure());
  server.addService(
    GrpcService.service,
    toRxServer(GrpcService, mockService(), serviceName)
  );
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
