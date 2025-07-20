const { test } = require('node:test');
const assert = require('node:assert');
const logger = require('../logger');

test('logger exposes helper methods', () => {
  const methods = ['info', 'warn', 'error', 'debug', 'log', 'request', 'database', 'api'];
  for (const m of methods) {
    assert.strictEqual(typeof logger[m], 'function', `${m} should be a function`);
  }
});
