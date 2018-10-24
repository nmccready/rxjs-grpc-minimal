const { Observable } = require('rxjs');

function mockService() {
  sayMultiHello.holdingObservers = new Set();

  return {
    sayHello({ value: { name } }) {
      return Observable.of({
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
      value: { name, numGreetings, doComplete = true }
    } = observable;

    return Observable.create(observer => {
      numGreetings = numGreetings || 1;
      while (--numGreetings >= 0) {
        observer.next({ message: reply(name) });
      }

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
