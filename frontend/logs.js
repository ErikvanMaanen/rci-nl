function fetchLogs(){
  const logDiv = document.getElementById('log');
  if(!logDiv) return;
  fetch('/api/logs')
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

if (typeof window !== 'undefined') {
  setInterval(fetchLogs, 5000);
  fetchLogs();
}
