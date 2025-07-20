const { test } = require('node:test');
const assert = require('node:assert');
const database = require('../database');

test('required database functions exist', () => {
  const required = [
    'initializeDatabase',
    'ensureTables',
    'ensureSchemaVersionTable',
    'ensureDevicesTable',
    'ensureLogsTable',
    'ensureRibsDataTable',
    'applySchemaUpgrades',
    'getCurrentSchemaVersion',
    'insertLog',
    'getLogs',
    'insertRibsData',
    'getRibsData'
  ];

  for (const fn of required) {
    assert.strictEqual(typeof database[fn], 'function', `${fn} should be a function`);
  }
});

// Version comparison helper from legacy script
function compareVersions(v1, v2) {
  const v1parts = v1.split('.').map(Number);
  const v2parts = v2.split('.').map(Number);
  for (let i = 0; i < Math.max(v1parts.length, v2parts.length); i++) {
    const v1part = v1parts[i] || 0;
    const v2part = v2parts[i] || 0;
    if (v1part < v2part) return -1;
    if (v1part > v2part) return 1;
  }
  return 0;
}

test('compareVersions utility works', () => {
  assert.strictEqual(compareVersions('1.0.0', '1.1.0'), -1);
  assert.strictEqual(compareVersions('1.2.0', '1.1.0'), 1);
  assert.strictEqual(compareVersions('1.2.0', '1.2.0'), 0);
});
