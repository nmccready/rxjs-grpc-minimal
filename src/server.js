function create(Service, rxImpl) {
  const service = {};
  for (const name in Service.prototype) {
    if (typeof rxImpl[name] === 'function') {
      service[name] = createMethod(rxImpl, name, Service.prototype);
    }
  }
  return service;
}

function createMethod(rxImpl, name, serviceMethods) {
  return serviceMethods[name].responseStream
    ? createStreamingMethod(rxImpl, name)
    : createUnaryMethod(rxImpl, name);
}

function createUnaryMethod(rxImpl, name) {
  return function(call, callback) {
    const response = rxImpl[name](call.request, call.metadata);
    response.subscribe(data => callback(null, data), error => callback(error));
  };
}

function createStreamingMethod(rxImpl, name) {
  return async function(call, callback) {
    const obsResponse = rxImpl[name](call.request, call.metadata);
    await obsResponse.forEach(data => call.write(data));
    call.end();
  };
}

module.exports = {
  create,
  createMethod,
  createStreamingMethod
};
