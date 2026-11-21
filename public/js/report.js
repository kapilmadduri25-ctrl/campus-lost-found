/**
 * Report page - creates a new listing, or edits one when ?id= is present.
 * Uses FormData so the optional image uploads with the same request.
 * The form works independently of the item-list request (blueprint AC-02).
 */
import { api } from './api.js';
import { mountHeader, setYear, requireLogin } from './common.js';
import { showFormErrors, toast, escapeHtml, qs, formatDate } from './ui.js';

mountHeader();
setYear();

if (requireLogin()) {
  const editId = qs('id');
  const presetType = qs('type') === 'found' ? 'found' : 'lost';

  const form = document.getElementById('report-form');
  const errorBox = document.getElementById('form-errors');
  const submitBtn = document.getElementById('submit-btn');
  const typeInput = document.getElementById('type');
  const matchesBox = document.getElementById('matches');
  const descEl = document.getElementById('description');
  const dateEl = document.getElementById('dateLostOrFound');

  const today = new Date().toISOString().split('T')[0];
  dateEl.value = today;
  dateEl.max = today;

  descEl.addEventListener('input', () => {
    document.getElementById('desc-count').textContent = String(descEl.value.length);
  });

  function updateDateLabel() {
    document.getElementById('date-label').textContent = typeInput.value === 'lost' ? 'Date you lost it' : 'Date you found it';
  }

  function setType(type) {
    typeInput.value = type;
    document.querySelectorAll('[data-type]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.type === type)));
    updateDateLabel();
  }

  document.querySelectorAll('[data-type]').forEach((btn) => {
    btn.addEventListener('click', () => setType(btn.dataset.type));
  });

  setType(presetType);

  /* ----------------------------- setup data ---------------------------- */
  async function setup() {
    try {
      const meta = await api('/api/v1/meta');
      const catSel = document.getElementById('category');
      const locSel = document.getElementById('location');
      meta.categories.forEach((c) => catSel.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`));
      meta.locations.forEach((l) => locSel.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`));
    } catch (err) {
      showFormErrors(errorBox, err);
      return;
    }

    if (editId) {
      document.getElementById('form-title').textContent = 'Edit your listing';
      document.getElementById('crumb').textContent = 'Edit listing';
      submitBtn.textContent = 'Save changes';
      try {
        const { item } = await api(`/api/v1/items/${editId}`);
        if (!item.isOwner) {
          showFormErrors(errorBox, { message: 'You can only edit your own listings.' });
          submitBtn.disabled = true;
          return;
        }
        document.getElementById('title').value = item.title;
        descEl.value = item.description;
        document.getElementById('desc-count').textContent = String(item.description.length);
        document.getElementById('descriptionPrivate').value = item.descriptionPrivate || '';
        document.getElementById('category').value = item.category;
        document.getElementById('location').value = item.location;
        document.getElementById('contactInfo').value = item.contactInfo || '';
        dateEl.value = new Date(item.dateLostOrFound).toISOString().split('T')[0];
        setType(item.type);
        matchesBox.innerHTML = '<p class="small muted">Editing an existing report. Changes are saved immediately.</p>';
      } catch (err) {
        showFormErrors(errorBox, err);
      }
    }
  }

  /* --------------------------- client validation ------------------------ */
  function clientValidate(fd) {
    const errors = [];
    const title = String(fd.get('title') || '').trim();
    const description = String(fd.get('description') || '').trim();

    if (title.length < 3) errors.push({ field: 'title', message: 'Item name must be at least 3 characters' });
    if (title.length > 90) errors.push({ field: 'title', message: 'Item name must be 90 characters or fewer' });
    if (description.length < 10) errors.push({ field: 'description', message: 'Description must be at least 10 characters' });
    if (!fd.get('category')) errors.push({ field: 'category', message: 'Please choose a category' });
    if (!fd.get('location')) errors.push({ field: 'location', message: 'Please choose a campus location' });
    if (!fd.get('dateLostOrFound')) errors.push({ field: 'dateLostOrFound', message: 'Please choose the date' });
    if (!document.getElementById('accuracy').checked) {
      errors.push({ field: 'accuracy', message: 'Please confirm the report is accurate' });
    }
    return errors;
  }

  /* ------------------------------- submit ------------------------------ */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.classList.add('hidden');

    const fd = new FormData(form);
    if (!fd.get('image')?.size) fd.delete('image');

    const clientErrors = clientValidate(fd);
    if (clientErrors.length) {
      showFormErrors(errorBox, { message: 'Please correct the highlighted fields', details: clientErrors });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving…';

    try {
      const data = await api(editId ? `/api/v1/items/${editId}` : '/api/v1/items', {
        method: editId ? 'PATCH' : 'POST',
        body: fd,
      });

      toast(editId ? 'Listing updated' : 'Report submitted', 'success');

      if (editId) {
        window.location.href = `/item.html?id=${editId}`;
        return;
      }

      // success confirmation with the human-readable reference
      form.reset();
      dateEl.value = today;
      document.getElementById('desc-count').textContent = '0';
      setType('lost');
      renderSuccess(data);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      showFormErrors(errorBox, err);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = editId ? 'Save changes' : 'Submit report';
    }
  });

  /* --------------------------- result rendering ------------------------ */
  function renderSuccess(data) {
    const item = data.item;
    const pending = item.status === 'pending';
    const matches = data.possibleMatches || [];

    matchesBox.innerHTML = `
      <div class="alert ${pending ? 'alert-info' : 'alert-success'}" style="margin:0">
        <strong>${pending ? 'Report submitted for review.' : 'Report submitted.'}</strong><br>
        Your reference is <strong>${escapeHtml(data.reference || item.reference)}</strong>.
        ${pending ? 'An administrator will approve it shortly.' : 'It is now visible in public search.'}
      </div>
      <p class="small mt-2"><a href="/item.html?id=${item._id}">Open your listing →</a> · <a href="/dashboard.html">My dashboard</a></p>
      ${
        matches.length
          ? `<h3 style="font-size:.95rem;margin:1rem 0 .5rem">Possible matches (${matches.length})</h3>
             ${matches
               .map(
                 (m) => `<div class="match-card" style="margin-bottom:.5rem">
                   <div class="match-score">${m.matchScore}% keyword match</div>
                   <h3 style="font-size:.95rem;margin:.25rem 0"><a href="/item.html?id=${m._id}">${escapeHtml(m.title)}</a></h3>
                   <p class="small muted" style="margin:0">${escapeHtml(m.category)} · ${escapeHtml(m.location)} · ${formatDate(m.dateLostOrFound)}</p>
                 </div>`
               )
               .join('')}
             <p class="small muted">Both people have been notified.</p>`
          : '<p class="small muted">No matching open listings right now — you will get a notification if one appears.</p>'
      }`;
  }

  setup();
}
