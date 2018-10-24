const { Server, ServerCredentials } = require('grpc');

const initServer = initService => ({ uri, grpcAPI, serviceName }) => {
  const server = new Server();
  const GrpcService = grpcAPI[serviceName];

  server.bind(uri, ServerCredentials.createInsecure());
  server.addService(GrpcService.service, initService());
  server.start();

  return {
    server,
    GrpcService
  };
};

module.exports = { initServer };
