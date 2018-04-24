const path = require('path');

module.exports = (_paths) => (...args) => {
  let paths = _paths;
  if (!Array.isArray(paths)) {
    paths = [paths];
  }
  return path.join.apply(null, paths.concat(args));
};
