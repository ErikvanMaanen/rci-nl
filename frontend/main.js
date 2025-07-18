// ----- Startup Tasks -----
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js');
}

// Frontend logging function that sends logs to backend
function frontendLog(message, level = 'INFO', source = 'FRONTEND') {
  // Skip empty or trivial messages
  if (!message || message.trim() === '' || message.length < 3) {
    return;
  }
  
  // Skip repetitive timestamp-only messages
  if (message.match(/^\[20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
    return;
  }
  
  // Send to backend database (only for important messages)
  if (level !== 'INFO' || source !== 'FRONTEND_CONSOLE') {
    fetch('/api/logs', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ message, level, source })
    }).then(response => {
      if (response.ok && typeof setLogWriteStatus === 'function') {
        setLogWriteStatus(true);
      } else if (!response.ok && typeof setLogWriteStatus === 'function') {
        setLogWriteStatus(false, `HTTP ${response.status}`);
      }
    }).catch(err => {
      // Use original console methods to avoid recursion
      originalConsoleError('Failed to send log to backend:', err);
      if (typeof setLogWriteStatus === 'function') {
        setLogWriteStatus(false, err.message);
      }
    });
  }
  
  // Only log important messages to console to avoid spam
  if (level === 'ERROR' || level === 'WARN' || source !== 'FRONTEND_CONSOLE') {
    const formattedMessage = `[${level}] [${source}] ${message}`;
    switch (level.toUpperCase()) {
      case 'ERROR':
        originalConsoleError(formattedMessage);
        break;
      case 'WARN':
        originalConsoleWarn(formattedMessage);
        break;
      default:
        if (source !== 'FRONTEND_CONSOLE') {
          originalConsoleLog(formattedMessage);
        }
    }
  }
}

// Override console methods to capture only important frontend logs
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

// Only capture console.error and console.warn, not regular console.log to reduce spam
console.error = function(...args) {
  const message = args.join(' ');
  if (message && message.trim() !== '') {
    frontendLog(message, 'ERROR', 'FRONTEND_CONSOLE');
  }
  originalConsoleError.apply(console, args);
};

console.warn = function(...args) {
  const message = args.join(' ');
  if (message && message.trim() !== '') {
    frontendLog(message, 'WARN', 'FRONTEND_CONSOLE');
  }
  originalConsoleWarn.apply(console, args);
};

// Don't override console.log to prevent logging spam

const recordBtn = document.getElementById('recordBtn');
const chartCanvas = document.getElementById('chart');
const ctx = chartCanvas.getContext('2d');
const logDiv = document.getElementById('log');
const locationStatus = document.getElementById('locationStatus');
const dbStatus = document.getElementById('dbStatus');
const logWriteStatus = document.getElementById('logWriteStatus');
const logFetchStatus = document.getElementById('logFetchStatus');
const dataWriteStatus = document.getElementById('dataWriteStatus');
const dataFetchStatus = document.getElementById('dataFetchStatus');
const testStatus = document.getElementById('testStatus');
let chartData = [];
// --- Status Indicator Helpers ---
function setLocationStatus(ok) {
  if (locationStatus) {
    locationStatus.style.color = ok ? '#4CAF50' : '#F44336';
    locationStatus.textContent = '●';
    locationStatus.title = ok ? t('locationOkTitle') : t('locationErrorTitle');
  }
}

function setDbStatus(ok) {
  if (dbStatus) {
    dbStatus.style.color = ok ? '#4CAF50' : '#F44336';
    dbStatus.textContent = '●';
    dbStatus.title = ok ? t('dbOkTitle') : t('dbErrorTitle');
  }
}

function setLogWriteStatus(ok, error = '') {
  if (logWriteStatus) {
    logWriteStatus.style.color = ok ? '#4CAF50' : '#F44336';
    logWriteStatus.textContent = '●';
    logWriteStatus.title = ok ? t('logWriteOkTitle') : t('logWriteErrorTitle') + (error ? ': ' + error : '');
  }
}

function setLogFetchStatus(ok, error = '') {
  if (logFetchStatus) {
    logFetchStatus.style.color = ok ? '#4CAF50' : '#F44336';
    logFetchStatus.textContent = '●';
    logFetchStatus.title = ok ? t('logFetchOkTitle') : t('logFetchErrorTitle') + (error ? ': ' + error : '');
  }
}

function setDataWriteStatus(ok, error = '') {
  if (dataWriteStatus) {
    dataWriteStatus.style.color = ok ? '#4CAF50' : '#F44336';
    dataWriteStatus.textContent = '●';
    dataWriteStatus.title = ok ? t('dataWriteOkTitle') : t('dataWriteErrorTitle') + (error ? ': ' + error : '');
  }
}

function setDataFetchStatus(ok, error = '') {
  if (dataFetchStatus) {
    dataFetchStatus.style.color = ok ? '#4CAF50' : '#F44336';
    dataFetchStatus.textContent = '●';
    dataFetchStatus.title = ok ? t('dataFetchOkTitle') : t('dataFetchErrorTitle') + (error ? ': ' + error : '');
  }
}

function setTestStatus(ok, error = '') {
  if (testStatus) {
    testStatus.style.color = ok ? '#4CAF50' : '#F44336';
    testStatus.textContent = '●';
    testStatus.title = ok ? t('testOkTitle') : t('testErrorTitle') + (error ? ': ' + error : '');
  }
}

setLocationStatus(false); // Default: not receiving
setDbStatus(false); // Default: not connected
setLogWriteStatus(false); // Default: not tested
setLogFetchStatus(false); // Default: not tested
setDataWriteStatus(false); // Default: not tested
setDataFetchStatus(false); // Default: not tested
setTestStatus(false); // Default: not tested

let watchId;
let recording = false;
let db;
let bias = {x:0,y:0,z:0};
let sampleBuffer = [];
let positionBuffer = [];
let currentPos = null;
let distance = 0;
let lastPos = null;
const fs = 50; // sample frequency
const highPassCut = 0.5;
const lowPassCut = 50;
const algorithmVersion = '1.0';

const deviceId = getDeviceId();

// Startup initialization
openDb();
checkLocationStatus();
runStartupTests();

recordBtn.addEventListener('click', () => {
  if (recording) {
    stopRecording();
  } else {
    startRecording();
  }
});

function getDeviceId() {
  let id = localStorage.getItem('device_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('device_id', id);
    frontendLog(`Generated new device ID: ${id}`, 'INFO', 'DEVICE');
    fetch('/api/register', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ device_id: id })
    }).then(() => {
      frontendLog(`Device registered successfully: ${id}`, 'INFO', 'DEVICE');
    }).catch(err => {
      frontendLog(`Device registration failed: ${err.message}`, 'ERROR', 'DEVICE');
    });
  }
  // Don't log when using existing device ID to reduce spam
  return id;
}

// ----- Data Storage and Retrieval -----
function openDb() {
  const request = indexedDB.open('rci', 1);
  request.onupgradeneeded = function(e) {
    const db = e.target.result;
    db.createObjectStore('measurements', {keyPath:'id', autoIncrement: true});
    frontendLog('IndexedDB created/upgraded', 'INFO', 'DATABASE');
  };
  request.onsuccess = function(e) { 
    db = e.target.result;
    // Don't log successful connection to reduce spam
  };
  request.onerror = function(e) {
    frontendLog(`IndexedDB connection failed: ${e.target.error}`, 'ERROR', 'DATABASE');
  };
}

function startRecording() {
  if (recording) return;
  frontendLog('Starting recording session', 'INFO', 'RECORDING');
  requestPermissions().then(() => {
    bias = {x:0,y:0,z:0};
    sampleBuffer = [];
    positionBuffer = [];
    distance = 0;
    lastPos = null;
    recording = true;
    recordBtn.textContent = t('stopButton');
    watchId = navigator.geolocation.watchPosition(
      pos => {
        setLocationStatus(true);
        onPosition(pos);
      },
      err => {
        setLocationStatus(false);
        frontendLog('Locatie fout: ' + err.message, 'ERROR', 'LOCATION');
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 }
    );
    window.addEventListener('devicemotion', onMotion);
    // Don't log successful start to reduce spam
  }).catch(err => {
    setLocationStatus(false);
    frontendLog(`Locatie permissie geweigerd: ${err}`, 'ERROR', 'LOCATION');
  });
}

function stopRecording() {
  if (!recording) return;
  // Don't log stopping to reduce spam
  navigator.geolocation.clearWatch(watchId);
  window.removeEventListener('devicemotion', onMotion);
  recording = false;
  recordBtn.textContent = t('startButton');
  setLocationStatus(false);
  frontendLog('Recording session stopped', 'INFO', 'RECORDING');
}

function requestPermissions() {
  const geoPromise = new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      () => resolve('granted'),
      err => reject(err)
    );
  });
  const motionPromise = DeviceMotionEvent.requestPermission
    ? DeviceMotionEvent.requestPermission()
    : Promise.resolve('granted');
  return Promise.all([geoPromise, motionPromise]);
}

function checkLocationStatus() {
  navigator.geolocation.getCurrentPosition(
    () => setLocationStatus(true),
    () => {
      setLocationStatus(false);
      requestPermissions().catch(() => {});
    }
  );
}

function onPosition(pos) {
  setLocationStatus(true);
  currentPos = pos;
  positionBuffer.push({time: Date.now(), speed: pos.coords.speed || 0});
  if (lastPos) {
    distance += haversine(lastPos.coords.latitude, lastPos.coords.longitude, pos.coords.latitude, pos.coords.longitude);
  }
  lastPos = pos;
}

function onMotion(e) {
  const acc = e.acceleration;
  if (!acc) return;
  const z = filter(acc.z - bias.z);
  sampleBuffer.push({t: Date.now(), z});
  if (sampleBuffer.length >= fs) {
    processWindow();
    sampleBuffer = [];
  }
  drawChart(z);
}

// ----- Roughness Calculation -----
function processWindow() {
  const values = sampleBuffer.map(s => s.z);
  const rms = Math.sqrt(values.reduce((s,v) => s+v*v,0)/values.length);
  const vdv = Math.pow(values.reduce((s,v)=>s+Math.pow(Math.abs(v),4),0)/values.length,0.25);
  const cf = Math.max(...values.map(v=>Math.abs(v)))/rms;

  const lat = currentPos ? currentPos.coords.latitude : null;
  const lon = currentPos ? currentPos.coords.longitude : null;
  const speed = currentPos && currentPos.coords.speed != null ? currentPos.coords.speed : 0;
  const direction = currentPos && currentPos.coords.heading != null ? currentPos.coords.heading : 0;
  const avg_speed = positionBuffer.length ? positionBuffer.reduce((s,p)=>s+p.speed,0)/positionBuffer.length : 0;
  const interval_s = positionBuffer.length>1 ? (positionBuffer[positionBuffer.length-1].time - positionBuffer[0].time)/1000 : 0;
  positionBuffer = [];

  const record = {
    timestamp: new Date().toISOString(),
    device_id: deviceId,
    latitude: lat,
    longitude: lon,
    speed,
    direction,
    distance_m: distance,
    roughness: rms,
    vdv,
    crest_factor: cf,
    z_values: values,
    avg_speed,
    interval_s,
    algorithm_version: algorithmVersion
  };
  saveRecord(record);
  uploadRecord(record);
}

function saveRecord(rec) {
  if (!db) return;
  const tx = db.transaction('measurements', 'readwrite');
  tx.objectStore('measurements').add(rec);
}

function uploadRecord(rec) {
  fetch('/api/upload', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify(rec)
  }).then(response => {
    if (!response.ok) {
      frontendLog(`Data upload failed with status: ${response.status}`, 'ERROR', 'UPLOAD');
      if (typeof setDataWriteStatus === 'function') {
        setDataWriteStatus(false, `HTTP ${response.status}`);
      }
    } else {
      // Don't log successful uploads to reduce spam - they happen very frequently
      if (typeof setDataWriteStatus === 'function') {
        setDataWriteStatus(true);
      }
    }
  }).catch(err => {
    frontendLog(`Data upload error: ${err.message}`, 'ERROR', 'UPLOAD');
    if (typeof setDataWriteStatus === 'function') {
      setDataWriteStatus(false, err.message);
    }
  });
}

function haversine(lat1, lon1, lat2, lon2) {
  function toRad(x){return x*Math.PI/180;}
  const R = 6371000; // m
  const dLat = toRad(lat2-lat1);
  const dLon = toRad(lon2-lon1);
  const a = Math.sin(dLat/2)*Math.sin(dLat/2)+
            Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*
            Math.sin(dLon/2)*Math.sin(dLon/2);
  const c = 2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R*c;
}

// Simple high-pass + low-pass (not full Butterworth but placeholder)
let hpPrev = 0, lpPrev = 0;
function filter(value){
  const dt = 1/fs;
  const rcHp = 1/(2*Math.PI*highPassCut);
  const rcLp = 1/(2*Math.PI*lowPassCut);
  const hp = hpPrev + (dt/(rcHp+dt))*(value-hpPrev);
  hpPrev = hp;
  const lp = lpPrev + (dt/(rcLp+dt))*(hp-lpPrev);
  lpPrev = lp;
  return lp;
}

function drawChart(value){
  chartData.push(value);
  if (chartData.length>chartCanvas.width){chartData.shift();}
  ctx.clearRect(0,0,chartCanvas.width,chartCanvas.height);
  ctx.beginPath();
  chartData.forEach((v,i)=>{
    const y=chartCanvas.height/2 - v*10;
    if(i===0) ctx.moveTo(i,y); else ctx.lineTo(i,y);
  });
  ctx.stroke();
}

// --- Database Status Polling ---
async function checkDbStatus() {
  try {
    // Use logs endpoint as a simple DB check
    const resp = await fetch('/api/logs?limit=1');
    if (resp.ok) {
      setDbStatus(true);
    } else {
      setDbStatus(false);
    }
  } catch (e) {
    setDbStatus(false);
  }
}

setInterval(checkDbStatus, 5000);
checkDbStatus();

// --- Startup Tests ---
async function runStartupTests() {
  frontendLog('Running startup tests...', 'INFO', 'STARTUP_TESTS');
  
  const tests = [
    testLogWriting,
    testLogFetching,
    testDataWriting,
    testDataFetching
  ];
  
  const results = await Promise.allSettled(tests.map(test => test()));
  
  const failed = results.filter(r => r.status === 'rejected');
  const passed = results.filter(r => r.status === 'fulfilled');
  
  if (failed.length === 0) {
    setTestStatus(true);
    frontendLog(`All startup tests passed (${passed.length}/${results.length})`, 'INFO', 'STARTUP_TESTS');
  } else {
    const errors = failed.map(r => r.reason?.message || r.reason).join(', ');
    setTestStatus(false, errors);
    frontendLog(`Startup tests failed: ${failed.length}/${results.length} - ${errors}`, 'ERROR', 'STARTUP_TESTS');
  }
}

async function testLogWriting() {
  try {
    const testMessage = 'Test log message from startup test';
    const response = await fetch('/api/logs', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        message: testMessage,
        level: 'INFO',
        source: 'STARTUP_TEST'
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    setLogWriteStatus(true);
    return true;
  } catch (error) {
    setLogWriteStatus(false, error.message);
    throw error;
  }
}

async function testLogFetching() {
  try {
    const response = await fetch('/api/logs?limit=1');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const logs = await response.json();
    if (!Array.isArray(logs)) {
      throw new Error('Invalid response format');
    }
    
    setLogFetchStatus(true);
    return true;
  } catch (error) {
    setLogFetchStatus(false, error.message);
    throw error;
  }
}

async function testDataWriting() {
  try {
    const testData = {
      device_id: deviceId,
      timestamp: new Date().toISOString(),
      latitude: 52.0,
      longitude: 5.0,
      speed: 0,
      direction: 0,
      distance_m: 0,
      roughness: 0.1,
      vdv: 0.1,
      crest_factor: 1.0,
      z_values: [0.1, 0.2, 0.1],
      avg_speed: 0,
      interval_s: 1.0,
      algorithm_version: algorithmVersion
    };
    
    const response = await fetch('/api/upload', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(testData)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    setDataWriteStatus(true);
    return true;
  } catch (error) {
    setDataWriteStatus(false, error.message);
    throw error;
  }
}

async function testDataFetching() {
  try {
    const response = await fetch('/api/rci-data?limit=1');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error('Invalid response format');
    }
    
    setDataFetchStatus(true);
    return true;
  } catch (error) {
    setDataFetchStatus(false, error.message);
    throw error;
  }
}

// Global error handling
window.addEventListener('error', function(event) {
  frontendLog(`Unhandled error: ${event.error?.message || event.message} at ${event.filename}:${event.lineno}:${event.colno}`, 'ERROR', 'GLOBAL_ERROR');
});

window.addEventListener('unhandledrejection', function(event) {
  frontendLog(`Unhandled promise rejection: ${event.reason}`, 'ERROR', 'PROMISE_REJECTION');
});

// Log application startup
frontendLog('RIBS Tracker initialized', 'INFO', 'STARTUP');
