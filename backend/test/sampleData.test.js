const { test } = require('node:test');
const assert = require('node:assert');

test('sample RIBS data includes new fields', () => {
  const sampleRecord = {
    timestamp: new Date().toISOString(),
    device_id: 'test-device-123',
    latitude: 52.1234,
    longitude: 5.5678,
    speed: 5.5,
    direction: 180,
    distance_m: 1000,
    roughness: 2.5,
    vdv: 3.2,
    crest_factor: 1.8,
    z_values: [1.1, 1.2, 1.3, 1.4, 1.5],
    avg_speed: 5.2,
    interval_s: 1.0,
    algorithm_version: '1.0'
  };

  assert.ok('vdv' in sampleRecord);
  assert.ok('crest_factor' in sampleRecord);
});
