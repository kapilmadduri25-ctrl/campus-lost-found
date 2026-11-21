/** Handles both recovery screens: request a token, then set a new password. */
import { api } from './api.js';
import { mountHeader, setYear } from './common.js';
import { showFormErrors, wirePasswordToggles, qs } from './ui.js';

mountHeader();
setYear();
wirePasswordToggles();

const forgotForm = document.getElementById('forgot-form');
const resetForm = document.getElementById('reset-form');
const errorBox = document.getElementById('form-errors');
const submitBtn = document.getElementById('submit-btn');

/* ---------------------------- request a link ---------------------------- */
if (forgotForm) {
  forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.hidden = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';

    try {
      const data = await api('/api/v1/auth/forgot-password', {
        method: 'POST',
        body: { email: document.getElementById('email').value.trim() },
      });

      const box = document.getElementById('reset-result');
      box.hidden = false;
      box.classList.remove('hidden');
      box.innerHTML = `<strong>${data.message}</strong>${
        data.devToken
          ? `<p class="small" style="margin:.6rem 0 0">No email server is configured in development, so here is the token: <a href="/reset-password.html?token=${encodeURIComponent(data.devToken)}">open the reset page</a>.</p>`
          : ''
      }`;
      forgotForm.reset();
    } catch (err) {
      showFormErrors(errorBox, err);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send reset link';
    }
  });
}

/* ---------------------------- set a new one ----------------------------- */
if (resetForm) {
  const tokenField = document.getElementById('token');
  const prefilled = qs('token');
  if (prefilled) tokenField.value = prefilled;

  resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.hidden = true;

    const password = document.getElementById('password').value;
    const confirm = document.getElementById('confirm').value;

    if (password !== confirm) {
      showFormErrors(errorBox, {
        message: 'The two passwords do not match',
        details: [{ field: 'confirm', message: 'Please type the same password again' }],
      });
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Updating…';

    try {
      await api('/api/v1/auth/reset-password', {
        method: 'POST',
        body: { token: tokenField.value.trim(), password },
      });
      window.location.replace('/login.html?reset=1');
    } catch (err) {
      showFormErrors(errorBox, err);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Update password';
    }
  });
}
