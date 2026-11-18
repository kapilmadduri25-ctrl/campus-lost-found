/** Login + registration pages. */
import { api, saveSession, isLoggedIn, isAdmin } from './api.js';
import { mountHeader, setYear } from './common.js';
import { showFormErrors, qs } from './ui.js';

mountHeader();
setYear();

const nextUrl = qs('next') || '/dashboard.html';
if (isLoggedIn()) window.location.replace(nextUrl);

const errorBox = document.getElementById('form-errors');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');

async function submitHandler(form, path, button, buildBody) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.classList.add('hidden');
    button.disabled = true;
    button.textContent = 'Please wait…';

    try {
      const data = await api(path, { method: 'POST', body: buildBody() });
      saveSession(data.token, data.user);
      window.location.href = data.user.role === 'admin' ? '/admin.html' : nextUrl;
    } catch (err) {
      showFormErrors(errorBox, err);
      button.disabled = false;
      button.textContent = path.includes('login') ? 'Log in' : 'Create account';
    }
  });
}

if (loginForm) {
  submitHandler(loginForm, '/api/v1/auth/login', document.getElementById('submit-btn'), () => ({
    email: document.getElementById('email').value.trim(),
    password: document.getElementById('password').value,
  }));
}

if (registerForm) {
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('password').value;
    const confirm = document.getElementById('confirm').value;
    if (password !== confirm) {
      showFormErrors(errorBox, { message: 'Passwords do not match' });
      return;
    }

    const button = document.getElementById('submit-btn');
    errorBox.classList.add('hidden');
    button.disabled = true;
    button.textContent = 'Please wait…';

    try {
      const data = await api('/api/v1/auth/register', {
        method: 'POST',
        body: {
          name: document.getElementById('name').value.trim(),
          email: document.getElementById('email').value.trim(),
          password,
          department: document.getElementById('department').value.trim(),
          phone: document.getElementById('phone').value.trim(),
        },
      });
      saveSession(data.token, data.user);
      window.location.href = nextUrl;
    } catch (err) {
      showFormErrors(errorBox, err);
      button.disabled = false;
      button.textContent = 'Create account';
    }
  });
}
