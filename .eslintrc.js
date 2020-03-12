module.exports = {
  env: {
    browser: true,
    es6: true,
    node: true
  },
  extends: [
    'standard'
  ],
  globals: {
    Atomics: 'readonly',
    SharedArrayBuffer: 'readonly'
  },
  parserOptions: {
    ecmaVersion: 2018
  },
  rules: {
    "brace-style": 0,
    "no-redeclare" : 1,
    "no-unused-vars" : 1,
    "curly" : 0,
    "no-inner-declarations" : 0,
    "prefer-const" : 1,
    "camelcase" : 0,
    "dot-notation" : 0,
    "padded-blocks" : 1,
    "quotes" : 1,
    "quote-props" : 1,
    "no-trailing-spaces" : 1

  }
}
