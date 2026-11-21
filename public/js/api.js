/**
 * api.js - one small wrapper around fetch() used by every page.
 * Handles the JWT header, JSON parsing and error messages.
 *
 * The API is versioned: all calls go to /api/v1.
 */
const TOKEN_KEY = 'lostly_token';
const USER_KEY = 'lostly_user';
export const API_BASE = '/api/v1';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch {
    return null;
  }
}

export function saveSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isLoggedIn() {
  return Boolean(getToken());
}

export function isAdmin() {
  return getUser()?.role === 'admin';
}

/**
 * api('/items?type=lost', { method: 'GET' })
 * api('/items', { method: 'POST', body: formData })   // FormData is sent as-is
 */
export async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const opts = { method, headers: { ...headers } };

  const token = getToken();
  if (token) opts.headers.Authorization = `Bearer ${token}`;

  if (body instanceof FormData) {
    opts.body = body; // let the browser set the multipart boundary
  } else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  const url = path.startsWith('/api/') ? path : `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;

  // a stalled request must never leave a page spinning forever
  if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
    opts.signal = AbortSignal.timeout(15000);
  }

  let res;
  try {
    res = await fetch(url, opts);
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw new Error('The server took too long to respond. Please try again.');
    }
    throw new Error('Cannot reach the server. Check your connection and try again.');
  }

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (!res.ok) {
    // the API returns { success:false, error:{ code, message, details }, requestId }
    const apiError = data?.error || {};
    const err = new Error(apiError.message || data?.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = apiError.code;
    err.details = apiError.details || data?.details;
    err.requestId = data?.requestId;
    if (res.status === 401 && !path.includes('/auth/')) {
      clearSession();
      // an expired session should land on the login page, not on a dead error state
      if (!window.location.pathname.startsWith('/login')) {
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `/login.html?next=${next}`;
      }
    }
    throw err;
  }

  return data;
}
