/** Admin dashboard: statistics, moderation queue, tables and audit log. */
import { api, isAdmin, getUser } from './api.js';
import { mountHeader, setYear, requireLogin } from './common.js';
import { escapeHtml, formatDate, timeAgo, badge, statusBadge, claimBadge, toast, spinner, errorState, bindRetry } from './ui.js';

mountHeader();
setYear();

const root = document.getElementById('admin-root');

if (requireLogin()) {
  if (!isAdmin()) {
    root.innerHTML = `<div class="alert alert-error">This page is for administrators only.</div>
      <a class="btn btn-outline" href="/dashboard.html">Go to my dashboard</a>`;
  } else {
    loadAll();
  }
}

document.getElementById('refresh-btn')?.addEventListener('click', () => loadAll());

async function loadAll() {
  root.innerHTML = spinner();
  try {
    const [statsRes, itemsRes, queueRes, claimsRes, usersRes, auditRes] = await Promise.all([
      api('/api/v1/admin/stats'),
      api('/api/v1/admin/items?limit=50'),
      api('/api/v1/admin/reports?status=pending'),
      api('/api/v1/admin/claims'),
      api('/api/v1/admin/users'),
      api('/api/v1/admin/audit?limit=25'),
    ]);
    render(statsRes, itemsRes, queueRes, claimsRes, usersRes, auditRes);
  } catch (err) {
    root.innerHTML = errorState(err.message, 'Could not load the admin dashboard');
    bindRetry(root, loadAll);
  }
}

function barChart(rows, teal = false) {
  if (!rows.length) return '<p class="small muted">No data yet.</p>';
  const max = Math.max(...rows.map((r) => r.count));
  return `<div class="bar-chart">${rows
    .map(
      (r) => `<div class="bar-row">
        <span>${escapeHtml(String(r.label).replace('_', ' '))}</span>
        <span class="bar-track"><span class="bar-fill ${teal ? 'teal' : ''}" style="width:${max ? Math.round((r.count / max) * 100) : 0}%"></span></span>
        <span class="num">${r.count}</span>
      </div>`
    )
    .join('')}</div>`;
}

function render(statsRes, itemsRes, queueRes, claimsRes, usersRes, auditRes) {
  const { stats, recentItems } = statsRes;
  const { items } = itemsRes;
  const queue = queueRes.items;
  const { claims } = claimsRes;
  const { users } = usersRes;
  const { logs } = auditRes;

  const statusRows = stats.byStatus.map((s) => ({ label: s._id, count: s.count }));
  const categoryRows = stats.byCategory.map((s) => ({ label: s._id, count: s.count }));
  const dayRows = stats.last7Days.map((d) => ({ label: d._id.slice(5), count: d.count }));
  const typeRows = stats.byType;

  root.innerHTML = `
    <div class="stat-grid">
      <div class="stat"><div class="label">Total listings</div><div class="value">${stats.totals.items}</div></div>
      <div class="stat"><div class="label">Registered users</div><div class="value">${stats.totals.users}</div></div>
      <div class="stat"><div class="label">Total claims</div><div class="value">${stats.totals.claims}</div></div>
      <div class="stat"><div class="label">Pending claims</div><div class="value">${stats.totals.pendingClaims}</div></div>
      <div class="stat"><div class="label">Awaiting moderation</div><div class="value">${stats.totals.pendingModeration}</div></div>
    </div>

    <div class="items-grid mt-3" style="grid-template-columns:1fr">
      <div class="card card-pad">
        <h2 style="font-size:1.05rem">Listings by category</h2>
        ${barChart(categoryRows)}
      </div>
      <div class="card card-pad">
        <h2 style="font-size:1.05rem">Listings by status</h2>
        ${barChart(statusRows, true)}
        <p class="small muted mt-2" style="margin-bottom:0">Recovery rate: <strong>${stats.recoveryRate}%</strong> ·
          Lost: ${typeRows.find((r) => r._id === 'lost')?.count || 0} ·
          Found: ${typeRows.find((r) => r._id === 'found')?.count || 0}</p>
      </div>
      <div class="card card-pad">
        <h2 style="font-size:1.05rem">Reports in the last 7 days</h2>
        ${barChart(dayRows)}
      </div>
    </div>

    <h2 class="mt-3" style="font-size:1.2rem">Moderation queue (${queue.length})</h2>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Item</th><th>Type</th><th>Reported by</th><th>Submitted</th><th>Decision</th></tr></thead>
        <tbody>
          ${queue.length
            ? queue
                .map(
                  (i) => `<tr>
                    <td><a href="/item.html?id=${i._id}"><strong>${escapeHtml(i.title)}</strong></a>
                      <div class="small muted">${escapeHtml(i.category)} · ${escapeHtml(i.location)}</div></td>
                    <td>${badge(i.type, i.type)}</td>
                    <td class="small">${escapeHtml(i.reporter?.name || '—')}<div class="small muted">${escapeHtml(i.reporter?.email || '')}</div></td>
                    <td class="small muted">${timeAgo(i.createdAt)}</td>
                    <td><div class="row-actions">
                      <button class="btn btn-sm" data-moderate="approve" data-id="${i._id}">Approve</button>
                      <button class="btn btn-outline btn-sm" data-moderate="hide" data-id="${i._id}">Hide</button>
                      <button class="btn btn-danger btn-sm" data-moderate="reject" data-id="${i._id}">Reject</button>
                    </div></td>
                  </tr>`
                )
                .join('')
            : '<tr><td colspan="5" class="muted small">Nothing waiting for review. New reports appear here when REQUIRE_MODERATION=true.</td></tr>'}
        </tbody>
      </table>
    </div>

    <h2 class="mt-3" style="font-size:1.2rem">All listings</h2>
    <p class="small muted" style="margin:0 0 .5rem">Showing ${items.length} of ${itemsRes.total} listings, newest first</p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Item</th><th>Type</th><th>Category</th><th>Reported by</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          ${items
            .map(
              (i) => `<tr>
                <td><a href="/item.html?id=${i._id}"><strong>${escapeHtml(i.title)}</strong></a>
                  <div class="small muted">${escapeHtml(i.location)} · ${formatDate(i.createdAt)}${i.reference ? ` · ${escapeHtml(i.reference)}` : ''}</div></td>
                <td>${badge(i.type, i.type)}</td>
                <td class="small">${escapeHtml(i.category)}</td>
                <td class="small">${escapeHtml(i.reporter?.name || '—')}<div class="small muted">${escapeHtml(i.reporter?.email || '')}</div></td>
                <td>${statusBadge(i.status)}</td>
                <td>
                  <div class="row-actions">
                    <select data-status="${i._id}" style="width:auto;padding:.3rem .4rem;font-size:.8rem" aria-label="Change status">
                      ${['pending', 'active', 'claim_requested', 'resolved', 'rejected', 'expired']
                        .map((s) => `<option value="${s}" ${s === i.status ? 'selected' : ''}>${s.replace('_', ' ')}</option>`)
                        .join('')}
                    </select>
                    <button class="btn btn-danger btn-sm" data-del="${i._id}">Delete</button>
                  </div>
                </td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>

    <h2 class="mt-3" style="font-size:1.2rem">Claims</h2>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Item</th><th>Claimant</th><th>Private message</th><th>Status</th><th>Date</th></tr></thead>
        <tbody>
          ${claims.length
            ? claims
                .map(
                  (c) => `<tr>
                    <td>${c.item ? escapeHtml(c.item.title) : '—'}<div class="small muted">${c.item ? escapeHtml(c.item.category) : ''}</div></td>
                    <td class="small">${escapeHtml(c.claimant?.name || '—')}<div class="small muted">${escapeHtml(c.claimant?.email || '')}</div></td>
                    <td class="small">${escapeHtml(c.message)}${c.proof ? `<div class="small muted">Proof: ${escapeHtml(c.proof)}</div>` : ''}</td>
                    <td>${claimBadge(c.status)}</td>
                    <td class="small muted">${formatDate(c.createdAt)}</td>
                  </tr>`
                )
                .join('')
            : '<tr><td colspan="5" class="muted small">No claims yet.</td></tr>'}
        </tbody>
      </table>
    </div>

    <h2 class="mt-3" style="font-size:1.2rem">Users</h2>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Department</th><th>Role</th><th>Account</th><th>Joined</th><th>Actions</th></tr></thead>
        <tbody>
          ${users
            .map(
              (u) => `<tr>
                <td>${escapeHtml(u.name)}</td>
                <td class="small">${escapeHtml(u.email)}</td>
                <td class="small muted">${escapeHtml(u.department || '—')}</td>
                <td>${badge(u.role, u.role === 'admin' ? 'resolved' : 'active')}</td>
                <td>${u.isActive === false ? '<span class="badge badge-rejected">Suspended</span>' : '<span class="badge badge-active">Active</span>'}</td>
                <td class="small muted">${formatDate(u.createdAt)}</td>
                <td>${String(u._id) === String(getUser()?._id)
                  ? '<span class="small muted">You</span>'
                  : `<div class="row-actions">
                       <button class="btn btn-outline btn-sm" data-role="${u._id}" data-next="${u.role === 'admin' ? 'student' : 'admin'}">
                         Make ${u.role === 'admin' ? 'student' : 'admin'}
                       </button>
                       <button class="btn ${u.isActive === false ? 'btn-outline' : 'btn-danger'} btn-sm" data-suspend="${u._id}" data-active="${u.isActive === false}">
                         ${u.isActive === false ? 'Reactivate' : 'Suspend'}
                       </button>
                     </div>`}</td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>

    <h2 class="mt-3" style="font-size:1.2rem">Audit log</h2>
    <div class="table-wrap">
      <table>
        <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Entity</th><th>Reason</th></tr></thead>
        <tbody>
          ${logs.length
            ? logs
                .map(
                  (l) => `<tr>
                    <td class="small muted">${timeAgo(l.createdAt)}</td>
                    <td class="small">${escapeHtml(l.actorName || 'system')}</td>
                    <td class="small"><strong>${escapeHtml(l.action)}</strong>${l.metadata?.from ? `<div class="small muted">${escapeHtml(l.metadata.from)} → ${escapeHtml(l.metadata.to || '')}</div>` : ''}</td>
                    <td class="small muted">${escapeHtml(l.entityType)}</td>
                    <td class="small">${escapeHtml(l.reason || '—')}</td>
                  </tr>`
                )
                .join('')
            : '<tr><td colspan="5" class="muted small">No audit entries yet.</td></tr>'}
        </tbody>
      </table>
    </div>

    <p class="small muted mt-2">Recent activity: ${recentItems.map((i) => escapeHtml(i.title)).join(' · ') || '—'}</p>`;

  /* ----------------------------- actions ------------------------------- */
  root.querySelectorAll('[data-moderate]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.moderate;
      const reason = action === 'approve' ? '' : window.prompt(`Reason for ${action === 'hide' ? 'hiding' : 'rejecting'} this listing:`, '');
      if (action !== 'approve' && !reason) return;
      try {
        await api(`/api/v1/admin/reports/${btn.dataset.id}`, { method: 'PATCH', body: { action, reason } });
        toast(`Listing ${action}d`, 'success');
        loadAll();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });

  root.querySelectorAll('[data-status]').forEach((sel) => {
    sel.addEventListener('change', async () => {
      try {
        await api(`/api/v1/items/${sel.dataset.status}/status`, { method: 'PATCH', body: { status: sel.value } });
        toast(`Status set to ${sel.value.replace('_', ' ')}`, 'success');
        loadAll();
      } catch (err) {
        toast(err.message, 'error');
        loadAll();
      }
    });
  });

  root.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!window.confirm('Delete this listing as admin? This also removes its claims.')) return;
      try {
        await api(`/api/v1/admin/items/${btn.dataset.del}`, { method: 'DELETE' });
        toast('Listing removed', 'success');
        loadAll();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });

  root.querySelectorAll('[data-role]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await api(`/api/v1/admin/users/${btn.dataset.role}/role`, { method: 'PATCH', body: { role: btn.dataset.next } });
        toast(`Role changed to ${btn.dataset.next}`, 'success');
        loadAll();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });

  root.querySelectorAll('[data-suspend]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const makeActive = btn.dataset.active === 'true';
      try {
        await api(`/api/v1/admin/users/${btn.dataset.suspend}/status`, { method: 'PATCH', body: { isActive: makeActive } });
        toast(makeActive ? 'Account reactivated' : 'Account suspended', 'success');
        loadAll();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
}
