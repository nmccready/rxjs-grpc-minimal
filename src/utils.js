function getServiceNames(grpcApi) {
  const keys = Object.keys(grpcApi);
  const serviceNames = keys.filter(name => {
    try {
      return grpcApi[name].service;
    } catch (e) {}
  });

  return serviceNames;
}

module.exports = {
  getServiceNames
};
