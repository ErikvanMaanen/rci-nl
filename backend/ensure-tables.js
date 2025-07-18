// This module ensures the required tables exist and are up-to-date.
const database = require('./database');

// Simple logging function for table creation (avoid circular dependency with logger.js)
async function log(message, level = 'INFO', source = 'DATABASE') {
  try {
    await database.insertLog(message, level, source);
  } catch (err) {
    // Don't log logging failures here to avoid infinite loops
    console.error('Logging failed in ensure-tables:', err);
  }
}

async function ensureTables() {
  try {
    console.log(`[DB] Starting schema check/update process (target version: ${database.CURRENT_SCHEMA_VERSION})`);
    await log(`Starting schema check/update process (target version: ${database.CURRENT_SCHEMA_VERSION})`, 'INFO', 'SCHEMA');
    
    // Get current schema version before starting
    const currentVersion = await database.getCurrentSchemaVersion();
    console.log(`[DB] Current schema version: ${currentVersion}`);
    await log(`Current schema version: ${currentVersion}`, 'INFO', 'SCHEMA');
    
    // Ensure schema version tracking table exists first
    await database.ensureSchemaVersionTable();
    console.log('[DB] schema_version table checked/created');
    await log('Schema version table ensured', 'INFO', 'SCHEMA');
    
    // Create/update all tables
    await database.ensureDevicesTable();
    console.log('[DB] devices table checked/created');
    await log('Devices table ensured', 'INFO', 'SCHEMA');
    
    await database.ensureLogsTable();
    console.log('[DB] logs table checked/created');
    await log('Logs table ensured', 'INFO', 'SCHEMA');
    
    await database.ensureRibsDataTable();
    console.log('[DB] RIBS_Data table checked/created');
    await log('RIBS_Data table ensured', 'INFO', 'SCHEMA');
    
    // Apply any pending schema upgrades
    await database.applySchemaUpgrades();
    console.log('[DB] Schema upgrades applied');
    await log('Schema upgrades applied', 'INFO', 'SCHEMA');
    
    // Verify final schema version
    const finalVersion = await database.getCurrentSchemaVersion();
    console.log(`[DB] Final schema version: ${finalVersion}`);
    await log(`Schema initialization complete. Final version: ${finalVersion}`, 'INFO', 'SCHEMA');
    
    if (finalVersion === database.CURRENT_SCHEMA_VERSION) {
      console.log('[DB] ✓ Database schema is up-to-date');
      await log('Database schema is up-to-date', 'INFO', 'SCHEMA');
    } else {
      console.log(`[DB] ⚠ Warning: Expected version ${database.CURRENT_SCHEMA_VERSION}, but got ${finalVersion}`);
      await log(`Warning: Expected version ${database.CURRENT_SCHEMA_VERSION}, but got ${finalVersion}`, 'WARN', 'SCHEMA');
    }
    
  } catch (err) {
    console.error('[DB] Table check/create error:', err);
    await log(`Table creation error: ${err.message}`, 'ERROR', 'SCHEMA');
    throw err; // Re-throw to ensure startup fails if schema setup fails
  }
}

module.exports = ensureTables;
