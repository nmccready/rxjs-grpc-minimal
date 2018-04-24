module.exports = {
  createServer: require('./server').create,
  createClient: require('./client').create,
  getServiceNames
};

function getServiceNames(pkg) {
  return Object.keys(pkg).filter(name => pkg[name].service);
}
