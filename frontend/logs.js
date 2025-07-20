// Track current filter settings
let currentLevelFilter = [];
let currentSourceFilter = [];
let currentApiFilter = [];

// Track the last log ID we've displayed to avoid duplicates
let lastLogId = 0;

// Auto-scroll flag controlled by user scroll position
let autoScroll = true;

function selectAllOptions(selectElement) {
  if (selectElement) {
    Array.from(selectElement.options).forEach(option => {
      option.selected = true;
    });
  }
}

function fetchLogs(){
  const logDiv = document.getElementById('log');
  if(!logDiv) return;
  
  // Build query parameters
  const params = new URLSearchParams();
  
  // Set a reasonable limit for fetching logs
  params.append('limit', '20');
  
  // Add filter parameters if they exist (backend expects comma-separated values)
  // Only send filter params if not all options are selected (to reduce unnecessary filtering)
  if (currentLevelFilter && currentLevelFilter.length > 0) {
    params.append('level', currentLevelFilter.join(','));
  }
  if (currentSourceFilter && currentSourceFilter.length > 0) {
    params.append('source', currentSourceFilter.join(','));
  }
  if (currentApiFilter && currentApiFilter.length > 0) {
    params.append('api', currentApiFilter.join(','));
  }
  
  const endpoint = `/api/logs?${params.toString()}`;
    
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

      // Sort logs chronologically oldest first
      newLogs.sort((a, b) => a.id - b.id);

      const fragment = document.createDocumentFragment();

      newLogs.forEach(l => {
        if (l.id <= lastLogId) return; // Skip logs we've already displayed

        const time = new Date(l.log_time).toLocaleString();
        const levelClass = l.level ? l.level.toLowerCase() : 'info';
        const source = l.source ? `[${l.source}]` : '';
        const div = document.createElement('div');
        div.className = `log-entry log-${levelClass}`;
        div.innerHTML =
          `<span class="log-time">${time}</span>` +
          `<span class="log-source">${source}</span>` +
          `<span class="log-level">[${l.level || 'INFO'}]</span>` +
          `<span class="log-message">${l.message}</span>`;
        fragment.appendChild(div);

        if (l.id > lastLogId) {
          lastLogId = l.id;
        }
      });

      if (fragment.childNodes.length > 0) {
        logDiv.appendChild(fragment);
        if (autoScroll) {
          logDiv.scrollTop = logDiv.scrollHeight;
        }
      }

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
      
      logDiv.insertAdjacentHTML('beforeend', errorHtml);
      if (autoScroll) {
        logDiv.scrollTop = logDiv.scrollHeight;
      }
      
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
        lastLogId = 0;
        const logDiv = document.getElementById('log');
        if (logDiv) {
          logDiv.innerHTML = '';
        }
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
    const logDiv = document.getElementById('log');

    if (logDiv) {
      logDiv.addEventListener('scroll', () => {
        const atBottom =
          logDiv.scrollHeight - logDiv.clientHeight - logDiv.scrollTop <= 5;
        autoScroll = atBottom;
      });
    }
    
    if(levelSelect){
      // Select all options by default
      selectAllOptions(levelSelect);
      const getLevels = () => Array.from(levelSelect.selectedOptions).map(o => o.value).filter(Boolean);
      currentLevelFilter = getLevels();
      levelSelect.addEventListener('change', () => {
        currentLevelFilter = getLevels();
        fetchLogs();
      });
    }
    if(sourceSelect){
      // Select all options by default
      selectAllOptions(sourceSelect);
      const getSources = () => Array.from(sourceSelect.selectedOptions).map(o => o.value).filter(Boolean);
      currentSourceFilter = getSources();
      sourceSelect.addEventListener('change', () => {
        currentSourceFilter = getSources();
        fetchLogs();
      });
    }
    if(apiSelect){
      // Select all options by default
      selectAllOptions(apiSelect);
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
