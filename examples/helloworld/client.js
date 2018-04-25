const { loadObject, credentials } = require('grpc');
const { loadSync } = require('protobufjs');
const path = require('path');

const { toRxClient } = require('../../src');

async function main() {
  const protPath = path.join(__dirname, './helloworld.proto');
  const grpcAPI = toRxClient(
    loadObject(loadSync(protPath).lookup('helloworld'))
  );

  const greeter = new grpcAPI.Greeter(
    'localhost:50051',
    credentials.createInsecure()
  );

  await greeter.sayHelloRx({ name: 'world' }).forEach(response => {
    console.log(`Greeting: ${response.message}`);
  });

  await greeter
    .sayMultiHelloRx({ name: 'world', numGreetings: 3 })
    .forEach(response => {
      console.log(`Multi greeting: ${response.message}`);
    });
}

main().catch(error => console.error(error));
