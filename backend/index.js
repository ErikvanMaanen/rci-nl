require('dotenv').config({ path: __dirname + '/.env' });
const express = require('express');
const sql = require('mssql');

async function log(message) {
  try {
    await sql.query`INSERT INTO logs(message, log_time) VALUES(${message}, GETDATE())`;
  } catch (err) {
    console.error('Logging failed', err);
  }
}

const app = express();
app.use(express.json());

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

sql.connect(config).catch(err => console.error('DB connection error', err));

app.post('/api/register', async (req, res) => {
  const { device_id } = req.body;
  if (!device_id) return res.status(400).send('device_id required');
  try {
    await sql.query`INSERT INTO devices (id, registered_at) VALUES (${device_id}, GETDATE())`;
    await log(`Registered device ${device_id}`);
    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    await log(`Error registering device ${device_id}: ${err.message}`);
    res.sendStatus(500);
  }
});

app.post('/api/upload', async (req, res) => {
  const data = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  try {
    await sql.query`
      INSERT INTO rci_data(timestamp, latitude, longitude, speed, direction, roughness, distance_m, device_id, ip_address, z_values, avg_speed, interval_s, algorithm_version)
      VALUES(${data.timestamp}, ${data.latitude}, ${data.longitude}, ${data.speed}, ${data.direction}, ${data.roughness}, ${data.distance_m}, ${data.device_id}, ${ip}, ${JSON.stringify(data.z_values)}, ${data.avg_speed}, ${data.interval_s}, ${data.algorithm_version})
    `;
    await log(`Uploaded data from ${data.device_id}`);
    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    await log(`Error uploading data from ${data.device_id}: ${err.message}`);
    res.sendStatus(500);
  }
});

app.get('/api/logs', async (req, res) => {
  try {
    const result = await sql.query`SELECT TOP (100) log_time, message FROM logs ORDER BY log_time DESC`;
    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).send('error');
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Server listening on', port));
