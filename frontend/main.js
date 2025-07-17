if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js');
}

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const chartCanvas = document.getElementById('chart');
const ctx = chartCanvas.getContext('2d');
const logDiv = document.getElementById('log');
let chartData = [];

let watchId;
let recording = false;
let db;
let bias = {x:0,y:0,z:0};
let sampleBuffer = [];
let windowBuffer = [];
let distance = 0;
let lastPos = null;
const fs = 50; // sample frequency
const highPassCut = 0.5;
const lowPassCut = 50;
const algorithmVersion = '1.0';

const deviceId = getDeviceId();

openDb();

startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);

function getDeviceId() {
  let id = localStorage.getItem('device_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('device_id', id);
    fetch('/api/register', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ device_id: id })
    });
  }
  return id;
}

function openDb() {
  const request = indexedDB.open('rci', 1);
  request.onupgradeneeded = function(e) {
    const db = e.target.result;
    db.createObjectStore('measurements', {keyPath:'id', autoIncrement: true});
  };
  request.onsuccess = function(e) { db = e.target.result; };
}

function startRecording() {
  if (recording) return;
  requestPermissions().then(() => {
    bias = {x:0,y:0,z:0};
    sampleBuffer = [];
    windowBuffer = [];
    distance = 0;
    lastPos = null;
    recording = true;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    watchId = navigator.geolocation.watchPosition(onPosition);
    window.addEventListener('devicemotion', onMotion);
  });
}

function stopRecording() {
  if (!recording) return;
  navigator.geolocation.clearWatch(watchId);
  window.removeEventListener('devicemotion', onMotion);
  recording = false;
  startBtn.disabled = false;
  stopBtn.disabled = true;
}

function requestPermissions() {
  return Promise.all([
    navigator.permissions.query({name:'geolocation'}),
    DeviceMotionEvent.requestPermission ? DeviceMotionEvent.requestPermission() : Promise.resolve('granted')
  ]);
}

function onPosition(pos) {
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

function processWindow() {
  const values = sampleBuffer.map(s => s.z);
  const rms = Math.sqrt(values.reduce((s,v) => s+v*v,0)/values.length);
  const vdv = Math.pow(values.reduce((s,v)=>s+Math.pow(Math.abs(v),4),0)/values.length,0.25);
  const cf = Math.max(...values.map(v=>Math.abs(v)))/rms;

  const record = {
    timestamp: new Date().toISOString(),
    device_id: deviceId,
    distance_m: distance,
    roughness: rms,
    vdv,
    crest_factor: cf,
    z_values: values,
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

function fetchLogs(){
  fetch('/api/logs')
    .then(r=>r.json())
    .then(list=>{
      logDiv.innerHTML = list.map(l=>`<div>${new Date(l.log_time).toLocaleString()} - ${l.message}</div>`).join('');
      logDiv.scrollTop = logDiv.scrollHeight;
    });
}

setInterval(fetchLogs, 5000);
fetchLogs();
