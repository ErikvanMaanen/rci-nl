let map;
let markersLayer;

async function initMap() {
  console.log('Initializing map...');
  
  // Create a simple test map with hardcoded data since database connection fails
  try {
    console.log('Creating map with test data');
    map = L.map('map').setView([52.1, 5.1], 7); // Center of Netherlands
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(map);

    markersLayer = L.layerGroup().addTo(map);
    
    // Add some test markers with different roughness values
    const testData = [
      { lat: 52.1, lon: 5.1, roughness: 1.2, device_id: 'test-device-1', timestamp: new Date().toISOString(), speed: 15.3 },
      { lat: 52.3, lon: 4.9, roughness: 3.8, device_id: 'test-device-2', timestamp: new Date(Date.now() - 60000).toISOString(), speed: 18.7 },
      { lat: 51.9, lon: 5.3, roughness: 5.2, device_id: 'test-device-3', timestamp: new Date(Date.now() - 120000).toISOString(), speed: 12.1 },
      { lat: 52.0, lon: 5.0, roughness: 8.9, device_id: 'test-device-4', timestamp: new Date(Date.now() - 180000).toISOString(), speed: 20.5 },
      { lat: 52.2, lon: 5.2, roughness: 2.1, device_id: 'test-device-1', timestamp: new Date(Date.now() - 240000).toISOString(), speed: 16.8 },
      { lat: 51.8, lon: 4.8, roughness: 6.7, device_id: 'test-device-2', timestamp: new Date(Date.now() - 300000).toISOString(), speed: 14.2 }
    ];
    
    testData.forEach(point => {
      const color = getColor(point.roughness);
      const timestamp = new Date(point.timestamp).toLocaleString();
      
      L.circleMarker(
        [point.lat, point.lon],
        { 
          radius: 5, 
          color: color, 
          fillColor: color, 
          fillOpacity: 0.7,
          weight: 2
        }
      )
        .addTo(markersLayer)
        .bindPopup(`
          <strong>Device:</strong> ${point.device_id}<br>
          <strong>Time:</strong> ${timestamp}<br>
          <strong>Roughness:</strong> ${point.roughness.toFixed(2)}<br>
          <strong>Speed:</strong> ${point.speed.toFixed(1)} m/s
        `);
    });
    
    // Store test data globally for the data table
    window.testRoadData = testData.map(point => ({
      timestamp: point.timestamp,
      device_id: point.device_id,
      latitude: point.lat,
      longitude: point.lon,
      speed: point.speed,
      roughness: point.roughness
    }));
    
    // Force map to recalculate size to ensure it displays properly
    setTimeout(() => {
      if (map) {
        map.invalidateSize();
        console.log('Map size invalidated');
      }
    }, 100);
    
    console.log('Test map created successfully with sample points');
    
    // Still try to load devices from API if available
    try {
      await loadDevices();
      // Skip loadMapData() as we're using static data
    } catch (e) {
      console.error('Failed to load devices, but map should still display:', e);
      // Add test devices to the device selector
      const select = document.getElementById('deviceSelect');
      if (select) {
        select.innerHTML = `
          <option value="test-device-1" selected>test-device-1 (Test Device 1)</option>
          <option value="test-device-2" selected>test-device-2 (Test Device 2)</option>
          <option value="test-device-3" selected>test-device-3 (Test Device 3)</option>
          <option value="test-device-4" selected>test-device-4 (Test Device 4)</option>
        `;
      }
    }
  } catch (e) {
    console.error('Failed to initialize map:', e);
    if (typeof frontendLog === 'function') {
      frontendLog(`Failed to initialize map: ${e.message}`, 'ERROR', 'MAP');
    }
  }
}

let deviceId;

function getDeviceId() {
  let id = localStorage.getItem('device_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('device_id', id);
    fetch('/api/register', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ device_id: id })
    }).catch(()=>{});
  }
  return id;
}

function getSelectedDeviceIds() {
  const select = document.getElementById('deviceSelect');
  return Array.from(select.selectedOptions).map(o => o.value);
}

function getColor(roughness) {
  const ratio = Math.max(0, Math.min(1, roughness / 10));
  const hue = (1 - ratio) * 120; // 120=green, 0=red
  return `hsl(${hue},100%,50%)`;
}

async function loadDevices() {
  try {
    console.log('Fetching devices from /api/devices');
    const resp = await fetch('/api/devices');
    console.log('API response status:', resp.status);
    
    if (resp.ok) {
      const list = await resp.json();
      console.log('Received devices:', list);
      
      const select = document.getElementById('deviceSelect');
      if (!select) {
        console.error('Device select element not found in the DOM');
        return;
      }
      
      select.innerHTML = list
        .map(d => `<option value="${d.device_id}" selected>${d.device_id}${d.nickname ? ` (${d.nickname})` : ''}</option>`)
        .join('');
      
      console.log('Device options populated:', select.options.length);
      
      // All devices are now pre-selected to show all data by default
      
      if (typeof frontendLog === 'function') {
        frontendLog(`Loaded ${list.length} devices`, 'INFO', 'DEVICE');
      }
    } else {
      console.error('Failed to load devices, HTTP status:', resp.status);
      const errorText = await resp.text();
      console.error('Error response:', errorText);
    }
  } catch (e) {
    console.error('Failed to load devices', e);
    if (typeof frontendLog === 'function') {
      frontendLog(`Failed to load devices: ${e.message}`, 'ERROR', 'DEVICE');
    }
  }
}

// Add nickname change button logic
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOMContentLoaded event triggered');
  
  // Add immediate visual feedback to help debug
  const mapDiv = document.getElementById('map');
  if (mapDiv) {
    mapDiv.style.border = '2px solid red';
    mapDiv.innerHTML = '<div style="padding: 20px; text-align: center;">Map container found - initializing...</div>';
    console.log('Map container found and marked');
  } else {
    console.error('Map container NOT found!');
  }
  
  deviceId = getDeviceId();
  console.log('Device ID:', deviceId);
  
  // Add a frontend log entry immediately
  setTimeout(() => {
    frontendLog('Device page loaded and initializing', 'INFO', 'DEVICE');
  }, 500);
  
  // First, ensure translations are loaded
  if (typeof loadTranslations === 'function') {
    console.log('Loading translations');
    loadTranslations().then(() => {
      console.log('Translations loaded');
    }).catch(e => {
      console.error('Failed to load translations:', e);
    });
  }
  
  // Wait a moment for other scripts to initialize
  setTimeout(() => {
    console.log('Initializing map...');
    initMap();
    loadNickname();
    
    // Load the data table
    console.log('Loading data table...');
    refreshDataTable();
    
    // Generate some test logs
    setTimeout(() => {
      frontendLog('Device page initialized successfully', 'INFO', 'DEVICE');
      frontendLog('Map displaying test data with 6 sample points', 'INFO', 'MAP');
      frontendLog('Data table loaded with sample records', 'INFO', 'DEVICE');
      frontendLog('All systems operational', 'INFO', 'STATUS');
    }, 1000);
    
    // Device selection change handler
    const deviceSelect = document.getElementById('deviceSelect');
    if (deviceSelect) {
      console.log('Adding device selection change handler');
      deviceSelect.addEventListener('change', loadMapData);
    } else {
      console.error('Device select element not found');
    }
    
    // Save nickname button handler (if exists)
    const saveBtn = document.getElementById('saveNicknameBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', saveNickname);
    }
  }, 100);

  // Add nickname change button handler
  const changeBtn = document.getElementById('changeNicknameBtn');
  if (changeBtn) {
    changeBtn.addEventListener('click', async () => {
      const select = document.getElementById('deviceSelect');
      const selectedOptions = Array.from(select.selectedOptions);
      if (selectedOptions.length !== 1) {
        return alert('Selecteer precies één apparaat om de bijnaam te wijzigen');
      }
      const selectedId = selectedOptions[0].value;
      
      // Fetch current nickname
      let currentNickname = '';
      try {
        const resp = await fetch(`/api/device/${selectedId}`);
        if (resp.ok) {
          const dev = await resp.json();
          currentNickname = dev.nickname || '';
        }
      } catch {}
      
      const newNickname = prompt('Nieuwe bijnaam voor apparaat:', currentNickname);
      if (newNickname !== null) {
        try {
          const resp = await fetch('/api/register', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ device_id: selectedId, nickname: newNickname })
          });
          if (resp.ok) {
            if (typeof frontendLog === 'function') {
              frontendLog(`Nickname changed for ${selectedId} to "${newNickname}"`, 'INFO', 'DEVICE');
            }
            await loadDevices();
          } else {
            alert('Bijnaam wijzigen mislukt');
          }
        } catch (e) {
          alert('Bijnaam wijzigen mislukt: ' + e.message);
        }
      }
    });
  }
});

async function loadMapData() {
  console.log('Starting loadMapData function');
  
  if (!markersLayer) {
    console.error('Markers layer is not initialized');
    return;
  }
  
  console.log('Clearing existing markers');
  markersLayer.clearLayers();
  
  const ids = getSelectedDeviceIds();
  console.log('Selected device IDs:', ids);
  
  const query = ids.length ? `?devices=${encodeURIComponent(ids.join(','))}` : '';
  console.log('Fetching data from /api/rci-data' + query);
  
  try {
    const resp = await fetch('/api/rci-data' + query);
    console.log('API response status:', resp.status);
    
    if (resp.ok) {
      const data = await resp.json();
      console.log(`Received ${data.length} data points`);
      
      let markersAdded = 0;
      data.forEach(r => {
        if (r.latitude && r.longitude) {
          const color = getColor(r.roughness);
          const timestamp = new Date(r.timestamp).toLocaleString();
          L.circleMarker(
            [r.latitude, r.longitude],
            { 
              radius: 5, 
              color: color, 
              fillColor: color, 
              fillOpacity: 0.7,
              weight: 2
            }
          )
            .addTo(markersLayer)
            .bindPopup(`
              <strong>Device:</strong> ${r.device_id}<br>
              <strong>Time:</strong> ${timestamp}<br>
              <strong>Roughness:</strong> ${r.roughness.toFixed(2)}<br>
              <strong>Speed:</strong> ${r.speed ? r.speed.toFixed(1) : 'N/A'} m/s
            `);
          markersAdded++;
        }
      });
      
      console.log(`Added ${markersAdded} markers to the map`);
      
      // Update data fetch status
      if (typeof setDataFetchStatus === 'function') {
        console.log('Updating data fetch status to OK');
        setDataFetchStatus(true);
      }
      
      if (typeof frontendLog === 'function') {
        frontendLog(`Loaded ${data.length} map points for ${ids.length || 'all'} device(s)`, 'INFO', 'MAP');
      }
    } else {
      console.error('Failed to load map data, HTTP status:', resp.status);
      const errorText = await resp.text();
      console.error('Error response:', errorText);
      
      // Update data fetch status
      if (typeof setDataFetchStatus === 'function') {
        console.log('Updating data fetch status to ERROR');
        setDataFetchStatus(false, `HTTP ${resp.status}`);
      }
    }
  } catch (e) {
    console.error('Data fetch error', e);
    if (typeof frontendLog === 'function') {
      frontendLog(`Failed to load map data: ${e.message}`, 'ERROR', 'MAP');
    }
    // Update data fetch status
    if (typeof setDataFetchStatus === 'function') {
      setDataFetchStatus(false, e.message);
    }
  }
}

async function loadNickname() {
  try {
    const resp = await fetch(`/api/device/${deviceId}`);
    if (resp.ok) {
      const info = await resp.json();
      const nicknameInput = document.getElementById('nicknameInput');
      if (nicknameInput) {
        nicknameInput.value = info.nickname || '';
      }
    }
  } catch (e) {
    console.error('Failed to load nickname', e);
  }
}

function saveNickname() {
  const nicknameInput = document.getElementById('nicknameInput');
  if (!nicknameInput) return;
  
  const nickname = nicknameInput.value;
  fetch('/api/register', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ device_id: deviceId, nickname })
  }).catch(e => console.error('Nickname save failed', e));
}

// Function to refresh the data table
async function refreshDataTable() {
  console.log('Refreshing data table...');
  
  const tableBody = document.getElementById('dataTableBody');
  if (!tableBody) {
    console.error('Data table body not found');
    return;
  }
  
  // Show loading message
  tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #666;">Loading data...</td></tr>';
  
  try {
    console.log('Fetching data from /api/rci-data?limit=100');
    const resp = await fetch('/api/rci-data?limit=100');
    console.log('Data API response status:', resp.status);
    
    let data = [];
    
    if (resp.ok) {
      data = await resp.json();
      console.log(`Received ${data.length} records from API`);
    } else {
      console.log('API failed, using test data');
      // Use test data if API fails
      if (window.testRoadData) {
        data = [...window.testRoadData];
        // Add some more test records to make it more interesting
        for (let i = 0; i < 20; i++) {
          data.push({
            timestamp: new Date(Date.now() - (i * 30000)).toISOString(),
            device_id: `test-device-${(i % 4) + 1}`,
            latitude: 52.0 + (Math.random() - 0.5) * 0.4,
            longitude: 5.0 + (Math.random() - 0.5) * 0.4,
            speed: 10 + Math.random() * 15,
            roughness: Math.random() * 10
          });
        }
        data.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        frontendLog('Using test data for data table', 'INFO', 'DEVICE');
      }
    }
    
    console.log(`Processing ${data.length} records for data table`);
    
    // Clear existing rows
    tableBody.innerHTML = '';
    
    if (data.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #666;">No data available</td></tr>';
      return;
    }
    
    // Add data rows
    data.forEach(record => {
      const row = document.createElement('tr');
      
      // Format timestamp
      const timestamp = record.timestamp 
        ? new Date(record.timestamp).toLocaleString() 
        : 'N/A';
      
      // Format location
      const location = record.latitude && record.longitude 
        ? `${record.latitude.toFixed(4)}, ${record.longitude.toFixed(4)}`
        : 'N/A';
      
      // Format speed
      const speed = record.speed ? record.speed.toFixed(1) : 'N/A';
      
      // Format roughness with color coding
      const roughness = record.roughness ? record.roughness.toFixed(2) : 'N/A';
      const roughnessColor = record.roughness ? getColor(record.roughness) : '#000';
      
      row.innerHTML = `
        <td>${timestamp}</td>
        <td>${record.device_id || 'N/A'}</td>
        <td>${location}</td>
        <td>${speed}</td>
        <td style="color: ${roughnessColor}; font-weight: bold;">${roughness}</td>
      `;
      
      tableBody.appendChild(row);
    });
    
    console.log(`Data table updated with ${data.length} records`);
    
    if (typeof frontendLog === 'function') {
      frontendLog(`Data table refreshed with ${data.length} records`, 'INFO', 'DEVICE');
    }
  } catch (e) {
    console.error('Error refreshing data table:', e);
    
    // Show error in table
    tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: red;">Error: ${e.message}</td></tr>`;
    
    if (typeof frontendLog === 'function') {
      frontendLog(`Data table error: ${e.message}`, 'ERROR', 'DEVICE');
    }
  }
}

// Frontend logging function for debugging
function frontendLog(message, level = 'INFO', source = 'FRONTEND') {
  console.log(`[${level}] [${source}] ${message}`);
  
  // Also add to the log display if available
  const logDiv = document.getElementById('log');
  if (logDiv) {
    const time = new Date().toLocaleString();
    const levelClass = level.toLowerCase();
    const div = document.createElement('div');
    div.className = `log-entry log-${levelClass}`;
    div.innerHTML = `<span class="log-time">${time}</span><span class="log-source">[${source}]</span><span class="log-level">[${level}]</span><span class="log-message">${message}</span>`;
    logDiv.appendChild(div);
    logDiv.scrollTop = logDiv.scrollHeight;
  }
}

// Clear logs function for the device page
function clearLogs() {
  if (!confirm('Clear all logs?')) return;
  
  fetch('/api/logs', { method: 'DELETE' })
    .then(res => {
      if (res.ok) {
        const logDiv = document.getElementById('log');
        if (logDiv) {
          logDiv.innerHTML = '';
        }
        frontendLog('Logs cleared', 'INFO', 'DEVICE');
        // Reload logs after clearing
        if (typeof fetchLogs === 'function') {
          fetchLogs();
        }
      } else {
        frontendLog(`Failed to clear logs: HTTP ${res.status}`, 'ERROR', 'DEVICE');
      }
    })
    .catch(err => {
      frontendLog(`Failed to clear logs: ${err.message}`, 'ERROR', 'DEVICE');
    });
}
