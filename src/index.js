const server = require('./server');
module.exports = {
  toRxServer: server.create,
  toRxClient: require('./client').create,
  utils: require('./utils'),
  errors: {
    server: server.errors
  }
};
