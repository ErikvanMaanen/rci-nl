require('dotenv').config({ path: __dirname + '/.env' });
const express = require('express');
const database = require('./database');
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
const ensureTables = require('./ensure-tables');

// Connect to the database and prepare tables
database.initializeDatabase()
  .then(async () => {
    // Database is now ready, wait a moment for connection to fully establish
    await new Promise(resolve => setTimeout(resolve, 100));
    
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
    await database.cleanupOldLogs();
    await logger.info('Old logs cleaned up', 'DATABASE');
  } catch (err) {
    await logger.error(`Failed to cleanup old logs: ${err.message}`, 'DATABASE');
  }
}

// Endpoint to retrieve device info (currently only nickname)
app.get('/api/device/:id', async (req, res) => {
  const deviceId = req.params.id;
  try {
    const device = await database.getDevice(deviceId);
    if (!device) {
      return res.status(404).json({ error: 'not found' });
    }
    res.json(device);
  } catch (err) {
    await logger.error(`Error fetching device ${deviceId}: ${err.message}`, 'API');
    res.status(500).json({ error: 'failed' });
  }
});

// Endpoint to list all registered devices
app.get('/api/devices', async (req, res) => {
  try {
    const devices = await database.getAllDevices();
    res.json(devices);
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
    await database.registerDevice(device_id, nickname);
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
    await database.insertRibsData(data, ip);
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
  
  if (!database.isDatabaseReady()) {
    await logger.warn('Database not ready, cannot get logs', 'API');
    return res.status(503).send('Database not ready');
  }
  
  // Don't log every log request to avoid spam
  // await logger.api(`Logs requested`, `IP: ${ip}, Level filter: ${level || 'all'}, Source filter: ${source || 'all'}`);
  
  try {
    const logs = await database.getLogs({ level, source, limit });
    res.json(logs);
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
  
  if (!database.isDatabaseReady()) {
    await logger.warn('Database not ready, cannot get log stats', 'API');
    return res.status(503).send('Database not ready');
  }
  
  try {
    const stats = await database.getLogStats();
    res.json(stats);
  } catch (err) {
    await logger.error(`Error retrieving log statistics for IP ${ip}: ${err.message}`, 'API');
    res.status(500).send('error');
  }
});

// New endpoint to get database schema status (for maintenance)
app.get('/api/schema/status', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  await logger.api(`Schema status requested`, `IP: ${ip}`);
  
  try {
    const status = await database.getSchemaStatus();
    res.json(status);
  } catch (err) {
    await logger.error(`Error retrieving schema status for IP ${ip}: ${err.message}`, 'API');
    res.status(500).json({ 
      ready: false, 
      error: 'Failed to retrieve schema status',
      details: err.message
    });
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

// Endpoint to clear all logs
app.delete('/api/logs', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  if (!database.isDatabaseReady()) {
    await logger.warn('Database not ready, cannot clear logs', 'API');
    return res.status(503).send('Database not ready');
  }

  try {
    await database.clearLogs();
    await logger.api('Logs cleared', `IP: ${ip}`);
    res.sendStatus(200);
  } catch (err) {
    await logger.error(`Error clearing logs for IP ${ip}: ${err.message}`, 'API');
    res.status(500).send('error');
  }
});

// Endpoint to retrieve measurement records for map view
app.get('/api/rci-data', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const { limit = 1000, devices } = req.query;

  if (!database.isDatabaseReady()) {
    await logger.warn('Database not ready, cannot get rci-data', 'API');
    return res.status(503).send('Database not ready');
  }

  try {
    const deviceList = devices ? devices.split(',').map(id => id.trim()).filter(Boolean) : [];
    const data = await database.getRibsData({ limit, devices: deviceList });
    res.json(data);
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
  server.close(async () => {
    await database.closeDatabase();
    process.exit(0);
  });
});

process.on('SIGTERM', async () => {
  await logger.info('Server shutdown initiated (SIGTERM)', 'SERVER');
  server.close(async () => {
    await database.closeDatabase();
    process.exit(0);
  });
});
