const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '..', 'SCHEMA.md');

test('SCHEMA.md exists', () => {
  assert.ok(fs.existsSync(schemaPath));
});

test('SCHEMA.md contains key sections', () => {
  const content = fs.readFileSync(schemaPath, 'utf8');
  const sections = ['Overview', 'schema_version', 'RIBS_devices', 'RIBS_logs', 'RIBS_Data'];
  for (const section of sections) {
    assert.ok(content.includes(section), `Missing ${section} section`);
  }
});
