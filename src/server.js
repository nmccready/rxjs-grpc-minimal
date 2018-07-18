const { Observable } = require('rxjs');
const through2 = require('through2');

const debug = require('../debug').spawn('server');

class CanceledError extends Error {}

function create(Service, rxImpl, serviceName) {
  const service = {};
  const dbg = serviceName ? debug.spawn(serviceName) : debug;
  for (const name in Service.prototype) {
    if (typeof rxImpl[name] === 'function') {
      service[name] = createMethod(
        rxImpl,
        name,
        Service.prototype,
        dbg.spawn(name)
      );
    }
  }
  return service;
}

function createMethod(rxImpl, name, methods, dbg) {
  const serviceMethod = methods[name];
  return async function(call, callback) {
    let observable = Observable.of(call.request);
    dbg(() => 'called');
    if (serviceMethod.requestStream) {
      dbg(() => 'requestStream');
      observable = new Observable(observer => {
        call.pipe(through2.obj(onData, onEnd));
        call.on('error', observer.error);

        function onData(data, _, cb) {
          observer.next(data);
          cb();
        }

        function onEnd(cb) {
          setImmediate(() => {
            if (call.cancelled) {
              /*
              TODO: DEBATING ON WHETHER THIS SHOULD BE AN ERROR OBJECT
              We're using error event here to signal cancellation.
              which is not is not really an error; its an additional state.
              It would be nice to have
              observer.cancelled(SomeObject|String);

              I would love to hear other ideas.

              NOTE: grpc-node emits cancel errors so I guess we should follow this.
              */
              observer.error(new CanceledError(`Call to "${name}" cancelled.`));
            } else {
              observer.complete();
            }
          });
          call.removeListener('error', observer.error);
          cb();
        }
      });
    }

    const response = rxImpl[name](observable, call);
    if (serviceMethod.responseStream) {
      dbg(() => 'responseStream');
      call.once('cancelled', () => {
        call.end();
      });
      await response.forEach(data => call.write(data));
      call.end();
    } else {
      response.subscribe(
        data => callback(null, data),
        error => callback(error)
      );
    }
  };
}

module.exports = {
  create,
  createMethod,
  errors: {
    CanceledError
  }
};
