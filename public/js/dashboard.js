/** User dashboard: listings, claims sent, claims received, notifications. */
import { api, getUser } from './api.js';
import { mountHeader, setYear, requireLogin } from './common.js';
import { escapeHtml, formatDate, timeAgo, badge, statusBadge, claimBadge, toast, emptyState, spinner, errorState, bindRetry } from './ui.js';

mountHeader();
setYear();

if (requireLogin()) {
  const user = getUser();
  document.getElementById('dashboard-sub').textContent = `${user.name} · ${user.email}`;

  const panels = {
    listings: document.getElementById('panel-listings'),
    claims: document.getElementById('panel-claims'),
    received: document.getElementById('panel-received'),
    notifications: document.getElementById('panel-notifications'),
  };

  /* ------------------------------- tabs -------------------------------- */
  document.querySelectorAll('.tabs [role="tab"]').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tabs [role="tab"]').forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
      Object.entries(panels).forEach(([key, el]) => el.classList.toggle('hidden', key !== tab.dataset.tab));
      loadTab(tab.dataset.tab);
    });
  });

  function loadTab(name) {
    if (name === 'listings') loadListings();
    if (name === 'claims') loadMyClaims();
    if (name === 'received') loadReceived();
    if (name === 'notifications') loadNotifications();
  }

  /* ------------------------------ stats -------------------------------- */
  async function loadStats() {
    try {
      const { summary } = await api('/api/v1/dashboard/summary');
      document.getElementById('my-stats').innerHTML = `
        <div class="stat"><div class="label">My listings</div><div class="value">${summary.myListings}</div></div>
        <div class="stat"><div class="label">Still active</div><div class="value">${summary.byStatus.active + summary.byStatus.claim_requested}</div></div>
        <div class="stat"><div class="label">Claims to review</div><div class="value">${summary.claimsAwaitingMyDecision}</div></div>
        <div class="stat"><div class="label">Unread alerts</div><div class="value">${summary.unreadNotifications}</div></div>`;
    } catch (err) {
      document.getElementById('my-stats').innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    }
  }

  /* ----------------------------- listings ------------------------------ */
  async function loadListings() {
    panels.listings.innerHTML = spinner();
    try {
      const { items } = await api('/api/v1/items/user/mine');
      if (!items.length) {
        panels.listings.innerHTML = `${emptyState('No listings yet', 'Report something you lost or found to get started.')}
          <div class="center" style="padding-bottom:1.5rem"><a class="btn" href="/report.html">Report an item</a></div>`;
        return;
      }

      panels.listings.innerHTML = `
        <div class="table-wrap" style="border:0">
          <table>
            <thead><tr><th>Item</th><th>Type</th><th>Status</th><th>Claims</th><th>Reported</th><th>Actions</th></tr></thead>
            <tbody>
              ${items
                .map(
                  (i) => `<tr>
                    <td>
                      <a href="/item.html?id=${i._id}"><strong>${escapeHtml(i.title)}</strong></a>
                      <div class="small muted">${escapeHtml(i.category)} · ${escapeHtml(i.location)}${i.reference ? ` · ${escapeHtml(i.reference)}` : ''}</div>
                    </td>
                    <td>${badge(i.type, i.type)}</td>
                    <td>${statusBadge(i.status)}</td>
                    <td>${i.claimCount}${i.pendingClaims ? ` <span class="badge badge-pending">${i.pendingClaims} new</span>` : ''}</td>
                    <td class="small muted">${formatDate(i.createdAt)}</td>
                    <td>
                      <div class="row-actions">
                        <a class="btn btn-outline btn-sm" href="/report.html?id=${i._id}">Edit</a>
                        ${['active', 'claim_requested'].includes(i.status) ? `<button class="btn btn-outline btn-sm" data-action="resolve" data-id="${i._id}">Mark returned</button>` : ''}
                        ${i.status === 'resolved' ? `<button class="btn btn-outline btn-sm" data-action="reopen" data-id="${i._id}">Reopen</button>` : ''}
                        <button class="btn btn-danger btn-sm" data-action="delete" data-id="${i._id}">Delete</button>
                      </div>
                    </td>
                  </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>`;
    } catch (err) {
      panels.listings.innerHTML = errorState(err.message, 'Could not load your listings');
      bindRetry(panels.listings, loadListings);
    }
  }

  panels.listings.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;

    try {
      if (action === 'resolve' || action === 'reopen') {
        const status = action === 'resolve' ? 'resolved' : 'active';
        await api(`/api/v1/items/${id}/status`, { method: 'PATCH', body: { status } });
        toast(status === 'resolved' ? 'Marked as returned' : 'Listing reopened', 'success');
        loadListings();
        loadStats();
      }
      if (action === 'delete') {
        if (!window.confirm('Delete this listing permanently? Its claims will also be removed.')) return;
        await api(`/api/v1/items/${id}`, { method: 'DELETE' });
        toast('Listing deleted', 'success');
        loadListings();
        loadStats();
      }
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  /* --------------------------- claims I sent --------------------------- */
  async function loadMyClaims() {
    panels.claims.innerHTML = spinner();
    try {
      const { claims } = await api('/api/v1/claims/mine');
      if (!claims.length) {
        panels.claims.innerHTML = emptyState('No claims yet', 'Found something that is yours? Open the listing and submit a claim.');
        return;
      }
      panels.claims.innerHTML = `
        <div class="table-wrap" style="border:0">
          <table>
            <thead><tr><th>Item</th><th>My message</th><th>Status</th><th>Submitted</th><th></th></tr></thead>
            <tbody>
              ${claims
                .map(
                  (c) => `<tr>
                    <td>${c.item ? `<a href="/item.html?id=${c.item._id}"><strong>${escapeHtml(c.item.title)}</strong></a>
                      <div class="small muted">${escapeHtml(c.item.category)} · ${escapeHtml(c.item.location || '')}</div>` : '<span class="muted">Item removed</span>'}</td>
                    <td class="small">${escapeHtml(c.message)}${c.decisionNote ? `<div class="small muted">Note: ${escapeHtml(c.decisionNote)}</div>` : ''}</td>
                    <td>${claimBadge(c.status)}</td>
                    <td class="small muted">${formatDate(c.createdAt)}</td>
                    <td>${c.status === 'pending' ? `<button class="btn btn-outline btn-sm" data-withdraw="${c._id}">Withdraw</button>` : ''}</td>
                  </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>`;
    } catch (err) {
      panels.claims.innerHTML = errorState(err.message, 'Could not load your claims');
      bindRetry(panels.claims, loadMyClaims);
    }
  }

  panels.claims.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-withdraw]');
    if (!btn) return;
    if (!window.confirm('Withdraw this claim?')) return;
    try {
      await api(`/api/v1/claims/${btn.dataset.withdraw}`, { method: 'DELETE' });
      toast('Claim withdrawn', 'success');
      loadMyClaims();
      loadStats();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  /* ------------------------- claims received --------------------------- */
  async function loadReceived() {
    panels.received.innerHTML = spinner();
    try {
      const { claims } = await api('/api/v1/claims/received');
      if (!claims.length) {
        panels.received.innerHTML = emptyState('No claims on your items', 'When someone claims a listing you posted, it appears here for review.');
        return;
      }
      panels.received.innerHTML = `
        <div class="table-wrap" style="border:0">
          <table>
            <thead><tr><th>Item</th><th>Claimant</th><th>Private message</th><th>Status</th><th>Decision</th></tr></thead>
            <tbody>
              ${claims
                .map(
                  (c) => `<tr>
                    <td>${c.item ? `<a href="/item.html?id=${c.item._id}"><strong>${escapeHtml(c.item.title)}</strong></a>` : '<span class="muted">Removed</span>'}</td>
                    <td>${escapeHtml(c.claimant?.name || 'Unknown')}
                      <div class="small muted">${escapeHtml(c.claimant?.email || '')}</div></td>
                    <td class="small">${escapeHtml(c.message)}
                      ${c.proof ? `<div class="small muted">Proof: ${escapeHtml(c.proof)}</div>` : ''}</td>
                    <td>${claimBadge(c.status)}</td>
                    <td>
                      ${
                        c.status === 'pending'
                          ? `<div class="row-actions">
                               <button class="btn btn-sm" data-decide="approved" data-id="${c._id}">Approve</button>
                               <button class="btn btn-outline btn-sm" data-decide="info_requested" data-id="${c._id}">Ask for info</button>
                               <button class="btn btn-outline btn-sm" data-decide="rejected" data-id="${c._id}">Reject</button>
                             </div>`
                          : `<span class="small muted">${c.decisionNote ? escapeHtml(c.decisionNote) : '—'}</span>`
                      }
                    </td>
                  </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>`;
    } catch (err) {
      panels.received.innerHTML = errorState(err.message, 'Could not load claims');
      bindRetry(panels.received, loadReceived);
    }
  }

  panels.received.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-decide]');
    if (!btn) return;
    const status = btn.dataset.decide;
    const note = status === 'approved' ? '' : window.prompt('Note to the claimant (optional):', '') || '';
    try {
      await api(`/api/v1/claims/${btn.dataset.id}`, { method: 'PATCH', body: { status, decisionNote: note } });
      toast(`Claim ${status.replace('_', ' ')}`, 'success');
      loadReceived();
      loadStats();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  /* --------------------------- notifications --------------------------- */
  async function loadNotifications() {
    panels.notifications.innerHTML = spinner();
    try {
      const { notifications } = await api('/api/v1/notifications');
      if (!notifications.length) {
        panels.notifications.innerHTML = emptyState('All clear', 'Duplicate alerts, new claims and decisions will show up here.');
        return;
      }
      panels.notifications.innerHTML = `
        <div style="display:flex;justify-content:flex-end;padding:.6rem .8rem;border-bottom:1px solid #f3f4f6">
          <button class="btn btn-outline btn-sm" id="mark-all">Mark all as read</button>
        </div>
        ${notifications
          .map(
            (n) => `<div class="notif ${n.read ? 'read' : 'unread'}">
              <span class="notif-dot" aria-hidden="true"></span>
              <div style="flex:1">
                <div class="small" style="font-weight:600">${escapeHtml(n.message)}</div>
                <div class="small muted">${timeAgo(n.createdAt)} · ${escapeHtml(n.type)}${n.item ? ` · <a href="/item.html?id=${n.item}">view item</a>` : ''}</div>
              </div>
            </div>`
          )
          .join('')}`;

      document.getElementById('mark-all')?.addEventListener('click', async () => {
        await api('/api/v1/notifications/read-all', { method: 'PATCH' });
        loadNotifications();
        loadStats();
      });
    } catch (err) {
      panels.notifications.innerHTML = errorState(err.message, 'Could not load notifications');
      bindRetry(panels.notifications, loadNotifications);
    }
  }

  loadStats();
  loadListings();
}
