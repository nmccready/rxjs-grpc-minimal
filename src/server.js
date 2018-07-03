const { Observable } = require('rxjs');
const through2 = require('through2');

const debug = require('../debug').spawn('server');

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
              observer.error(new Error(`Call to "${name}" cancelled.`));
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
      dbg(() => 'responseStream');
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
