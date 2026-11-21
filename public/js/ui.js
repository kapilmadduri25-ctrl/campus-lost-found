/**
 * ui.js - tiny rendering helpers shared by the pages.
 * Everything that comes from the API is inserted with textContent / escaped,
 * so a malicious item title cannot inject HTML.
 */

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

export function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function timeAgo(value) {
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days} day${days > 1 ? 's' : ''} ago`;
  return formatDate(value);
}

const CATEGORY_ICON = {
  Electronics: '💻',
  'Books & Notes': '📚',
  'ID Card': '🪪',
  'Wallet & Cards': '👛',
  Keys: '🔑',
  Clothing: '👕',
  Accessories: '🕶️',
  'Sports Equipment': '🏸',
  Bags: '🎒',
  Other: '📦',
};

export function categoryIcon(category) {
  return CATEGORY_ICON[category] || '📦';
}

export function badge(text, kind) {
  return `<span class="badge badge-${escapeHtml(kind)}">${escapeHtml(text)}</span>`;
}

/* ------------------------- item status vocabulary ----------------------- */
export const STATUS_LABEL = {
  pending: 'Pending review',
  active: 'Active',
  claim_requested: 'Claim requested',
  resolved: 'Returned',
  rejected: 'Hidden',
  expired: 'Expired',
};

export function statusLabel(status) {
  return STATUS_LABEL[status] || String(status || '').replace('_', ' ');
}

export function statusBadge(status) {
  return `<span class="badge badge-${escapeHtml(status)}">${escapeHtml(statusLabel(status))}</span>`;
}

export const CLAIM_LABEL = {
  pending: 'Pending',
  info_requested: 'More info asked',
  approved: 'Approved',
  rejected: 'Rejected',
};

export function claimBadge(status) {
  const kind = status === 'approved' ? 'resolved' : status === 'info_requested' ? 'pending' : status;
  return `<span class="badge badge-${kind}">${escapeHtml(CLAIM_LABEL[status] || status)}</span>`;
}

/** Builds the markup for one item card in a grid. */
export function itemCard(item) {
  const img = item.imageUrl
    ? `<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title)}" loading="lazy">`
    : `<span>${categoryIcon(item.category)}</span>`;

  return `
    <article class="item-card">
      <a class="item-thumb" href="/item.html?id=${item._id}" aria-label="${escapeHtml(item.title)}">${img}</a>
      <div class="item-body">
        <div class="item-meta">
          ${badge(item.type, item.type)}
          ${statusBadge(item.status)}
        </div>
        <h3 class="item-title"><a href="/item.html?id=${item._id}">${escapeHtml(item.title)}</a></h3>
        <p class="item-desc">${escapeHtml(item.description)}</p>
        <div class="item-meta">
          <span>📍 ${escapeHtml(item.location)}</span>
          <span>🗓 ${formatDate(item.dateLostOrFound)}</span>
        </div>
        <div class="card-foot">
          <span class="small muted">${escapeHtml(item.category)}</span>
          <a class="btn btn-outline btn-sm" href="/item.html?id=${item._id}">View</a>
        </div>
      </div>
    </article>`;
}

export function emptyState(title, message) {
  return `<div class="empty"><div class="big">🗂️</div><h3>${escapeHtml(title)}</h3><p class="muted">${escapeHtml(message)}</p></div>`;
}

/** Error block with a retry button. Wire it with bindRetry(el, fn). */
export function errorState(message, title = 'Could not load this page') {
  return `<div class="empty">
      <div class="big">⚠️</div>
      <h3>${escapeHtml(title)}</h3>
      <p class="muted">${escapeHtml(message)}</p>
      <button class="btn btn-outline" type="button" data-retry>Try again</button>
    </div>`;
}

export function bindRetry(container, fn) {
  container.querySelector('[data-retry]')?.addEventListener('click', fn);
}

export function spinner() {
  return '<div class="spinner" role="status" aria-label="Loading"></div>';
}

export function toast(message, kind = 'info') {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

/** Shows a list of field errors returned by the API. */
export function showFormErrors(container, error) {
  const details = error.details || [];
  container.hidden = false;
  container.classList.remove('hidden');
  container.innerHTML = `<strong>${escapeHtml(error.message)}</strong>${
    details.length
      ? `<ul>${details.map((d) => `<li>${escapeHtml(d.message)}</li>`).join('')}</ul>`
      : ''
  }`;

  // tell assistive tech which fields failed, and put the cursor on the first one
  const form = container.closest('form');
  if (!form) return;
  form.querySelectorAll('[aria-invalid="true"]').forEach((el) => el.removeAttribute('aria-invalid'));
  details.forEach((d) => {
    const field = form.querySelector(`[name="${d.field}"]`) || form.querySelector(`#${d.field}`);
    if (field) field.setAttribute('aria-invalid', 'true');
  });
  const first = form.querySelector('[aria-invalid="true"]');
  if (first) first.focus();
}

export function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}
