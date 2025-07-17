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
  // RCI data table
  const createRciData = `
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='rci_data' AND xtype='U')
    CREATE TABLE rci_data (
      id INT IDENTITY(1,1) PRIMARY KEY,
      timestamp NVARCHAR(50),
      latitude FLOAT,
      longitude FLOAT,
      speed FLOAT,
      direction FLOAT,
      roughness FLOAT,
      distance_m FLOAT,
      device_id NVARCHAR(100),
      ip_address NVARCHAR(100),
      z_values NVARCHAR(MAX),
      avg_speed FLOAT,
      interval_s FLOAT,
      algorithm_version NVARCHAR(20)
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
    
    await sql.query(createRciData);
    console.log('[DB] rci_data table checked/created');
    await log('RCI data table ensured', 'INFO', 'DATABASE');
  } catch (err) {
    console.error('[DB] Table check/create error:', err);
    await log(`Table creation error: ${err.message}`, 'ERROR', 'DATABASE');
  }
}

module.exports = ensureTables;
