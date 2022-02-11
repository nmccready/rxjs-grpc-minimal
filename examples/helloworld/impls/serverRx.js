const { of, Observable } = require('rxjs');

const debug = require('../../../debug').spawn('serverRx');

function mockService() {
  sayMultiHello.holdingObservers = new Set();

  return {
    sayHello({ value: { name } }) {
      return of({
        message: reply(name)
      });
    },
    streamSayHello(observable) {
      return Observable.create(async observer => {
        await observable.forEach(val => {
          observer.next({ message: reply(val.name) });
        });
        observer.complete();
      });
    },
    sayMultiHello
  };

  function sayMultiHello(observable, call) {
    let {
      // eslint-disable-next-line
      value: { name, numGreetings = 1, doComplete = true, delayMs }
    } = observable;

    debug(() => ({ name, numGreetings, doComplete, delayMs }));

    return Observable.create(observer => {
      const loop = () => {
        const loopIt = () => {
          numGreetings--;
          if (numGreetings < 0) return;
          observer.next({ message: reply(name) });
          loop();
        };
        if (!delayMs) {
          return loopIt();
        }
        setTimeout(loopIt, delayMs);
      };
      loop();

      if (doComplete) {
        // we do not always need to complete
        // sometimes we want to stream data until canceled or
        // told to stop by the application
        return observer.complete();
      }
      const subscription = observable.subscribe({
        error: () => remove()
      });
      call.once('cancelled', remove);
      sayMultiHello.holdingObservers.add(subscription);
      function remove() {
        sayMultiHello.holdingObservers.delete(subscription);
        observer.complete();
      }
    });
  }
}

const initServer = require('../../../src/utils/testHelpers/serverRx').initServer(
  mockService
);

function reply(name) {
  return `Hello ${name}!`;
}

module.exports = {
  initServer,
  reply
};
