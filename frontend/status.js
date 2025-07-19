// Shared status indicator helpers for frontend pages

const dbStatus = document.getElementById('dbStatus');
const logWriteStatus = document.getElementById('logWriteStatus');
const logFetchStatus = document.getElementById('logFetchStatus');
const dataWriteStatus = document.getElementById('dataWriteStatus');
const dataFetchStatus = document.getElementById('dataFetchStatus');
const testStatus = document.getElementById('testStatus');

function tr(key){
  return (typeof t === 'function') ? t(key) : key;
}

function setStatus(el, ok, okKey, errKey, error='') {
  if (!el) return;
  el.style.color = ok ? '#4CAF50' : '#F44336';
  el.textContent = '●';
  const okTitle = tr(okKey);
  const errTitle = tr(errKey);
  el.title = ok ? okTitle : errTitle + (error ? ': ' + error : '');
}

function setDbStatus(ok, error=''){ setStatus(dbStatus, ok, 'dbOkTitle', 'dbErrorTitle', error); }
function setLogWriteStatus(ok, error=''){ setStatus(logWriteStatus, ok, 'logWriteOkTitle', 'logWriteErrorTitle', error); }
function setLogFetchStatus(ok, error=''){ setStatus(logFetchStatus, ok, 'logFetchOkTitle', 'logFetchErrorTitle', error); }
function setDataWriteStatus(ok, error=''){ setStatus(dataWriteStatus, ok, 'dataWriteOkTitle', 'dataWriteErrorTitle', error); }
function setDataFetchStatus(ok, error=''){ setStatus(dataFetchStatus, ok, 'dataFetchOkTitle', 'dataFetchErrorTitle', error); }
function setTestStatus(ok, error=''){ setStatus(testStatus, ok, 'testOkTitle', 'testErrorTitle', error); }

setDbStatus(false);
setLogWriteStatus(false);
setLogFetchStatus(false);
setDataWriteStatus(false);
setDataFetchStatus(false);
setTestStatus(false);

function getDeviceId(){
  let id = localStorage.getItem('device_id');
  if(!id){
    id = crypto.randomUUID();
    localStorage.setItem('device_id', id);
    fetch('/api/register', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ device_id: id })
    }).catch(()=>{});
  }
  return id;
}

async function checkDbStatus(){
  try{
    const resp = await fetch('/api/logs?limit=1');
    if(resp.ok){
      setDbStatus(true);
    }else{
      setDbStatus(false, `HTTP ${resp.status}`);
    }
  }catch(e){
    setDbStatus(false, e.message);
  }
}

async function testLogWriting(){
  try{
    const resp = await fetch('/api/logs', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ message:'Test log from status.js', level:'INFO', source:'STATUS_TEST' })
    });
    if(!resp.ok) throw new Error(`HTTP ${resp.status}`);
    setLogWriteStatus(true);
    return true;
  }catch(e){
    setLogWriteStatus(false, e.message);
    throw e;
  }
}

async function testLogFetching(){
  try{
    const resp = await fetch('/api/logs?limit=1');
    if(!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const logs = await resp.json();
    if(!Array.isArray(logs)) throw new Error('Invalid response');
    setLogFetchStatus(true);
    return true;
  }catch(e){
    setLogFetchStatus(false, e.message);
    throw e;
  }
}

async function testDataWriting(){
  try{
    const testData = {
      device_id: getDeviceId(),
      timestamp: new Date().toISOString(),
      latitude: 52.0,
      longitude: 5.0,
      speed: 0,
      direction: 0,
      distance_m: 0,
      roughness: 0.1,
      vdv: 0.1,
      crest_factor: 1.0,
      z_values: [0.1,0.2,0.1],
      avg_speed: 0,
      interval_s: 1.0,
      algorithm_version: '1.0'
    };
    const resp = await fetch('/api/upload', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(testData)
    });
    if(!resp.ok) throw new Error(`HTTP ${resp.status}`);
    setDataWriteStatus(true);
    return true;
  }catch(e){
    setDataWriteStatus(false, e.message);
    throw e;
  }
}

async function testDataFetching(){
  try{
    const resp = await fetch('/api/rci-data?limit=1');
    if(!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    if(!Array.isArray(data)) throw new Error('Invalid response');
    setDataFetchStatus(true);
    return true;
  }catch(e){
    setDataFetchStatus(false, e.message);
    throw e;
  }
}

async function runStartupTests(){
  const tests = [testLogWriting, testLogFetching, testDataWriting, testDataFetching];
  const results = await Promise.allSettled(tests.map(t => t()));
  const failed = results.filter(r => r.status === 'rejected');
  if(failed.length === 0){
    setTestStatus(true);
  }else{
    const errors = failed.map(r => r.reason?.message || r.reason).join(', ');
    setTestStatus(false, errors);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  checkDbStatus();
  runStartupTests();
  setInterval(checkDbStatus, 5000);
});

