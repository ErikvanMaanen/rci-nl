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
    await database.ensureDevicesTable();
    console.log('[DB] devices table checked/created');
    await log('Devices table ensured', 'INFO', 'DATABASE');
    await log('Device nickname column ensured', 'INFO', 'DATABASE');
    
    await database.ensureLogsTable();
    console.log('[DB] logs table checked/created');
    await log('Logs table ensured', 'INFO', 'DATABASE');
    console.log('[DB] logs table index checked/created');
    await log('Logs table index ensured', 'INFO', 'DATABASE');
    
    await database.ensureRibsDataTable();
    console.log('[DB] RIBS_Data table checked/created');
    await log('RIBS data table ensured', 'INFO', 'DATABASE');
  } catch (err) {
    console.error('[DB] Table check/create error:', err);
    await log(`Table creation error: ${err.message}`, 'ERROR', 'DATABASE');
  }
}

module.exports = ensureTables;
