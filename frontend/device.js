let map;
let markersLayer;

async function initMap() {
  map = L.map('map');

  // Try to get current location
  navigator.geolocation.getCurrentPosition(pos => {
    const {latitude, longitude} = pos.coords;
    map.setView([latitude, longitude], 13);
  }, () => {
    // Fallback to center of Netherlands
    map.setView([52.1, 5.1], 7);
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);
  
  try {
    await loadDevices();
    await loadMapData();
  } catch (e) {
    console.error('Failed to initialize map data:', e);
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
    const resp = await fetch('/api/devices');
    if (resp.ok) {
      const list = await resp.json();
      const select = document.getElementById('deviceSelect');
      select.innerHTML = list
        .map(d => `<option value="${d.device_id}">${d.device_id}${d.nickname ? ` (${d.nickname})` : ''}</option>`)
        .join('');
      
      // Automatically select all devices by default
      Array.from(select.options).forEach(option => option.selected = true);
      
      if (typeof frontendLog === 'function') {
        frontendLog(`Loaded ${list.length} devices`, 'INFO', 'DEVICE');
      }
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
  deviceId = getDeviceId();
  initMap();
  loadNickname();
  
  // Device selection change handler
  document.getElementById('deviceSelect').addEventListener('change', loadMapData);
  
  // Save nickname button handler (if exists)
  const saveBtn = document.getElementById('saveNicknameBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveNickname);
  }

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
  if (!markersLayer) return;
  markersLayer.clearLayers();
  const ids = getSelectedDeviceIds();
  const query = ids.length ? `?devices=${encodeURIComponent(ids.join(','))}` : '';
  try {
    const resp = await fetch('/api/rci-data' + query);
    if (resp.ok) {
      const data = await resp.json();
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
        }
      });
      
      // Update data fetch status
      if (typeof setDataFetchStatus === 'function') {
        setDataFetchStatus(true);
      }
      
      if (typeof frontendLog === 'function') {
        frontendLog(`Loaded ${data.length} map points for ${ids.length || 'all'} device(s)`, 'INFO', 'MAP');
      }
    } else {
      // Update data fetch status
      if (typeof setDataFetchStatus === 'function') {
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
      document.getElementById('nicknameInput').value = info.nickname || '';
    }
  } catch (e) {
    console.error('Failed to load nickname', e);
  }
}

function saveNickname() {
  const nickname = document.getElementById('nicknameInput').value;
  fetch('/api/register', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ device_id: deviceId, nickname })
  }).catch(e => console.error('Nickname save failed', e));
}
