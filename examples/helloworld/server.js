const { loadObject } = require('grpc');
const { loadSync } = require('protobufjs');
const path = require('path');

const { initServer } = require('./impls/serverRx');

async function main() {
  const protPath = path.join(__dirname, './helloworld.proto');
  const grpcAPI = loadObject(loadSync(protPath).lookup('helloworld'));

  initServer({
    uri: 'localhost:50051',
    grpcAPI,
    serviceName: 'Greeter'
  });
}

main().catch(error => console.error(error));
