let currentLevelFilter = '';
let currentSourceFilter = '';

function fetchLogs(){
  const logDiv = document.getElementById('log');
  if(!logDiv) return;
  const params = new URLSearchParams();
  if(currentLevelFilter) params.append('level', currentLevelFilter);
  if(currentSourceFilter) params.append('source', currentSourceFilter);
  const query = params.toString() ? `?${params.toString()}` : '';
  fetch('/api/logs' + query)
    .then(r => r.json())
    .then(list => {
      logDiv.innerHTML = list.map(l => {
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
    const sourceInput = document.getElementById('logSourceFilter');
    const clearBtn = document.getElementById('clearLogsBtn');
    if(levelSelect){
      currentLevelFilter = levelSelect.value;
      levelSelect.addEventListener('change', () => {
        currentLevelFilter = levelSelect.value;
        fetchLogs();
      });
    }
    if(sourceInput){
      currentSourceFilter = sourceInput.value;
      sourceInput.addEventListener('input', () => {
        currentSourceFilter = sourceInput.value;
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
