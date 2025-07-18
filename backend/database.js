// Centralized database module for the RIBS Tracker application
const sql = require('mssql');

let connectionPool = null;
let databaseReady = false;

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
  return databaseReady && sql.connected && connectionPool;
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
 * Ensure all required tables exist
 */
async function ensureTables() {
  await ensureDevicesTable();
  await ensureLogsTable();
  await ensureRibsDataTable();
}

/**
 * Ensure devices table exists with nickname column
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
 * Ensure logs table exists with index
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
 * Ensure RIBS_Data table exists
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
      algorithm_version NVARCHAR(50) NOT NULL
    );
  `;

  await executeQuery(createRibsData);
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

  const result = await query`SELECT id, nickname FROM devices WHERE id = ${deviceId}`;
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

  const result = await query`SELECT id, nickname FROM devices ORDER BY nickname`;
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

  await query`
    INSERT INTO RIBS_Data(timestamp, latitude, longitude, speed, direction, roughness, distance_m, device_id, ip_address, z_values, avg_speed, interval_s, algorithm_version)
    VALUES(${data.timestamp}, ${data.latitude}, ${data.longitude}, ${data.speed}, ${data.direction}, ${data.roughness}, ${data.distance_m}, ${data.device_id}, ${ipAddress}, ${JSON.stringify(data.z_values)}, ${data.avg_speed}, ${data.interval_s}, ${data.algorithm_version})
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
  ensureDevicesTable,
  ensureLogsTable,
  ensureRibsDataTable,
  
  // Log operations
  insertLog,
  getLogs,
  getLogStats,
  cleanupOldLogs,
  
  // Device operations
  getDevice,
  getAllDevices,
  registerDevice,
  
  // RIBS data operations
  insertRibsData,
  getRibsData,
  
  // SQL types (for compatibility)
  sql
};
