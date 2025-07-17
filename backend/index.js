require('dotenv').config({ path: __dirname + '/.env' });
const express = require('express');
const sql = require('mssql');
const logger = require('./logger');

const app = express();
app.use(express.json());

// Request logging middleware
app.use(async (req, res, next) => {
  // Only log API requests to avoid spam from static files
  if (req.path.startsWith('/api/')) {
    await logger.request(req);
  }
  next();
});

// Serve static frontend files
require('./serve-frontend')(app);


const config = {
  user: process.env.AZURE_SQL_USERNAME,
  password: process.env.AZURE_SQL_PASSWORD,
  server: process.env.AZURE_SQL_SERVER,
  database: process.env.AZURE_SQL_DATABASE,
  port: parseInt(process.env.AZURE_SQL_PORT || '1433'),
  options: {
    encrypt: true,
    trustServerCertificate: true
  }
};

const ensureTables = require('./ensure-tables');

sql.connect(config)
  .then(async () => {
    await logger.database('Database connection established');
    return ensureTables();
  })
  .then(async () => {
    await logger.database('Database tables ensured');
  })
  .catch(async (err) => {
    await logger.error(`Database connection failed: ${err.message}`, 'DATABASE');
  });

app.post('/api/register', async (req, res) => {
  const { device_id } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  await logger.api(`Device registration attempt for device ${device_id}`, `IP: ${ip}`);
  
  if (!device_id) {
    await logger.warn(`Device registration failed: missing device_id from IP ${ip}`, 'API');
    return res.status(400).send('device_id required');
  }
  
  try {
    await sql.query`INSERT INTO devices (id, registered_at) VALUES (${device_id}, GETDATE())`;
    await logger.api(`Successfully registered device ${device_id}`, `IP: ${ip}`);
    res.sendStatus(200);
  } catch (err) {
    await logger.error(`Error registering device ${device_id} from IP ${ip}: ${err.message}`, 'API');
    res.sendStatus(500);
  }
});

app.post('/api/upload', async (req, res) => {
  const data = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  await logger.api(`Data upload attempt from device ${data.device_id}`, `IP: ${ip}`);
  
  try {
    await sql.query`
      INSERT INTO rci_data(timestamp, latitude, longitude, speed, direction, roughness, distance_m, device_id, ip_address, z_values, avg_speed, interval_s, algorithm_version)
      VALUES(${data.timestamp}, ${data.latitude}, ${data.longitude}, ${data.speed}, ${data.direction}, ${data.roughness}, ${data.distance_m}, ${data.device_id}, ${ip}, ${JSON.stringify(data.z_values)}, ${data.avg_speed}, ${data.interval_s}, ${data.algorithm_version})
    `;
    await logger.api(`Successfully uploaded data from device ${data.device_id}`, `roughness: ${data.roughness}, distance: ${data.distance_m}m`);
    res.sendStatus(200);
  } catch (err) {
    await logger.error(`Error uploading data from device ${data.device_id} at IP ${ip}: ${err.message}`, 'API');
    res.sendStatus(500);
  }
});

app.get('/api/logs', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const { level, source, limit = 100 } = req.query;
  
  await logger.api(`Logs requested`, `IP: ${ip}, Level filter: ${level || 'all'}, Source filter: ${source || 'all'}`);
  
  try {
    let query = 'SELECT TOP (@limit) id, log_time, message, level, source FROM logs';
    const conditions = [];
    const params = { limit: parseInt(limit) };
    
    if (level) {
      conditions.push('level = @level');
      params.level = level;
    }
    
    if (source) {
      conditions.push('source = @source');
      params.source = source;
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY log_time DESC';
    
    const request = sql.request();
    Object.entries(params).forEach(([key, value]) => {
      request.input(key, value);
    });
    
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
  await logger.api(`Log statistics requested`, `IP: ${ip}`);
  
  try {
    const result = await sql.query`
      SELECT 
        level,
        source,
        COUNT(*) as count,
        MAX(log_time) as latest_log
      FROM logs 
      GROUP BY level, source
      ORDER BY count DESC
    `;
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
  
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }
  
  try {
    await logger.log(message, level, source);
    res.sendStatus(200);
  } catch (err) {
    await logger.error(`Error logging frontend message from IP ${ip}: ${err.message}`, 'API');
    res.status(500).json({ error: 'Failed to log message' });
  }
});

// Global error handling middleware
app.use(async (err, req, res, next) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  await logger.error(`Unhandled error on ${req.method} ${req.path} from IP ${ip}: ${err.message}`, 'SERVER');
  res.status(500).json({ error: 'Internal server error' });
});

const port = process.env.PORT || 3000;
const server = app.listen(port, async () => {
  await logger.info(`Server started and listening on port ${port}`, 'SERVER');
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
