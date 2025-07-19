// Centralized database module for the RIBS Tracker application
const sql = require('mssql');

let connectionPool = null;
let databaseReady = false;

// Database schema version for migration tracking
const CURRENT_SCHEMA_VERSION = '1.2.0';

/**
 * DATABASE SCHEMA DOCUMENTATION
 * 
 * This section documents all tables and their schemas for the RIBS Tracker application.
 * Each table includes its purpose, columns, indexes, and relationships.
 */

/**
 * TABLE: devices
 * Purpose: Store registered device information and nicknames
 * 
 * Columns:
 * - id (NVARCHAR(100), PRIMARY KEY): Unique device identifier (UUID)
 * - registered_at (DATETIME, NOT NULL): When the device was first registered
 * - nickname (NVARCHAR(100), NULL): User-friendly name for the device
 * 
 * Indexes: Primary key on id
 * Relationships: Referenced by RIBS_Data.device_id
 */

/**
 * TABLE: logs
 * Purpose: Store application logs from all sources (server, frontend, API, etc.)
 * 
 * Columns:
 * - id (INT IDENTITY(1,1), PRIMARY KEY): Auto-incrementing log entry ID
 * - message (NVARCHAR(MAX), NOT NULL): The log message content
 * - log_time (DATETIME, NOT NULL): Timestamp when the log was created
 * - level (NVARCHAR(20), DEFAULT 'INFO'): Log level (INFO, WARN, ERROR, DEBUG)
 * - source (NVARCHAR(100), NULL): Source of the log (SERVER, API, DATABASE, FRONTEND, etc.)
 * 
 * Indexes:
 * - Primary key on id
 * - IX_logs_time_level on (log_time DESC, level) for efficient querying
 * 
 * Notes: Includes automatic cleanup to prevent unlimited growth
 */

/**
 * TABLE: RIBS_Data
 * Purpose: Store roughness measurement data collected from devices
 * 
 * Columns:
 * - id (INT IDENTITY(1,1), PRIMARY KEY): Auto-incrementing measurement ID
 * - timestamp (NVARCHAR(50), NOT NULL): ISO timestamp of the measurement
 * - latitude (FLOAT, NOT NULL): GPS latitude coordinate
 * - longitude (FLOAT, NOT NULL): GPS longitude coordinate
 * - speed (FLOAT, NOT NULL): Instantaneous speed at measurement time (m/s)
 * - direction (FLOAT, NOT NULL): Heading/direction of travel (degrees)
 * - roughness (FLOAT, NOT NULL): Calculated roughness index (RMS acceleration)
 * - distance_m (FLOAT, NOT NULL): Total distance traveled by device (meters)
 * - device_id (NVARCHAR(100), NOT NULL): Reference to devices.id
 * - ip_address (NVARCHAR(45), NOT NULL): IP address of the uploading client
 * - z_values (NVARCHAR(MAX), NOT NULL): JSON array of raw Z-axis acceleration values
 * - avg_speed (FLOAT, NOT NULL): Average speed during measurement window (m/s)
 * - interval_s (FLOAT, NOT NULL): Duration of measurement window (seconds)
 * - algorithm_version (NVARCHAR(50), NOT NULL): Version of processing algorithm used
 * - vdv (FLOAT, NULL): Vibration Dose Value (4th power method) - NEW in v1.2.0
 * - crest_factor (FLOAT, NULL): Peak-to-RMS ratio - NEW in v1.2.0
 * 
 * Indexes:
 * - Primary key on id
 * - IX_ribs_device_time on (device_id, timestamp) for device-specific queries
 * - IX_ribs_location on (latitude, longitude) for spatial queries
 * 
 * Relationships: device_id references devices.id
 */

/**
 * TABLE: schema_version
 * Purpose: Track database schema version for migrations
 * 
 * Columns:
 * - version (NVARCHAR(20), PRIMARY KEY): Schema version string
 * - applied_at (DATETIME, NOT NULL): When this version was applied
 * - description (NVARCHAR(255), NULL): Description of changes in this version
 */

// Database configuration
const config = {
  user: process.env.AZURE_SQL_USERNAME,
  password: process.env.AZURE_SQL_PASSWORD,
  server: process.env.AZURE_SQL_SERVER,
  database: process.env.AZURE_SQL_DATABASE,
  port: parseInt(process.env.AZURE_SQL_PORT || '1433'),
  options: {
    encrypt: true,
    trustServerCertificate: true
  },
  requestTimeout: 30000, // 30 seconds
  connectionTimeout: 30000, // 30 seconds
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

/**
 * Initialize database connection
 * @returns {Promise<Object>} Connection pool
 */
async function initializeDatabase() {
  try {
    connectionPool = await sql.connect(config);
    databaseReady = true;
    return connectionPool;
  } catch (error) {
    databaseReady = false;
    connectionPool = null;
    throw error;
  }
}

/**
 * Check if database is ready and connected
 * @returns {boolean}
 */
function isDatabaseReady() {
  return databaseReady && connectionPool && connectionPool.connected;
}

/**
 * Get the current connection pool
 * @returns {Object|null}
 */
function getConnectionPool() {
  return connectionPool;
}

/**
 * Mark database as ready (for logger compatibility)
 */
function setDatabaseReady() {
  databaseReady = true;
}

/**
 * Execute a raw SQL query
 * @param {string} queryText - SQL query text
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>} Query result
 */
async function executeQuery(queryText, params = {}) {
  if (!isDatabaseReady()) {
    throw new Error('Database not ready');
  }

  const request = connectionPool.request();
  
  // Add parameters to request
  Object.entries(params).forEach(([key, value]) => {
    request.input(key, value);
  });

  return await request.query(queryText);
}

/**
 * Execute a parameterized query using template literals
 * @param {Array} strings - Template literal strings
 * @param {...any} values - Template literal values
 * @returns {Promise<Object>} Query result
 */
async function query(strings, ...values) {
  if (!isDatabaseReady()) {
    throw new Error('Database not ready');
  }

  return await sql.query(strings, ...values);
}

// ===== TABLE CREATION FUNCTIONS =====

/**
 * Ensure all required tables exist and are up-to-date
 */
async function ensureTables() {
  await ensureSchemaVersionTable();
  await ensureDevicesTable();
  await ensureLogsTable();
  await ensureRibsDataTable();
  await applySchemaUpgrades();
}

/**
 * Ensure schema version tracking table exists
 */
async function ensureSchemaVersionTable() {
  const createSchemaVersion = `
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='schema_version' AND xtype='U')
    CREATE TABLE schema_version (
      version NVARCHAR(20) PRIMARY KEY,
      applied_at DATETIME NOT NULL,
      description NVARCHAR(255) NULL
    );
  `;

  await executeQuery(createSchemaVersion);
  
  // Insert current version if not exists
  const insertCurrentVersion = `
    IF NOT EXISTS (SELECT * FROM schema_version WHERE version = @version)
    INSERT INTO schema_version (version, applied_at, description) 
    VALUES (@version, GETDATE(), 'Initial schema version');
  `;
  
  await executeQuery(insertCurrentVersion, { version: CURRENT_SCHEMA_VERSION });
}

/**
 * Ensure devices table exists with all required columns
 */
async function ensureDevicesTable() {
  const createDevices = `
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='devices' AND xtype='U')
    CREATE TABLE devices (
      id NVARCHAR(100) PRIMARY KEY,
      registered_at DATETIME NOT NULL,
      nickname NVARCHAR(100) NULL
    );
  `;

  const addNicknameColumn = `
    IF EXISTS (SELECT * FROM sysobjects WHERE name='devices' AND xtype='U')
    AND NOT EXISTS (
      SELECT * FROM sys.columns
      WHERE Name = N'nickname'
        AND Object_ID = Object_ID('devices')
    )
    ALTER TABLE devices ADD nickname NVARCHAR(100) NULL;
  `;

  await executeQuery(createDevices);
  await executeQuery(addNicknameColumn);
}

/**
 * Ensure logs table exists with proper indexes
 */
async function ensureLogsTable() {
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

  const createLogsIndex = `
    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_logs_time_level' AND object_id = OBJECT_ID('logs'))
    CREATE INDEX IX_logs_time_level ON logs(log_time DESC, level);
  `;

  await executeQuery(createLogs);
  await executeQuery(createLogsIndex);
}

/**
 * Ensure RIBS_Data table exists with all required columns and indexes
 */
async function ensureRibsDataTable() {
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
      algorithm_version NVARCHAR(50) NOT NULL,
      vdv FLOAT NULL,
      crest_factor FLOAT NULL
    );
  `;

  // Create indexes for efficient querying
  const createDeviceTimeIndex = `
    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_ribs_device_time' AND object_id = OBJECT_ID('RIBS_Data'))
    CREATE INDEX IX_ribs_device_time ON RIBS_Data(device_id, timestamp);
  `;

  const createLocationIndex = `
    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_ribs_location' AND object_id = OBJECT_ID('RIBS_Data'))
    CREATE INDEX IX_ribs_location ON RIBS_Data(latitude, longitude);
  `;

  await executeQuery(createRibsData);
  await executeQuery(createDeviceTimeIndex);
  await executeQuery(createLocationIndex);
}

/**
 * Apply schema upgrades based on current version
 */
async function applySchemaUpgrades() {
  const currentVersion = await getCurrentSchemaVersion();
  
  // Apply upgrades in order
  if (compareVersions(currentVersion, '1.1.0') < 0) {
    await applyUpgrade_1_1_0();
  }
  
  if (compareVersions(currentVersion, '1.2.0') < 0) {
    await applyUpgrade_1_2_0();
  }
}

/**
 * Get current schema version from database
 */
async function getCurrentSchemaVersion() {
  try {
    const result = await executeQuery(`
      SELECT TOP 1 version FROM schema_version 
      ORDER BY applied_at DESC
    `);
    return result.recordset.length > 0 ? result.recordset[0].version : '1.0.0';
  } catch (err) {
    return '1.0.0'; // Default to initial version if table doesn't exist
  }
}

/**
 * Compare two version strings (returns -1, 0, or 1)
 */
function compareVersions(version1, version2) {
  const v1parts = version1.split('.').map(Number);
  const v2parts = version2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(v1parts.length, v2parts.length); i++) {
    const v1part = v1parts[i] || 0;
    const v2part = v2parts[i] || 0;
    
    if (v1part < v2part) return -1;
    if (v1part > v2part) return 1;
  }
  
  return 0;
}

/**
 * Schema upgrade to version 1.1.0
 * - Added indexes to RIBS_Data table
 */
async function applyUpgrade_1_1_0() {
  try {
    // Add device_time index if not exists
    await executeQuery(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_ribs_device_time' AND object_id = OBJECT_ID('RIBS_Data'))
      CREATE INDEX IX_ribs_device_time ON RIBS_Data(device_id, timestamp);
    `);
    
    // Add location index if not exists
    await executeQuery(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_ribs_location' AND object_id = OBJECT_ID('RIBS_Data'))
      CREATE INDEX IX_ribs_location ON RIBS_Data(latitude, longitude);
    `);
    
    // Record the upgrade
    await executeQuery(`
      INSERT INTO schema_version (version, applied_at, description) 
      VALUES ('1.1.0', GETDATE(), 'Added performance indexes to RIBS_Data table');
    `);
  } catch (err) {
    throw new Error(`Failed to apply upgrade 1.1.0: ${err.message}`);
  }
}

/**
 * Schema upgrade to version 1.2.0
 * - Added VDV and crest_factor columns to RIBS_Data table
 */
async function applyUpgrade_1_2_0() {
  try {
    // Add VDV column if not exists
    await executeQuery(`
      IF NOT EXISTS (
        SELECT * FROM sys.columns
        WHERE Name = N'vdv'
          AND Object_ID = Object_ID('RIBS_Data')
      )
      ALTER TABLE RIBS_Data ADD vdv FLOAT NULL;
    `);
    
    // Add crest_factor column if not exists
    await executeQuery(`
      IF NOT EXISTS (
        SELECT * FROM sys.columns
        WHERE Name = N'crest_factor'
          AND Object_ID = Object_ID('RIBS_Data')
      )
      ALTER TABLE RIBS_Data ADD crest_factor FLOAT NULL;
    `);
    
    // Record the upgrade
    await executeQuery(`
      INSERT INTO schema_version (version, applied_at, description) 
      VALUES ('1.2.0', GETDATE(), 'Added VDV and crest_factor columns to RIBS_Data table');
    `);
  } catch (err) {
    throw new Error(`Failed to apply upgrade 1.2.0: ${err.message}`);
  }
}

// ===== LOG OPERATIONS =====

/**
 * Insert a log entry into the database
 * @param {string} message - Log message
 * @param {string} level - Log level (INFO, WARN, ERROR, DEBUG)
 * @param {string} source - Log source
 */
async function insertLog(message, level = 'INFO', source = 'SERVER') {
  if (!isDatabaseReady()) {
    throw new Error('Database not ready');
  }

  await query`INSERT INTO logs(message, log_time, level, source) VALUES(${message}, GETDATE(), ${level}, ${source})`;
}

/**
 * Get logs with optional filtering
 * @param {Object} options - Filter options
 * @returns {Promise<Array>} Log entries
 */
async function getLogs(options = {}) {
  const { level, source, limit = 100 } = options;
  
  if (!isDatabaseReady()) {
    throw new Error('Database not ready');
  }

  let queryText = 'SELECT TOP (@limit) id, log_time, message, level, source FROM logs';
  const params = { limit: sql.Int, limitValue: Math.min(parseInt(limit) || 100, 1000) };
  const conditions = [];

  if (level && ['INFO', 'WARN', 'ERROR', 'DEBUG'].includes(level.toUpperCase())) {
    conditions.push('level = @level');
    params.level = sql.NVarChar(20);
    params.levelValue = level.toUpperCase();
  }

  if (source && source.length < 100) {
    conditions.push('source = @source');
    params.source = sql.NVarChar(100);
    params.sourceValue = source;
  }

  if (conditions.length > 0) {
    queryText += ' WHERE ' + conditions.join(' AND ');
  }

  queryText += ' ORDER BY log_time DESC';

  const request = connectionPool.request();
  request.input('limit', params.limit, params.limitValue);
  
  if (params.levelValue) {
    request.input('level', params.level, params.levelValue);
  }
  
  if (params.sourceValue) {
    request.input('source', params.source, params.sourceValue);
  }

  const result = await request.query(queryText);
  return result.recordset;
}

/**
 * Get log statistics
 * @returns {Promise<Array>} Log statistics
 */
async function getLogStats() {
  if (!isDatabaseReady()) {
    throw new Error('Database not ready');
  }

  const result = await executeQuery(`
    SELECT 
      level,
      source,
      COUNT(*) as count,
      MAX(log_time) as latest_log
    FROM logs 
    GROUP BY level, source
    ORDER BY count DESC
  `);

  return result.recordset;
}

/**
 * Clean up old logs (keep only the latest 1000)
 */
async function cleanupOldLogs() {
  if (!isDatabaseReady()) {
    throw new Error('Database not ready');
  }

  await executeQuery(`
    DELETE FROM logs
    WHERE id NOT IN (
      SELECT TOP 1000 id FROM logs ORDER BY log_time DESC
    )
  `);
}

/**
 * Remove all log entries
 */
async function clearLogs() {
  if (!isDatabaseReady()) {
    throw new Error('Database not ready');
  }

  await executeQuery('DELETE FROM logs');
}

// ===== DEVICE OPERATIONS =====

/**
 * Get device information by ID
 * @param {string} deviceId - Device ID
 * @returns {Promise<Object|null>} Device info or null if not found
 */
async function getDevice(deviceId) {
  if (!isDatabaseReady()) {
    throw new Error('Database not ready');
  }

  const result = await query`SELECT id as device_id, nickname FROM devices WHERE id = ${deviceId}`;
  return result.recordset.length > 0 ? result.recordset[0] : null;
}

/**
 * Get all registered devices
 * @returns {Promise<Array>} List of devices
 */
async function getAllDevices() {
  if (!isDatabaseReady()) {
    throw new Error('Database not ready');
  }

  const result = await query`SELECT id as device_id, nickname FROM devices ORDER BY nickname`;
  return result.recordset;
}

/**
 * Register or update a device
 * @param {string} deviceId - Device ID
 * @param {string|null} nickname - Device nickname
 */
async function registerDevice(deviceId, nickname = null) {
  if (!isDatabaseReady()) {
    throw new Error('Database not ready');
  }

  await query`
    MERGE devices AS target
    USING (SELECT ${deviceId} AS id, ${nickname} AS nickname) AS src
    ON target.id = src.id
    WHEN MATCHED THEN
      UPDATE SET nickname = src.nickname
    WHEN NOT MATCHED THEN
      INSERT (id, registered_at, nickname) VALUES (src.id, GETDATE(), src.nickname);
  `;
}

// ===== RIBS DATA OPERATIONS =====

/**
 * Insert RIBS measurement data
 * @param {Object} data - Measurement data
 * @param {string} ipAddress - Client IP address
 */
async function insertRibsData(data, ipAddress) {
  if (!isDatabaseReady()) {
    throw new Error('Database not ready');
  }

  // Extract VDV and crest_factor from data (new in v1.2.0)
  const vdv = data.vdv || null;
  const crest_factor = data.crest_factor || null;

  await query`
    INSERT INTO RIBS_Data(timestamp, latitude, longitude, speed, direction, roughness, distance_m, device_id, ip_address, z_values, avg_speed, interval_s, algorithm_version, vdv, crest_factor)
    VALUES(${data.timestamp}, ${data.latitude}, ${data.longitude}, ${data.speed}, ${data.direction}, ${data.roughness}, ${data.distance_m}, ${data.device_id}, ${ipAddress}, ${JSON.stringify(data.z_values)}, ${data.avg_speed}, ${data.interval_s}, ${data.algorithm_version}, ${vdv}, ${crest_factor})
  `;
}

/**
 * Get RIBS measurement data with optional device filtering
 * @param {Object} options - Filter options
 * @returns {Promise<Array>} Measurement data
 */
async function getRibsData(options = {}) {
  const { limit = 1000, devices } = options;
  
  if (!isDatabaseReady()) {
    throw new Error('Database not ready');
  }

  const request = connectionPool.request();
  request.input('limit', sql.Int, Math.min(parseInt(limit) || 1000, 1000));
  
  let queryText = 'SELECT TOP (@limit) timestamp, latitude, longitude, roughness, device_id FROM RIBS_Data';

  if (devices && Array.isArray(devices) && devices.length > 0) {
    const conditions = devices.map((id, idx) => {
      const param = `id${idx}`;
      request.input(param, sql.NVarChar(100), id);
      return `@${param}`;
    });
    queryText += ` WHERE device_id IN (${conditions.join(',')})`;
  }

  queryText += ' ORDER BY id DESC';

  const result = await request.query(queryText);
  return result.recordset;
}

/**
 * Get database schema status and information
 * @returns {Promise<Object>} Schema status information
 */
async function getSchemaStatus() {
  if (!isDatabaseReady()) {
    return {
      ready: false,
      error: 'Database not ready'
    };
  }

  try {
    const currentVersion = await getCurrentSchemaVersion();
    const tablesResult = await executeQuery(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `);
    
    const indexesResult = await executeQuery(`
      SELECT 
        t.name AS table_name,
        i.name AS index_name,
        i.type_desc AS index_type
      FROM sys.indexes i
      INNER JOIN sys.tables t ON i.object_id = t.object_id
      WHERE i.name IS NOT NULL
      ORDER BY t.name, i.name
    `);

    return {
      ready: true,
      currentVersion,
      targetVersion: CURRENT_SCHEMA_VERSION,
      upToDate: currentVersion === CURRENT_SCHEMA_VERSION,
      tables: tablesResult.recordset.map(r => r.TABLE_NAME),
      indexes: indexesResult.recordset.map(r => ({
        table: r.table_name,
        name: r.index_name,
        type: r.index_type
      }))
    };
  } catch (error) {
    return {
      ready: false,
      error: error.message
    };
  }
}

// ===== MAINTENANCE HELPERS =====

/**
 * Get record count and last update timestamp for major tables
 * @returns {Promise<Array>} summary info
 */
async function getDatabaseInfo() {
  const tables = [
    { name: 'devices', column: 'registered_at' },
    { name: 'logs', column: 'log_time' },
    { name: 'RIBS_Data', column: 'timestamp' }
  ];

  const summaries = [];
  for (const tbl of tables) {
    try {
      const result = await executeQuery(`
        SELECT COUNT(*) AS count, MAX(${tbl.column}) AS last_update
        FROM ${tbl.name}
      `);
      const row = result.recordset[0] || {};
      summaries.push({
        name: tbl.name,
        count: row.count || 0,
        last_update: row.last_update
      });
    } catch (err) {
      summaries.push({ name: tbl.name, error: err.message });
    }
  }
  return summaries;
}

/**
 * Retrieve the latest records for a table
 * @param {string} table - table name
 * @param {number} limit - number of records
 * @returns {Promise<Array>}
 */
async function getLatestRecords(table, limit = 10) {
  if (!isDatabaseReady()) throw new Error('Database not ready');

  const safeLimit = Math.min(parseInt(limit) || 10, 100);
  let columns = '*';
  let orderBy = 'id DESC';
  switch (table) {
    case 'devices':
      columns = 'id, nickname, registered_at';
      orderBy = 'registered_at DESC';
      break;
    case 'logs':
      columns = 'id, message, log_time, level, source';
      orderBy = 'id DESC';
      break;
    case 'RIBS_Data':
      columns = 'id, timestamp, device_id, latitude, longitude, roughness';
      orderBy = 'id DESC';
      break;
  }

  const result = await executeQuery(
    `SELECT TOP (${safeLimit}) ${columns} FROM ${table} ORDER BY ${orderBy}`
  );
  return result.recordset;
}

/**
 * Run a simple insert/select/delete test on a table
 * @param {string} table
 * @returns {Promise<Object>} result
 */
async function testTable(table) {
  if (!isDatabaseReady()) throw new Error('Database not ready');

  const pool = getConnectionPool();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();
    const request = transaction.request();

    if (table === 'logs') {
      await request.query(
        "INSERT INTO logs(message, log_time, level, source) VALUES('test1', GETDATE(), 'INFO', 'TEST');"
      );
      await request.query(
        "INSERT INTO logs(message, log_time, level, source) VALUES('test2', GETDATE(), 'INFO', 'TEST');"
      );
    } else if (table === 'devices') {
      await request.query(
        "INSERT INTO devices(id, registered_at, nickname) VALUES('test-device-1', GETDATE(), 'test1');"
      );
      await request.query(
        "INSERT INTO devices(id, registered_at, nickname) VALUES('test-device-2', GETDATE(), 'test2');"
      );
    } else if (table === 'RIBS_Data') {
      const insert =
        "INSERT INTO RIBS_Data(timestamp, latitude, longitude, speed, direction, roughness, distance_m, device_id, ip_address, z_values, avg_speed, interval_s, algorithm_version, vdv, crest_factor)" +
        " VALUES(GETDATE(), 0, 0, 0, 0, 0, 0, 'test-device', '0.0.0.0', '[]', 0, 1, 'test', NULL, NULL);";
      await request.query(insert);
      await request.query(insert);
    } else {
      throw new Error('Unsupported table');
    }

    const records = (
      await request.query(`SELECT TOP (2) * FROM ${table} ORDER BY id DESC`)
    ).recordset;
    await transaction.rollback();
    return { success: true, records };
  } catch (err) {
    try {
      await transaction.rollback();
    } catch (_) {}
    return { success: false, error: err.message };
  }
}

// ===== GRACEFUL SHUTDOWN =====

/**
 * Close database connection gracefully
 */
async function closeDatabase() {
  if (connectionPool) {
    await connectionPool.close();
    connectionPool = null;
    databaseReady = false;
  }
}

module.exports = {
  // Connection management
  initializeDatabase,
  isDatabaseReady,
  getConnectionPool,
  setDatabaseReady,
  closeDatabase,
  
  // Query execution
  executeQuery,
  query,
  
  // Table management
  ensureTables,
  ensureSchemaVersionTable,
  ensureDevicesTable,
  ensureLogsTable,
  ensureRibsDataTable,
  applySchemaUpgrades,
  getCurrentSchemaVersion,
  
  // Log operations
  insertLog,
  getLogs,
  getLogStats,
  cleanupOldLogs,
  clearLogs,
  
  // Device operations
  getDevice,
  getAllDevices,
  registerDevice,
  
  // RIBS data operations
  insertRibsData,
  getRibsData,

  // Schema management
  getSchemaStatus,
  getDatabaseInfo,
  getLatestRecords,
  testTable,

  // SQL types (for compatibility)
  sql,
  
  // Schema version
  CURRENT_SCHEMA_VERSION
};
