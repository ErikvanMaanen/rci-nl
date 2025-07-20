// Track the most recent log timestamp to fetch only newer logs
let lastLogTimestamp = '';

function fetchLogs(){
  const logDiv = document.getElementById('log');
  if(!logDiv) return;
  
  // Only fetch logs newer than the last one we've seen
  const endpoint = lastLogTimestamp 
    ? `/api/logs?since=${encodeURIComponent(lastLogTimestamp)}` 
    : '/api/logs?limit=20'; // Initially fetch a reasonable number
    
  fetch(endpoint)
    .then(r => {
      if (!r.ok) {
        throw new Error(`HTTP error ${r.status}: ${r.statusText}`);
      }
      return r.json();
    })
    .then(newLogs => {
      if (!newLogs || !Array.isArray(newLogs) || newLogs.length === 0) {
        return; // No new logs to display
      }
      
      // Find the most recent timestamp for subsequent fetches
      const timestamps = newLogs.map(l => l.log_time).filter(Boolean);
      if (timestamps.length > 0) {
        lastLogTimestamp = timestamps.reduce((a, b) => a > b ? a : b);
      }
      
      // Generate HTML for new logs and append to log div
      const newLogHtml = newLogs.map(l => {
        const time = new Date(l.log_time).toLocaleString();
        const levelClass = l.level ? l.level.toLowerCase() : 'info';
        const source = l.source ? `[${l.source}]` : '';
        return `<div class="log-entry log-${levelClass}">`+
          `<span class="log-time">${time}</span>`+
          `<span class="log-source">${source}</span>`+
          `<span class="log-level">[${l.level || 'INFO'}]</span>`+
          `<span class="log-message">${l.message}</span>`+
          `</div>`;
      }).join('');
      
      // Append new logs rather than replacing all logs
      const existingLogs = logDiv.innerHTML;
      logDiv.innerHTML = existingLogs + newLogHtml;
      
      // Limit log entries to avoid memory issues (keep latest 100)
      const entries = logDiv.querySelectorAll('.log-entry');
      if (entries.length > 100) {
        for (let i = 0; i < entries.length - 100; i++) {
          entries[i].remove();
        }
      }
      
      // Auto-scroll to bottom
      logDiv.scrollTop = logDiv.scrollHeight;
      
      // Update log fetch status
      if (typeof setLogFetchStatus === 'function') {
        setLogFetchStatus(true);
      }
    })
    .catch(err => {
      // Update log fetch status
      if (typeof setLogFetchStatus === 'function') {
        setLogFetchStatus(false, err.message);
      }
      
      // Display the error directly in the log div
      const errorHtml = `
        <div class="log-entry log-error">
          <span class="log-time">${new Date().toLocaleString()}</span>
          <span class="log-source">[LOG_FETCH]</span>
          <span class="log-level">[ERROR]</span>
          <span class="log-message">Failed to fetch logs: ${err.message}</span>
        </div>`;
      
      logDiv.innerHTML += errorHtml;
      logDiv.scrollTop = logDiv.scrollHeight;
      
      // Also log to console/frontend log if available
      if (typeof frontendLog === 'function') {
        frontendLog(`Failed to fetch logs: ${err.message}`, 'ERROR', 'LOG_FETCH');
      } else {
        console.error('Failed to fetch logs', err);
      }
    });
}

function clearLogs() {
  if (!confirm('Clear all logs?')) return;
  fetch('/api/logs', { method: 'DELETE' })
    .then(res => {
      if (res.ok) {
        fetchLogs();
        if (typeof frontendLog === 'function') {
          frontendLog('Logs cleared', 'INFO', 'MAINTENANCE');
        }
      } else if (typeof frontendLog === 'function') {
        frontendLog(`Failed to clear logs: HTTP ${res.status}`, 'ERROR', 'MAINTENANCE');
      }
    })
    .catch(err => {
      if (typeof frontendLog === 'function') {
        frontendLog(`Failed to clear logs: ${err.message}`, 'ERROR', 'MAINTENANCE');
      }
    });
}

if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const levelSelect = document.getElementById('logLevelFilter');
    const sourceSelect = document.getElementById('logSourceFilter');
    const apiSelect = document.getElementById('logApiFilter');
    const clearBtn = document.getElementById('clearLogsBtn');
    if(levelSelect){
      const getLevels = () => Array.from(levelSelect.selectedOptions).map(o => o.value).filter(Boolean);
      currentLevelFilter = getLevels();
      levelSelect.addEventListener('change', () => {
        currentLevelFilter = getLevels();
        fetchLogs();
      });
    }
    if(sourceSelect){
      const getSources = () => Array.from(sourceSelect.selectedOptions).map(o => o.value).filter(Boolean);
      currentSourceFilter = getSources();
      sourceSelect.addEventListener('change', () => {
        currentSourceFilter = getSources();
        fetchLogs();
      });
    }
    if(apiSelect){
      const getApis = () => Array.from(apiSelect.selectedOptions).map(o => o.value).filter(Boolean);
      currentApiFilter = getApis();
      apiSelect.addEventListener('change', () => {
        currentApiFilter = getApis();
        fetchLogs();
      });
    }
    if(clearBtn){
      clearBtn.addEventListener('click', clearLogs);
    }
    fetchLogs();
    setInterval(fetchLogs, 5000);
  });
}
