// This module ensures the required tables exist and are up-to-date.
const sql = require('mssql');

// Simple logging function for table creation (avoid circular dependency with logger.js)
async function log(message, level = 'INFO', source = 'DATABASE') {
  try {
    await sql.query`INSERT INTO logs(message, log_time, level, source) VALUES(${message}, GETDATE(), ${level}, ${source})`;
  } catch (err) {
    // Don't log logging failures here to avoid infinite loops
    console.error('Logging failed in ensure-tables:', err);
  }
}

async function ensureTables() {
  // Devices table
  const createDevices = `
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='devices' AND xtype='U')
    CREATE TABLE devices (
      id NVARCHAR(100) PRIMARY KEY,
      registered_at DATETIME NOT NULL
    );
  `;
  // Logs table
  const createLogs = `
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='logs' AND xtype='U')
    CREATE TABLE logs (
      id INT IDENTITY(1,1) PRIMARY KEY,
      message NVARCHAR(MAX) NOT NULL,
      log_time DATETIME NOT NULL,
      level NVARCHAR(20) DEFAULT 'INFO',
      source NVARCHAR(100)
    );
  `;
  
  // Create index on logs table for better performance
  const createLogsIndex = `
    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_logs_time_level' AND object_id = OBJECT_ID('logs'))
    CREATE INDEX IX_logs_time_level ON logs(log_time DESC, level);
  `;
  // RIBS data table
  const createRibsData = `
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='RIBS_Data' AND xtype='U')
    CREATE TABLE RIBS_Data (
      id INT IDENTITY(1,1) PRIMARY KEY,
      timestamp NVARCHAR(50) NOT NULL,
      latitude FLOAT NOT NULL,
      longitude FLOAT NOT NULL,
      speed FLOAT NOT NULL,
      direction FLOAT NOT NULL,
      roughness FLOAT NOT NULL,
      distance_m FLOAT NOT NULL,
      device_id NVARCHAR(100) NOT NULL,
      ip_address NVARCHAR(45) NOT NULL,
      z_values NVARCHAR(MAX) NOT NULL,
      avg_speed FLOAT NOT NULL,
      interval_s FLOAT NOT NULL,
      algorithm_version NVARCHAR(50) NOT NULL
    );
  `;
  try {
    await sql.query(createDevices);
    console.log('[DB] devices table checked/created');
    await log('Devices table ensured', 'INFO', 'DATABASE');
    
    await sql.query(createLogs);
    console.log('[DB] logs table checked/created');
    await log('Logs table ensured', 'INFO', 'DATABASE');
    
    await sql.query(createLogsIndex);
    console.log('[DB] logs table index checked/created');
    await log('Logs table index ensured', 'INFO', 'DATABASE');
    
    await sql.query(createRibsData);
    console.log('[DB] RIBS_Data table checked/created');
    await log('RIBS data table ensured', 'INFO', 'DATABASE');
  } catch (err) {
    console.error('[DB] Table check/create error:', err);
    await log(`Table creation error: ${err.message}`, 'ERROR', 'DATABASE');
  }
}

module.exports = ensureTables;
