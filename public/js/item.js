/** Item detail page + claim submission. */
import { api, getUser, isLoggedIn, isAdmin } from './api.js';
import { mountHeader, setYear } from './common.js';
import { escapeHtml, formatDate, timeAgo, categoryIcon, badge, statusBadge, statusLabel, toast, showFormErrors, qs, errorState, bindRetry } from './ui.js';

mountHeader();
setYear();

const root = document.getElementById('detail-root');
const id = qs('id');

if (!id) {
  root.innerHTML = '<div class="empty"><h2>No item selected</h2><p class="muted">Pick a listing from the home page.</p><a class="btn mt-2" href="/index.html">Browse items</a></div>';
} else {
  load();
}

async function load() {
  root.innerHTML = '<div class="spinner" role="status" aria-label="Loading"></div>';
  try {
    const { item } = await api(`/api/v1/items/${id}`);
    render(item);
  } catch (err) {
    root.innerHTML = err.status === 404
      ? '<div class="empty"><div class="big">🔍</div><h3>Item not found</h3><p class="muted">It may have been removed or hidden by a moderator.</p><a class="btn mt-2" href="/index.html">Back to listings</a></div>'
      : errorState(err.message);
    bindRetry(root, load);
  }
}

function render(item) {
  const user = getUser();
  const isOwner = Boolean(user) && String(user._id) === String(item.reporter?._id);
  const canClaim = isLoggedIn() && !isOwner && ['active', 'claim_requested'].includes(item.status);
  document.title = `${item.title} · Campus Lost & Found`;

  const image = item.imageUrl
    ? `<div class="detail-image"><img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title)}"></div>`
    : `<div class="detail-image" style="display:grid;place-items:center;min-height:220px;font-size:3rem">${categoryIcon(item.category)}</div>`;

  const moderationNote = isOwner && item.status === 'rejected' && item.moderationReason
    ? `<div class="alert alert-error mt-2" style="margin-bottom:0">Hidden by a moderator: ${escapeHtml(item.moderationReason)}</div>`
    : '';

  const privateBlock = isOwner && item.descriptionPrivate
    ? `<div class="alert alert-info mt-2" style="margin-bottom:0"><strong>Private details (only you and admins can see this)</strong><br>${escapeHtml(item.descriptionPrivate)}</div>`
    : '';

  root.innerHTML = `
    <div class="detail-grid">
      <div>
        ${image}
        <div class="card card-pad mt-2">
          <div class="item-meta" style="margin-bottom:.5rem">
            ${badge(item.type, item.type)} ${statusBadge(item.status)}
            <span class="small muted">${escapeHtml(item.category)}</span>
            ${item.reference ? `<span class="small muted">Ref ${escapeHtml(item.reference)}</span>` : ''}
          </div>
          <h1 style="font-size:1.5rem">${escapeHtml(item.title)}</h1>
          <p>${escapeHtml(item.description)}</p>
          <ul class="detail-list">
            <li><span class="k">Location</span><span class="v">${escapeHtml(item.location)}</span></li>
            <li><span class="k">${item.type === 'lost' ? 'Lost on' : 'Found on'}</span><span class="v">${formatDate(item.dateLostOrFound)}</span></li>
            <li><span class="k">Reported</span><span class="v">${timeAgo(item.createdAt)}</span></li>
            <li><span class="k">Reported by</span><span class="v">${escapeHtml(item.reporter?.name || 'A student')}</span></li>
            <li><span class="k">Status</span><span class="v">${escapeHtml(statusLabel(item.status))}</span></li>
            <li><span class="k">Views</span><span class="v">${item.views || 0}</span></li>
          </ul>
          ${privateBlock}
          ${moderationNote}
          ${isOwner ? `<p class="small muted mt-2" style="margin-bottom:0">This is your listing · <a href="/dashboard.html">manage it in your dashboard</a></p>` : ''}
        </div>
      </div>

      <aside class="stack">
        ${
          canClaim
            ? `<div class="card card-pad">
                 <h2 style="font-size:1.05rem">Claim this item</h2>
                 <p class="small muted">Explain why it is yours. Your proof is private — only the person who posted the item sees it.</p>
                 <div id="claim-errors" class="hidden"></div>
                 <form id="claim-form">
                   <div class="field">
                     <label for="claim-message">Why is this yours?</label>
                     <textarea id="claim-message" required minlength="10" maxlength="800" placeholder="Describe the item, when you last had it, and anything only the owner would know."></textarea>
                   </div>
                   <div class="field">
                     <label for="claim-proof">Private proof (optional)</label>
                     <input type="text" id="claim-proof" maxlength="400" placeholder="e.g. serial number, invoice date, contents">
                     <div class="hint">Never shown publicly.</div>
                   </div>
                   <button class="btn btn-block" type="submit" id="claim-btn">Submit claim</button>
                 </form>
               </div>`
            : isLoggedIn()
              ? `<div class="card card-pad"><h2 style="font-size:1.05rem">${isOwner ? 'Your listing' : 'Claiming unavailable'}</h2>
                   <p class="small muted" style="margin:0">${isOwner
                     ? 'You posted this item. Manage claims from your dashboard.'
                     : `This item is ${escapeHtml(statusLabel(item.status).toLowerCase())}, so new claims are closed.`}</p>
                   ${isOwner ? '<a class="btn btn-outline btn-sm mt-2" href="/dashboard.html">Go to dashboard</a>' : ''}
                 </div>`
              : `<div class="card card-pad">
                   <h2 style="font-size:1.05rem">Is this yours?</h2>
                   <p class="small muted">Log in to submit a claim with private proof.</p>
                   <a class="btn btn-block" href="/login.html?next=${encodeURIComponent(`/item.html?id=${item._id}`)}">Log in to claim</a>
                 </div>`
        }

        <div class="card card-pad">
          <h2 style="font-size:1.05rem">Safe handover</h2>
          <p class="small muted" style="margin:0">Meet at a public campus spot such as the library entrance or the security desk. Never share OTPs, bank details or payment requests.</p>
        </div>

        <div class="card card-pad">
          <h2 style="font-size:1.05rem">${item.claimsCount || 0} claim${item.claimsCount === 1 ? '' : 's'} so far</h2>
          <p class="small muted" style="margin:0">${isAdmin() ? 'As an admin you can review every claim from the admin dashboard.' : 'Claim details are private to the person who posted the item.'}</p>
        </div>
      </aside>
    </div>`;

  const claimForm = document.getElementById('claim-form');
  if (claimForm) {
    claimForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('claim-btn');
      const message = document.getElementById('claim-message').value.trim();
      if (message.length < 10) {
        showFormErrors(document.getElementById('claim-errors'), { message: 'Please write at least 10 characters' });
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Submitting…';
      try {
        await api('/api/v1/claims', {
          method: 'POST',
          body: { itemId: item._id, message, proof: document.getElementById('claim-proof').value.trim() },
        });
        toast('Claim submitted. Track it in your dashboard.', 'success');
        setTimeout(() => { window.location.href = '/dashboard.html'; }, 900);
      } catch (err) {
        showFormErrors(document.getElementById('claim-errors'), err);
        btn.disabled = false;
        btn.textContent = 'Submit claim';
      }
    });
  }
}
