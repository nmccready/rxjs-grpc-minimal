const { Observable } = require('rxjs');
const through2 = require('through2');

function create(Service, rxImpl) {
  const service = {};
  for (const name in Service.prototype) {
    if (typeof rxImpl[name] === 'function') {
      service[name] = createMethod(rxImpl, name, Service.prototype);
    }
  }
  return service;
}

function createMethod(rxImpl, name, methods) {
  const serviceMethod = methods[name];
  return async function(call, callback) {
    let observable = Observable.of(call.request);
    if (serviceMethod.requestStream) {
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
              observer.error(
                new Error(`Call to "${name}" cancelled.`)
              );
            } else {
              observer.complete();
            }
          });
          call.removeListener('error', observer.error);
          cb();
        }
      });
    }

    const response = rxImpl[name](observable, call.metadata);
    if (serviceMethod.responseStream) {
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
  createMethod
};
