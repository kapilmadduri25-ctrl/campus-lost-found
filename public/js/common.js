/**
 * common.js - header, navigation and theme behaviour shared by every page.
 * Imported as a module by each page's script.
 */
import { getUser, isLoggedIn, isAdmin, clearSession } from './api.js';

const THEME_KEY = 'clf_theme';

/** Light/dark switch. The choice is remembered and applied before paint in <head>. */
export function mountTheme() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;

  const sync = () => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    btn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    btn.setAttribute('title', dark ? 'Switch to light theme' : 'Switch to dark theme');
  };
  sync();

  btn.addEventListener('click', () => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    const next = dark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* private mode - theme just will not persist */
    }
    sync();
  });
}

export function mountHeader() {
  mountTheme();

  const toggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.nav');

  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.querySelector('.nav-toggle-label').textContent = open ? 'Close' : 'Menu';
      if (open) nav.querySelector('a')?.focus();
    });

    // Escape closes the menu and returns focus to the toggle
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.classList.contains('open')) {
        nav.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.querySelector('.nav-toggle-label').textContent = 'Menu';
        toggle.focus();
      }
    });

    // close the mobile menu after choosing a destination
    nav.addEventListener('click', (e) => {
      if (e.target.closest('a') && nav.classList.contains('open')) {
        nav.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.querySelector('.nav-toggle-label').textContent = 'Menu';
      }
    });
  }

  const slot = document.getElementById('nav-auth');
  if (!slot) return;

  const user = getUser();
  if (isLoggedIn() && user) {
    slot.innerHTML = `
      <span class="nav-user">${escape(user.name.split(' ')[0])}${isAdmin() ? ' · admin' : ''}</span>
      <a href="/dashboard.html">Dashboard</a>
      ${isAdmin() ? '<a href="/admin.html">Admin</a>' : ''}
      <button type="button" class="linklike" id="logout-btn">Log out</button>`;
    slot.querySelector('#logout-btn')?.addEventListener('click', () => {
      clearSession();
      window.location.href = '/index.html';
    });
  } else {
    slot.innerHTML = `
      <div class="nav-actions">
        <a class="btn btn-outline btn-sm" href="/login.html">Log in</a>
        <a class="btn btn-sm" href="/register.html">Sign up</a>
      </div>`;
  }

  // highlight the current page in the nav
  const page = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav a[href]').forEach((a) => {
    const href = a.getAttribute('href');
    if (href.endsWith(page) && !href.includes('?')) a.classList.add('active');
  });
}

function escape(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Redirects to login when the page needs a session. */
export function requireLogin() {
  if (!isLoggedIn()) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login.html?next=${next}`;
    return false;
  }
  return true;
}

export function setYear() {
  const el = document.getElementById('year');
  if (el) el.textContent = String(new Date().getFullYear());
}
