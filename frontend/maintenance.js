export async function loadDbInfo() {
  const tableBody = document.getElementById('dbTableBody');
  const refreshBtn = document.getElementById('refreshDbBtn');
  
  if (!tableBody) return;
  
  // Update button state
  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.textContent = 'Refreshing...';
  }
  
  tableBody.innerHTML = '<tr><td colspan="4">Loading database information...</td></tr>';
  
  try {
    const res = await fetch('/api/dbinfo');
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    
    const data = await res.json();
    
    tableBody.innerHTML = data
      .map(
        d => `<tr><td><strong>${d.name}</strong></td><td>${d.count || 0}</td><td>${d.last_update ? new Date(d.last_update).toLocaleString() : 'No records'}</td>` +
          `<td><button data-action="latest" data-table="${d.name}">Show Latest</button> <button data-action="test" data-table="${d.name}">Test</button></td></tr>`
      )
      .join('');
      
    if (typeof frontendLog === 'function') {
      frontendLog('Database info refreshed successfully', 'INFO', 'MAINTENANCE');
    }
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="4">Error loading database info: ${err.message}</td></tr>`;
    if (typeof frontendLog === 'function') {
      frontendLog(`Failed to load database info: ${err.message}`, 'ERROR', 'MAINTENANCE');
    }
  } finally {
    // Reset button state
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.textContent = 'Refresh Database Info';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const refreshBtn = document.getElementById('refreshDbBtn');
  if (refreshBtn) refreshBtn.addEventListener('click', loadDbInfo);

  const tableBody = document.getElementById('dbTableBody');
  if (tableBody) {
    tableBody.addEventListener('click', async e => {
      const action = e.target.dataset.action;
      const table = e.target.dataset.table;
      if (!action || !table) return;
      
      if (action === 'latest') {
        try {
          e.target.disabled = true;
          e.target.textContent = 'Loading...';
          
          const res = await fetch(`/api/db/${table}/latest?limit=10`);
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          
          const data = await res.json();
          
          // Create a more readable display for the data
          const formattedData = data.map(record => {
            const formatted = {};
            Object.keys(record).forEach(key => {
              if (key.includes('time') || key.includes('timestamp') || key === 'registered_at') {
                formatted[key] = new Date(record[key]).toLocaleString();
              } else {
                formatted[key] = record[key];
              }
            });
            return formatted;
          });
          
          alert(`Latest 10 records from ${table}:\n\n${JSON.stringify(formattedData, null, 2)}`);
          
          if (typeof frontendLog === 'function') {
            frontendLog(`Viewed latest records from ${table}`, 'INFO', 'MAINTENANCE');
          }
        } catch (err) {
          alert(`Error fetching latest records: ${err.message}`);
          if (typeof frontendLog === 'function') {
            frontendLog(`Failed to fetch latest records from ${table}: ${err.message}`, 'ERROR', 'MAINTENANCE');
          }
        } finally {
          e.target.disabled = false;
          e.target.textContent = 'Show Latest';
        }
      } else if (action === 'test') {
        try {
          e.target.disabled = true;
          e.target.textContent = 'Testing...';
          
          const res = await fetch(`/api/db/${table}/test`, { method: 'POST' });
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          
          const result = await res.json();
          alert(`Test result for ${table}:\n\n${JSON.stringify(result, null, 2)}`);
          
          if (typeof frontendLog === 'function') {
            frontendLog(`Database test completed for ${table}: ${result.success ? 'PASSED' : 'FAILED'}`, result.success ? 'INFO' : 'WARN', 'MAINTENANCE');
          }
        } catch (err) {
          alert(`Error testing table: ${err.message}`);
          if (typeof frontendLog === 'function') {
            frontendLog(`Failed to test table ${table}: ${err.message}`, 'ERROR', 'MAINTENANCE');
          }
        } finally {
          e.target.disabled = false;
          e.target.textContent = 'Test';
        }
      }
    });
  }

  loadDbInfo();
});
