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
            .bindPopup(`${r.timestamp} - ruwheid: ${r.roughness}`);
        }
      });
    }
  } catch (e) {
    console.error('Data fetch error', e);
  }
}

document.addEventListener('DOMContentLoaded', initMap);
