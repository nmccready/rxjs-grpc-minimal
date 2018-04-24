const { Observable } = require('rxjs');
const though2 = require('through2');

function create(GrpcClient, args) {
  const grpcClient = new GrpcClient(...args);
  const rxClient = {};
  for (const name of Object.keys(GrpcClient.prototype)) {
    rxClient[name] = createMethod(grpcClient, name);
  }
  return rxClient;
}

function createMethod(grpcClient, name) {
  return grpcClient[name].responseStream
    ? createStreamingMethod(grpcClient, name)
    : createUnaryClientMethod(grpcClient, name);
}

function createUnaryClientMethod(grpcClient, name) {
  return function(...args) {
    return new Observable(observer => {
      grpcClient[name](...args, (error, data) => {
        if (error) {
          observer.error(error);
        } else {
          observer.next(data);
        }
        observer.complete();
      });
    });
  };
}

function createStreamingMethod(grpcClient, name) {
  return function(...args) {
    return new Observable(observer => {
      const call = grpcClient[name](...args);

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
    });
  };
}

module.exports = {
  create,
  createMethod,
  createStreamingMethod
};
