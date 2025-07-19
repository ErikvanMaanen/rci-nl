export async function loadDbInfo() {
  const tableBody = document.getElementById('dbTableBody');
  if (!tableBody) return;
  tableBody.innerHTML = '<tr><td colspan="5">Loading...</td></tr>';
  try {
    const res = await fetch('/api/dbinfo');
    const data = await res.json();
    tableBody.innerHTML = data
      .map(
        d => `<tr><td>${d.name}</td><td>${d.count}</td><td>${d.last_update ? new Date(d.last_update).toLocaleString() : '-'}</td>` +
          `<td><button data-action="latest" data-table="${d.name}">Show</button></td>` +
          `<td><button data-action="test" data-table="${d.name}">Test</button></td></tr>`
      )
      .join('');
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="5">Error: ${err.message}</td></tr>`;
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
        const res = await fetch(`/api/db/${table}/latest?limit=10`);
        const data = await res.json();
        alert(JSON.stringify(data, null, 2));
      } else if (action === 'test') {
        const res = await fetch(`/api/db/${table}/test`, { method: 'POST' });
        const result = await res.json();
        alert(JSON.stringify(result, null, 2));
      }
    });
  }

  loadDbInfo();
});
