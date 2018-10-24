const { Server, ServerCredentials } = require('grpc');
const { toRxServer } = require('../../..');

const initServer = initService => ({ uri, grpcAPI, serviceName }) => {
  const server = new Server();
  const GrpcService = grpcAPI[serviceName];
  const impl = initService();

  server.bind(uri, ServerCredentials.createInsecure());
  server.addService(
    GrpcService.service,
    toRxServer(GrpcService, impl, serviceName)
  );
  server.start();

  return {
    server,
    GrpcService,
    impl
  };
};

module.exports = { initServer };
