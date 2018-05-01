const { Observable } = require('rxjs');
const though2 = require('through2');
const { getServiceNames } = require('../src/utils');
/**
 * @param  {Object} grpcApi - pre-loaded grpcApi
 * @param  {String} methExt - your choice to extend or override the methodNames
 */
function create(grpcApi, methExt = 'Rx') {
  for (const name of getServiceNames(grpcApi)) {
    const service = grpcApi[name];
    for (const methName of Object.keys(service.prototype)) {
      const origFn = service.prototype[methName];
      service.prototype[`${methName}${methExt}`] = createMethod(origFn);
    }
  }

  return grpcApi;
}

function createMethod(clientMethod) {
  return function(...args) {
    /* NOTE: BE AWARE
    This Observable is lazy! So know what kind of observers your passing in!
    Subject / vs ReplaySubject might miss some entities!
    */
    return new Observable(observer => {
      const handler = (error, data) => {
        if (error) {
          observer.error(error);
        } else {
          observer.next(data);
        }
        observer.complete();
      };

      let call;
      const actualHandler = clientMethod.responseStream ? undefined : handler;
      if (clientMethod.requestStream) {
        call = clientMethod.call(this, actualHandler);
      } else {
        call = clientMethod.apply(this, [...args, actualHandler]);
      }

      if (clientMethod.responseStream) {
        const onData = (data, _, cb) => {
          observer.next(data);
          cb();
        };
        const onError = error => observer.error(error);

        const onEnd = cb => {
          observer.complete();
          cb();
          call.removeListener('error', onError);
        };

        call.pipe(though2.obj(onData, onEnd));
        call.on('error', onError);
      }

      if (clientMethod.requestStream) {
        const observable = args[0];
        /* ducktyping , tried intanceof and it is not reliable */
        if (!observable || !observable.subscribe || !observable.forEach) {
          return observer.error(
            new Error('Observable required to subscribe to')
          );
        }

        observable.subscribe({
          next: value => {
            call.write(value);
          },
          error: () => {
            call.cancel();
          },
          complete: () => {
            call.end();
          }
        });
      }
    });
  };
}

module.exports = {
  create,
  createMethod
};
