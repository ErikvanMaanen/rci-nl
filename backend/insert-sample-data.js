const fs = require('fs');
const path = require('path');
const database = require('./database');

async function insertSampleData() {
  console.log('Connecting to database...');
  await database.initializeDatabase();

  // Wait for connection to establish
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Generate a device ID if not exists
  let deviceId = '12345-test-device';
  
  // Create random points around the Netherlands
  const centerLat = 52.1;
  const centerLon = 5.1;
  const points = [];
  
  // Create 20 random points
  for (let i = 0; i < 20; i++) {
    const lat = centerLat + (Math.random() - 0.5) * 2; // +/- 1 degree
    const lon = centerLon + (Math.random() - 0.5) * 2;
    const roughness = Math.random() * 10;
    const speed = 10 + Math.random() * 20;
    
    points.push({
      device_id: deviceId,
      latitude: lat,
      longitude: lon,
      roughness: roughness,
      speed: speed,
      timestamp: new Date().toISOString()
    });
  }
  
  console.log(`Inserting ${points.length} sample points...`);
  
  // Register the device first
  try {
    await database.registerDevice({ 
      device_id: deviceId, 
      nickname: 'Test Device' 
    });
    console.log('Device registered');
  } catch (e) {
    console.log('Device might already be registered:', e.message);
  }
  
  // Insert all data points
  for (const point of points) {
    try {
      await database.insertRibsData(point);
      console.log('Inserted point:', point);
    } catch (e) {
      console.error('Failed to insert point:', e);
    }
  }
  
  console.log('Sample data inserted successfully!');
  process.exit(0);
}

insertSampleData().catch(err => {
  console.error('Error inserting sample data:', err);
  process.exit(1);
});
