/** Profile page: account details and password change. */
import { api, getUser, saveSession, getToken } from './api.js';
import { mountHeader, setYear, requireLogin } from './common.js';
import { showFormErrors, wirePasswordToggles, toast } from './ui.js';

mountHeader();
setYear();
wirePasswordToggles();

if (requireLogin()) {
  const user = getUser();
  document.getElementById('name').value = user.name || '';
  document.getElementById('email').value = user.email || '';
  document.getElementById('department').value = user.department || '';
  document.getElementById('phone').value = user.phone || '';

  /* ------------------------------ details ------------------------------ */
  const profileForm = document.getElementById('profile-form');
  const profileErrors = document.getElementById('form-errors');
  const profileOk = document.getElementById('profile-ok');
  const saveProfile = document.getElementById('save-profile');

  profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    profileErrors.hidden = true;
    profileOk.hidden = true;
    saveProfile.disabled = true;

    try {
      const { user: updated } = await api('/api/v1/auth/me', {
        method: 'PATCH',
        body: {
          name: document.getElementById('name').value.trim(),
          department: document.getElementById('department').value.trim(),
          phone: document.getElementById('phone').value.trim(),
        },
      });
      saveSession(getToken(), updated);
      profileOk.hidden = false;
      profileOk.classList.remove('hidden');
      profileOk.textContent = 'Profile saved.';
      toast('Profile saved', 'success');
    } catch (err) {
      showFormErrors(profileErrors, err);
    } finally {
      saveProfile.disabled = false;
    }
  });

  /* ---------------------------- password ------------------------------- */
  const pwForm = document.getElementById('password-form');
  const pwErrors = document.getElementById('pw-errors');
  const pwOk = document.getElementById('pw-ok');
  const savePw = document.getElementById('save-password');

  pwForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    pwErrors.hidden = true;
    pwOk.hidden = true;

    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (newPassword !== confirmPassword) {
      showFormErrors(pwErrors, {
        message: 'The two new passwords do not match',
        details: [{ field: 'confirmPassword', message: 'Please type the same password again' }],
      });
      return;
    }

    savePw.disabled = true;
    try {
      await api('/api/v1/auth/me/password', { method: 'PATCH', body: { currentPassword, newPassword } });
      pwForm.reset();
      pwOk.hidden = false;
      pwOk.classList.remove('hidden');
      pwOk.textContent = 'Password changed. Use the new one next time you sign in.';
      toast('Password changed', 'success');
    } catch (err) {
      showFormErrors(pwErrors, err);
    } finally {
      savePw.disabled = false;
    }
  });
}
