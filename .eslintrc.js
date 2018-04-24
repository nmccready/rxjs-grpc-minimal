module.exports = {
  env: {
    node: true,
    commonjs: true,
    es6: true
  },
  extends: 'standard',
  rules: {
    'no-var': 'error',
    'space-before-function-paren': 0,
    'prefer-const': 'error',
    semi: ['error', 'always']
  },
  overrides: {
    files: ['tests/**/*spec.js'],
    env: {
      jest: true
    },
    rules: {
      'handle-callback-err': 0
    }
  }
};
