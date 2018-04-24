const through = require('through2');
const debug = require('../../debug').spawn('logStream');

function logHandle(chunk, _, cb) {
  const dbg = debug.spawn('logHandle');
  if (typeof chunk !== 'string' && !(chunk instanceof Buffer)) {
    dbg(() => JSON.stringify(chunk));
  } else {
    dbg(() => String(chunk));
  }

  this.push(chunk);
  cb();
}

module.exports = function logStream() {
  return through.obj(logHandle);
};

module.exports.logHandle = logHandle;
