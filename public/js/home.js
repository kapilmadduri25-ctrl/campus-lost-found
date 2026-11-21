/** Home page: search, filters, sorting, pagination. */
import { api } from './api.js';
import { itemCard, emptyState, spinner, escapeHtml, qs, errorState, bindRetry } from './ui.js';
import { mountHeader, setYear } from './common.js';

mountHeader();
setYear();

const grid = document.getElementById('items-grid');
const pagination = document.getElementById('pagination');
const countEl = document.getElementById('results-count');
const titleEl = document.getElementById('results-title');
const form = document.getElementById('search-form');
const sortSelect = document.getElementById('sort');

const state = {
  search: qs('search') || '',
  category: qs('category') || '',
  location: qs('location') || '',
  type: qs('type') || '',
  status: qs('status') || '',
  from: qs('from') || '',
  to: qs('to') || '',
  sort: qs('sort') || 'newest',
  page: Number(qs('page')) || 1,
};

const PAGE_SIZE = 9;

/* ------------------------- populate filter options ---------------------- */
async function loadMeta() {
  try {
    const meta = await api('/api/v1/meta');
    const catSel = document.getElementById('filter-category');
    const locSel = document.getElementById('filter-location');
    meta.categories.forEach((c) => catSel.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`));
    meta.locations.forEach((l) => locSel.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`));

    document.getElementById('search').value = state.search;
    catSel.value = state.category;
    locSel.value = state.location;
    document.getElementById('filter-type').value = state.type;
    document.getElementById('filter-status').value = state.status;
    document.getElementById('filter-from').value = state.from;
    document.getElementById('filter-to').value = state.to;
    sortSelect.value = state.sort;

    const chips = document.getElementById('quick-chips');
    const quick = ['Electronics', 'ID Card', 'Keys', 'Wallet & Cards', 'Books & Notes'];
    chips.innerHTML = quick
      .map((c) => `<button type="button" class="chip" data-cat="${escapeHtml(c)}" aria-pressed="${state.category === c}">${escapeHtml(c)}</button>`)
      .join('');
    chips.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cat]');
      if (!btn) return;
      state.category = state.category === btn.dataset.cat ? '' : btn.dataset.cat;
      document.getElementById('filter-category').value = state.category;
      chips.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.cat === state.category)));
      state.page = 1;
      load();
    });
  } catch (err) {
    console.warn('meta failed', err.message);
  }
}

/* ------------------------------ rendering ------------------------------ */
function syncUrl() {
  const params = new URLSearchParams();
  Object.entries(state).forEach(([k, v]) => {
    if (v && !(k === 'page' && v === 1) && !(k === 'sort' && v === 'newest')) params.set(k, v);
  });
  const search = params.toString();
  window.history.replaceState({}, '', search ? `?${search}` : window.location.pathname);
}

function renderPagination(data) {
  pagination.innerHTML = '';
  if (data.pages <= 1) return;

  const makeBtn = (label, page, opts = {}) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    if (opts.current) b.setAttribute('aria-current', 'true');
    if (opts.disabled) b.disabled = true;
    b.addEventListener('click', () => {
      state.page = page;
      load();
      window.scrollTo({ top: 320, behavior: 'smooth' });
    });
    pagination.appendChild(b);
  };

  makeBtn('‹ Prev', Math.max(1, data.page - 1), { disabled: data.page === 1 });
  for (let i = 1; i <= data.pages; i += 1) {
    if (data.pages > 7 && Math.abs(i - data.page) > 2 && i !== 1 && i !== data.pages) {
      if (i === 2 || i === data.pages - 1) pagination.insertAdjacentHTML('beforeend', '<span class="muted small" style="padding:.45rem">…</span>');
      continue;
    }
    makeBtn(String(i), i, { current: i === data.page });
  }
  makeBtn('Next ›', Math.min(data.pages, data.page + 1), { disabled: data.page === data.pages });
}

function heading() {
  if (state.search) return `Results for “${state.search}”`;
  if (state.type === 'lost') return 'Lost items';
  if (state.type === 'found') return 'Found items';
  if (state.category) return `${state.category} listings`;
  return 'Recently reported items';
}

/* -------------------------------- load --------------------------------- */
async function load() {
  grid.innerHTML = spinner();
  pagination.innerHTML = '';
  titleEl.textContent = heading();

  const params = new URLSearchParams();
  Object.entries(state).forEach(([k, v]) => {
    if (v) params.set(k, v);
  });
  params.set('limit', String(PAGE_SIZE));

  try {
    const data = await api(`/api/v1/items?${params.toString()}`);
    countEl.textContent = data.total
      ? `${data.total} item${data.total > 1 ? 's' : ''} found · page ${data.page} of ${data.pages}`
      : 'No items match these filters yet';

    grid.innerHTML = data.items.length
      ? data.items.map(itemCard).join('')
      : emptyState('Nothing here yet', 'Try a different keyword or clear the filters, or report the item yourself.');

    renderPagination(data);
    syncUrl();
  } catch (err) {
    countEl.textContent = '';
    grid.innerHTML = errorState(err.message, 'Could not load listings');
    bindRetry(grid, load);
  }
}

/* ------------------------------- events -------------------------------- */
form.addEventListener('submit', (e) => {
  e.preventDefault();
  state.search = document.getElementById('search').value.trim();
  state.category = document.getElementById('filter-category').value;
  state.location = document.getElementById('filter-location').value;
  state.type = document.getElementById('filter-type').value;
  state.status = document.getElementById('filter-status').value;
  state.from = document.getElementById('filter-from').value;
  state.to = document.getElementById('filter-to').value;
  state.page = 1;
  load();
});

document.getElementById('reset-filters')?.addEventListener('click', () => {
  Object.assign(state, { search: '', category: '', location: '', type: '', status: '', from: '', to: '', sort: 'newest', page: 1 });
  document.getElementById('search').value = '';
  document.getElementById('filter-category').value = '';
  document.getElementById('filter-location').value = '';
  document.getElementById('filter-type').value = '';
  document.getElementById('filter-status').value = '';
  document.getElementById('filter-from').value = '';
  document.getElementById('filter-to').value = '';
  sortSelect.value = 'newest';
  document.querySelectorAll('#quick-chips .chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
  load();
});

sortSelect.addEventListener('change', () => {
  state.sort = sortSelect.value;
  state.page = 1;
  load();
});

let debounce;
document.getElementById('search').addEventListener('input', (e) => {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    state.search = e.target.value.trim();
    state.page = 1;
    load();
  }, 400);
});

/* ----------------------------- stat counters --------------------------- */
async function loadCounts() {
  try {
    const [lost, found] = await Promise.all([
      api('/api/v1/items?type=lost&limit=1'),
      api('/api/v1/items?type=found&limit=1'),
    ]);
    document.getElementById('stat-lost').textContent = `${lost.total} lost reports`;
    document.getElementById('stat-found').textContent = `${found.total} found reports`;
  } catch {
    /* counters are cosmetic */
  }
}

loadMeta();
load();
loadCounts();
