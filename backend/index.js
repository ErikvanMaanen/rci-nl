require('dotenv').config({ path: __dirname + '/.env' });
const express = require('express');
const sql = require('mssql');
const logger = require('./logger');

const app = express();
app.use(express.json());

// ----- Startup Tasks -----
// Request logging middleware - only log important API calls
app.use(async (req, res, next) => {
  // Only log non-GET API requests to reduce spam (GET /api/logs is very frequent)
  if (req.path.startsWith('/api/') && req.method !== 'GET') {
    await logger.request(req);
  }
  next();
});

// Serve static frontend files
require('./serve-frontend')(app);

// ----- Startup Tasks -----
// Database configuration and connection settings
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

const ensureTables = require('./ensure-tables');

let connectionPool = null;

// Connect to the database and prepare tables
sql.connect(config)
  .then(async (pool) => {
    connectionPool = pool;
    logger.setDatabaseReady();
    await logger.database('Database connection established');
    await logger.info(`Server started and listening on port ${process.env.PORT || 3000}`, 'SERVER');
    return ensureTables();
  })
  .then(async () => {
    await logger.database('Database tables ensured');
    // Clean up old logs to prevent performance issues
    await cleanupOldLogs();
  })
  .catch(async (err) => {
    await logger.error(`Database connection failed: ${err.message}`, 'DATABASE');
  });

// Function to clean up old logs to prevent database from growing too large
async function cleanupOldLogs() {
  try {
    if (!connectionPool) {
      await logger.warn('Database not ready, skipping log cleanup', 'DATABASE');
      return;
    }
    // Keep only the last 1000 log entries
    const request = connectionPool.request();
    const result = await request.query(`
      DELETE FROM logs 
      WHERE id NOT IN (
        SELECT TOP 1000 id FROM logs ORDER BY log_time DESC
      )
    `);
    await logger.info('Old logs cleaned up', 'DATABASE');
  } catch (err) {
    await logger.error(`Failed to cleanup old logs: ${err.message}`, 'DATABASE');
  }
}

// Endpoint to retrieve device info (currently only nickname)
app.get('/api/device/:id', async (req, res) => {
  const deviceId = req.params.id;
  try {
    const result = await sql.query`SELECT id, nickname FROM devices WHERE id = ${deviceId}`;
    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'not found' });
    }
    res.json(result.recordset[0]);
  } catch (err) {
    await logger.error(`Error fetching device ${deviceId}: ${err.message}`, 'API');
    res.status(500).json({ error: 'failed' });
  }
});

// Endpoint to list all registered devices
app.get('/api/devices', async (req, res) => {
  try {
    const result = await sql.query`SELECT id, nickname FROM devices ORDER BY nickname`;
    res.json(result.recordset);
  } catch (err) {
    await logger.error(`Error retrieving devices: ${err.message}`, 'API');
    res.status(500).json({ error: 'failed' });
  }
});

app.post('/api/register', async (req, res) => {
  const { device_id, nickname = null } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  await logger.api(`Device registration attempt for device ${device_id}`, `IP: ${ip}`);
  
  if (!device_id) {
    await logger.warn(`Device registration failed: missing device_id from IP ${ip}`, 'API');
    return res.status(400).send('device_id required');
  }
  
  try {
    await sql.query`
      MERGE devices AS target
      USING (SELECT ${device_id} AS id, ${nickname} AS nickname) AS src
      ON target.id = src.id
      WHEN MATCHED THEN
        UPDATE SET nickname = src.nickname
      WHEN NOT MATCHED THEN
        INSERT (id, registered_at, nickname) VALUES (src.id, GETDATE(), src.nickname);
    `;
    await logger.api(`Successfully registered device ${device_id}`, `IP: ${ip}`);
    res.sendStatus(200);
  } catch (err) {
    await logger.error(`Error registering device ${device_id} from IP ${ip}: ${err.message}`, 'API');
    res.sendStatus(500);
  }
});

// ----- Data Storage and Retrieval -----
app.post('/api/upload', async (req, res) => {
  const data = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  // Don't log every upload attempt to reduce spam
  // await logger.api(`Data upload attempt from device ${data.device_id}`, `IP: ${ip}`);
  
  try {
    await sql.query`
      INSERT INTO RIBS_Data(timestamp, latitude, longitude, speed, direction, roughness, distance_m, device_id, ip_address, z_values, avg_speed, interval_s, algorithm_version)
      VALUES(${data.timestamp}, ${data.latitude}, ${data.longitude}, ${data.speed}, ${data.direction}, ${data.roughness}, ${data.distance_m}, ${data.device_id}, ${ip}, ${JSON.stringify(data.z_values)}, ${data.avg_speed}, ${data.interval_s}, ${data.algorithm_version})
    `;
    // Don't log every successful upload to reduce spam
    // await logger.api(`Successfully uploaded data from device ${data.device_id}`, `roughness: ${data.roughness}, distance: ${data.distance_m}m`);
    res.sendStatus(200);
  } catch (err) {
    await logger.error(`Error uploading data from device ${data.device_id} at IP ${ip}: ${err.message}`, 'API');
    res.sendStatus(500);
  }
});

app.get('/api/logs', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const { level, source, limit = 100 } = req.query;
  
  if (!connectionPool) {
    await logger.warn('Database not ready, cannot get logs', 'API');
    return res.status(503).send('Database not ready');
  }
  
  // Don't log every log request to avoid spam
  // await logger.api(`Logs requested`, `IP: ${ip}, Level filter: ${level || 'all'}, Source filter: ${source || 'all'}`);
  
  try {
    // Use parameterized query to prevent SQL injection
    let query = 'SELECT TOP (@limit) id, log_time, message, level, source FROM logs';
    const conditions = [];
    
    if (level && ['INFO', 'WARN', 'ERROR', 'DEBUG'].includes(level.toUpperCase())) {
      conditions.push('level = @level');
    }
    
    if (source && source.length < 100) { // Basic validation
      conditions.push('source = @source');
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY log_time DESC';
    
    const request = connectionPool.request();
    request.input('limit', sql.Int, Math.min(parseInt(limit) || 100, 1000)); // Cap at 1000
    
    if (level && ['INFO', 'WARN', 'ERROR', 'DEBUG'].includes(level.toUpperCase())) {
      request.input('level', sql.NVarChar(20), level.toUpperCase());
    }
    
    if (source && source.length < 100) {
      request.input('source', sql.NVarChar(100), source);
    }
    
    const result = await request.query(query);
    res.json(result.recordset);
  } catch (err) {
    await logger.error(`Error retrieving logs for IP ${ip}: ${err.message}`, 'API');
    res.status(500).send('error');
  }
});

// New endpoint to get log statistics
app.get('/api/logs/stats', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  // Don't log stats requests to reduce spam
  // await logger.api(`Log statistics requested`, `IP: ${ip}`);
  
  if (!connectionPool) {
    await logger.warn('Database not ready, cannot get log stats', 'API');
    return res.status(503).send('Database not ready');
  }
  
  try {
    const request = connectionPool.request();
    const result = await request.query(`
      SELECT 
        level,
        source,
        COUNT(*) as count,
        MAX(log_time) as latest_log
      FROM logs 
      GROUP BY level, source
      ORDER BY count DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    await logger.error(`Error retrieving log statistics for IP ${ip}: ${err.message}`, 'API');
    res.status(500).send('error');
  }
});

// New endpoint to receive frontend logs
app.post('/api/logs', async (req, res) => {
  const { message, level = 'INFO', source = 'FRONTEND' } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  
  if (!message || message.trim() === '') {
    return res.status(400).json({ error: 'Message is required' });
  }
  
  // Skip empty or repetitive messages
  if (message.length < 3 || message.match(/^\[20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
    return res.sendStatus(200);
  }
  
  try {
    await logger.log(message, level, source);
    res.sendStatus(200);
  } catch (err) {
    await logger.error(`Error logging frontend message from IP ${ip}: ${err.message}`, 'API');
    res.status(500).json({ error: 'Failed to log message' });
  }
});

// Endpoint to retrieve measurement records for map view
app.get('/api/rci-data', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const { limit = 1000, devices } = req.query;

  if (!connectionPool) {
    await logger.warn('Database not ready, cannot get rci-data', 'API');
    return res.status(503).send('Database not ready');
  }

  try {
    const request = connectionPool.request();
    request.input('limit', sql.Int, Math.min(parseInt(limit) || 1000, 1000));
    let query = 'SELECT TOP (@limit) timestamp, latitude, longitude, roughness, device_id FROM RIBS_Data';

    if (devices) {
      const ids = devices.split(',').map((id) => id.trim()).filter(Boolean);
      if (ids.length > 0) {
        const conditions = ids.map((id, idx) => {
          const param = `id${idx}`;
          request.input(param, sql.NVarChar(100), id);
          return `@${param}`;
        });
        query += ` WHERE device_id IN (${conditions.join(',')})`;
      }
    }

    query += ' ORDER BY id DESC';

    const result = await request.query(query);
    res.json(result.recordset);
  } catch (err) {
    await logger.error(`Error retrieving RIBS_Data for IP ${ip}: ${err.message}`, 'API');
    res.status(500).send('error');
  }
});

// Global error handling middleware
app.use(async (err, req, res, next) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  await logger.error(`Unhandled error on ${req.method} ${req.path} from IP ${ip}: ${err.message}`, 'SERVER');
  res.status(500).json({ error: 'Internal server error' });
});

const port = process.env.PORT || 3000;
// Start listening for requests
const server = app.listen(port, () => {
  console.log(`[${new Date().toISOString()}] [INFO] [SERVER] Server started and listening on port ${port}`);
  // Don't try to log to database immediately as it might not be ready yet
  // The database connection logging will happen in the sql.connect().then() callback
});

// Graceful shutdown handling
process.on('SIGINT', async () => {
  await logger.info('Server shutdown initiated (SIGINT)', 'SERVER');
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGTERM', async () => {
  await logger.info('Server shutdown initiated (SIGTERM)', 'SERVER');
  server.close(() => {
    process.exit(0);
  });
});
