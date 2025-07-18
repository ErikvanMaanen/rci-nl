async function initMap() {
  const map = L.map('map');

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

  try {
    const resp = await fetch('/api/rci-data');
    if (resp.ok) {
      const data = await resp.json();
      data.forEach(r => {
        if (r.latitude && r.longitude) {
          L.marker([r.latitude, r.longitude])
            .addTo(map)
            .bindPopup(`${r.timestamp} - ${t('roughnessLabel')}: ${r.roughness}`);
        }
      });
    }
  } catch (e) {
    console.error('Data fetch error', e);
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
});
