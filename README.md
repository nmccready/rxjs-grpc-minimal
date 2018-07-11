[![Build Status](https://travis-ci.org/nmccready/rxjs-grpc-minimal.svg?branch=master)](https://travis-ci.org/nmccready/rxjs-grpc-minimal)
[![npm version](https://badge.fury.io/js/rxjs-grpc-minimal.svg)](https://badge.fury.io/js/rxjs-grpc-minimal)

# rxjs-grpc-minimal

Based off the great work of [rxjs-grpc](https://github.com/kondi/rxjs-grpc). However, this library intends to
very little except to offer you to wrap your server or client GRPC implementation the way you want it.

There is no cli as this library is trying to stay out of the way and allow grpc, or protobufjs do the amazing things they already do.

## Install

```bash
> yarn add rxjs-grpc-minimal
```

## Usage

### Client

```js
const path = require('path');
const { loadSync } = require('protobufjs');
const { loadObject: toGrpc, credentials } = require('grpc');
const { Subject, ReplaySubject } = require('rxjs');

const {
  toRxClient, // used most often
  toRxServer, // used most often
  utils,
  errors
} = require('rxjs-grpc-minimal');

const pbAPI = loadSync(
    path.join(__dirname,'../examples/helloworld/helloworld.proto'))
  .lookup('helloworld');

/*
Wraps all service.prototype methods with RXJS implementations.
Each method is appended to the prototype as `method${RX}` by default.
Thus allowing you access to both RX and nonRx grpc implementations.
*/
const grpcAPI = toRxClient(toGrpc(pbAPI));
/*
Wraps all service.prototype methods with RXJS implementations. However,
this overrides / overwrites all original prototype methods with the RX impl.
*/
const grpcApiOverride = toRxClient(toGrpc(pbAPI), '');

const greeter = new grpcAPI.Greeter('localhost:56001', credentials.createInsecure());

// non stream
conn.sayHelloRx({ name: 'Bob' });
.forEach(resp => {
    console.log(grpcAPI.cancelCache.size) // 0
    console.log(resp); // { message: 'Hello Bob' } // depends on server
  })

let calls = 0;

// STREAMING REPLY FROM SERVER
conn.sayMultiHelloRx({
  name: 'Brody',
  numGreetings: 2,
  doComplete: true
})
.forEach(resp => {
  calls++;
  console.log({ size: grpcAPI.cancelCache.size})
  console.log(resp)
})
.then(() => {
  console.log({ size: grpcAPI.cancelCache.size})
  console.log({ calls })
});

calls = 0;

/* console out

{ size: 1 }
{ message: 'Hello Brody' }
{ size: 1 }
{ message: 'Hello Brody' }
{ size: 0 }
{ calls: 2 }
*/

// streaming reply from server
const multiHelloStream = conn.sayMultiHelloRx({
  name: 'Brody',
  numGreetings: 2,
  doComplete: true
})
.forEach(resp => {
  calls++;
  console.log({ size: grpcAPI.cancelCache.size})
  console.log(resp)
  // imagine you need to cancel this stream in between and abort early
  multiHelloStream.grpcCancel();
})
.then(() => {
  console.log({ size: grpcAPI.cancelCache.size})
  console.log({ calls })
});
calls = 0;
/* console out

{ size: 1 }
{ message: 'Hello Brody' }
{ size: 0 }
{ calls: 1 }
*/

// STREAMING REQUEST | client streaming to server
const writer = new Subject();
const observable = conn.streamSayHelloRx(writer);

observable
.forEach(resp => {
  calls++;
  console.log(resp);
  console.log({ calls });
})
.then(() => {
  writer.unsubscribe();
});

console(grpcAPI.cancelCache.size) // 1
// ok we're now subscribed
writer.next({ name:  'Al' });
writer.next({ name: 'Bundy' });
writer.complete();

console.log(grpcAPI.cancelCache.size) // 0

/* console out

1
{ message: 'Hello Al' }
{ calls: 1 }
{ message: 'Hello Bundy' }
{ calls: 2 }
0
*/

// CONNECTION CLEANUP
/*
Imagine we abort in between or crash but catch the problem.
prior to conn.close we could clean up all.

This guarantees that the observer on the sever side is cleaned up and released.
This also allows you to truly close your connection without dangling a channel/subchannel.
*/
grpcAPI.cancelCache.forEach((cancel) => cancel());
conn.close();
```

### Server

See [serverRx.js](./examples/helloworld/impls/serverRx.js)

## API

### toRxClient(grpcObject, methodExt)

- #### grpcObject

  Type: `Object` - initially created by `grpc.loadObject` w or w/o protobufjs `load`|`loadSync`

- #### methodExt

  Type: `String` - defaults to `'Rx'`

  This is the method naming extension where the original method name is appended
  with `something{RX}`.

  ```js
  greeter.sayMultiHelloRx // RX function
  greeter.sayMultiHello // node stream function, and other functions could be callback, callback and steams

  toRxClient(grpcAPI, '');
  // ...
  greeter.sayMultiHello // RX function all node stream, callback etc hidden / wrapped
  // NOTE: all RX functions will always return observables (consistent!) .
  ```

### toRxServer(service, rxImpl, serviceName)

- #### service

  Type: `Object` - GrpcService definition `grpcAPI[serviceName]`

- #### rxImpl

  Type: `Object` - Your RxJS server implementation which matches the service method handles
  to be implemented.

- #### serviceName (optional)

  Type: `String` - aids in [debug](./debug.js) via [debug-fabulous](https://github.com/nmccready/debug-fabulous) logging.
