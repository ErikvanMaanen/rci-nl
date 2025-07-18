let map;
let markersLayer;

async function initMap() {
  map = L.map('map');

  // try get current location
  navigator.geolocation.getCurrentPosition(pos => {
    const {latitude, longitude} = pos.coords;
    map.setView([latitude, longitude], 13);
  }, () => {
    // fallback centre Netherlands
    map.setView([52.1, 5.1], 7);
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);
  await loadDevices();
  await loadMapData();
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
        .map(d => `<option value="${d.id}">${d.id}${d.nickname ? ` (${d.nickname})` : ''}</option>`)
        .join('');
    }
  } catch (e) {
    console.error('Failed to load devices', e);
  }
}

// Add nickname change button logic
document.addEventListener('DOMContentLoaded', () => {
  // ...existing code...
  deviceId = getDeviceId();
  initMap();
  loadNickname();
  document.getElementById('saveNicknameBtn')?.addEventListener('click', saveNickname);
  document.getElementById('deviceSelect').addEventListener('change', loadMapData);

  // Add nickname change button handler
  const changeBtn = document.getElementById('changeNicknameBtn');
  if (changeBtn) {
    changeBtn.addEventListener('click', async () => {
      const select = document.getElementById('deviceSelect');
      const selectedId = select.value;
      if (!selectedId) return alert('Selecteer een apparaat');
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
            if (typeof frontendLog === 'function') frontendLog(`Nickname changed for ${selectedId} to "${newNickname}"`, 'INFO', 'DEVICE');
            loadDevices();
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
          L.circleMarker(
            [r.latitude, r.longitude],
            { radius: 6, color: getColor(r.roughness), fillColor: getColor(r.roughness), fillOpacity: 0.8 }
          )
            .addTo(markersLayer)
            .bindPopup(`${r.timestamp} - ${t('roughnessLabel')}: ${r.roughness}`);
        }
      });
    }
  } catch (e) {
    console.error('Data fetch error', e);
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

  document.addEventListener('DOMContentLoaded', () => {
    deviceId = getDeviceId();
    initMap();
    loadNickname();
    document.getElementById('saveNicknameBtn').addEventListener('click', saveNickname);
    document.getElementById('deviceSelect').addEventListener('change', loadMapData);
  });
