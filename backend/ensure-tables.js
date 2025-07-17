// This module ensures the required tables exist and are up-to-date.
const sql = require('mssql');

async function ensureTables() {
  // Devices table
  const createDevices = `
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='devices' AND xtype='U')
    CREATE TABLE devices (
      id NVARCHAR(100) PRIMARY KEY,
      registered_at DATETIME NOT NULL
    );
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
    await sql.query(createRciData);
    console.log('[DB] rci_data table checked/created');
  } catch (err) {
    console.error('[DB] Table check/create error:', err);
  }
}

module.exports = ensureTables;
