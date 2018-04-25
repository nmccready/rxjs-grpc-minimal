const { loadObject, credentials } = require('grpc');
const { loadSync } = require('protobufjs');
const path = require('path');

const { toRxClient } = require('../../src');

// NOTE: This example overrides all grpc api with Rx
// therefore all functions do not need Rx
async function main() {
  const protPath = path.join(__dirname, './helloworld.proto');
  const grpcAPI = toRxClient(
    loadObject(loadSync(protPath).lookup('helloworld')),
    '' // OVERRIDE
  );

  const greeter = new grpcAPI.Greeter(
    'localhost:50051',
    credentials.createInsecure()
  );

  await greeter.sayHello({ name: 'world 2' }).forEach(response => {
    console.log(`Greeting: ${response.message}`);
  });

  await greeter
    .sayMultiHello({ name: 'world 2', numGreetings: 3 })
    .forEach(response => {
      console.log(`Multi greeting: ${response.message}`);
    });
}

main().catch(error => console.error(error));
