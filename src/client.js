const { Observable } = require('rxjs');
const though2 = require('through2');

const { getServiceNames } = require('../src/utils');

const debug = require('../debug').spawn('client');
/**
 * @param  {Object} grpcApi - pre-loaded grpcApi
 * @param  {String} methExt - your choice to extend or override the methodNames
 */
function create(grpcApi, methExt = 'Rx') {
  /*
    cancelCache

    This is a way to expose the underlying call.cancel(s) so that
    a underlying channel can be truly cleaned up.

    If a call is not canceled and Client.close is called, the underlying
    subchannel will hold on to it's reference and leak observers on the server.

    Therefore in some cases we need to clean up all cancellables when cleaning
    connections.

    TODO: Call all cancels and clearCancel cache upon client.close.
    Therefore wrap.close for all ServiceClient(s).
  */
  const cancelCache = new Set(); // this might need to be call cache
  grpcApi.cancelCache = cancelCache;

  for (const name of getServiceNames(grpcApi)) {
    const service = grpcApi[name];
    const dbg = debug.spawn(name);
    for (const methName of Object.keys(service.prototype)) {
      const origFn = service.prototype[methName];
      if (typeof origFn !== 'function') {
        continue;
      }
      service.prototype[`${methName}${methExt}`] = createMethod(
        origFn,
        dbg.spawn(methName),
        cancelCache
      );
    }
  }

  return grpcApi;
}

function createMethod(clientMethod, dbg, cancelCache) {
  function rxWrapper(...args) {
    dbg(() => 'called');
    /* NOTE: BE AWARE
    This Observable is lazy! So know what kind of observers your passing in!
    Subject / vs ReplaySubject might miss some entities!
    */
    const retObs = new Observable(observer => {
      const handler = (error, data) => {
        const d = dbg.spawn('handler');
        if (error) {
          d(() => ({ error }));
          observer.error(error);
        } else {
          d(() => ({ data }));
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
        const d = dbg.spawn('responseStream');
        const onData = (data, _, cb) => {
          d(() => ({ data }));
          observer.next(data);
          cb();
        };
        const onError = error => {
          d(() => ({ error }));
          observer.error(error);
        };

        const onEnd = cb => {
          grpcComplete();
          cb();
          call.removeListener('error', onError);
        };

        call.pipe(though2.obj(onData, onEnd));
        call.on('error', onError);
      }

      if (clientMethod.requestStream) {
        const d = dbg.spawn('requestStream');
        const observable = args[0];
        /* ducktyping , tried intanceof and it is not reliable */
        if (!observable || !observable.subscribe || !observable.forEach) {
          return observer.error(
            new Error('Observable required to subscribe to')
          );
        }

        observable.subscribe({
          next: data => {
            d(() => ({ data }));
            call.write(data);
          },
          error: () => {
            d(() => 'error canceling');
            grpcCancel();
          },
          complete: () => {
            call.end();
          }
        });
      }
      if (retObs.grpcCancel) {
        return console.warn('Observable.grpcCancel already exists');
      }

      function grpcComplete() {
        dbg(() => 'complete');
        cancelCache.delete(grpcCancel);
        observer.complete();
      }

      function grpcCancel() {
        dbg(() => 'canceled');
        cancelCache.delete(grpcCancel);
        call.cancel();
      }
      if (call.cancel) {
        cancelCache.add(grpcCancel);
        retObs.grpcCancel = grpcCancel;
      }
    });
    return retObs;
  }
  // copy over useful fields like, requestStream, responseStream etc..
  Object.assign(rxWrapper, clientMethod);
  return rxWrapper;
}

module.exports = {
  create,
  createMethod
};
