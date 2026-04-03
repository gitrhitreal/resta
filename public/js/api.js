/* ══════════════════════════════════════════════════════════════
   API CLIENT — Shared by all panels
   ══════════════════════════════════════════════════════════════ */
const API = (() => {
  const BASE = '';

  function getToken() { return localStorage.getItem('token'); }
  function setToken(t) { localStorage.setItem('token', t); }
  function clearToken() { localStorage.removeItem('token'); }

  async function request(url, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...opts.headers };
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(BASE + url, { ...opts, headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  return {
    getToken, setToken, clearToken,
    get: (url) => request(url),
    post: (url, body) => request(url, { method: 'POST', body: JSON.stringify(body) }),
    put: (url, body) => request(url, { method: 'PUT', body: JSON.stringify(body) }),
    patch: (url, body) => request(url, { method: 'PATCH', body: JSON.stringify(body) }),
    del: (url) => request(url, { method: 'DELETE' }),
    upload: async (url, file, fieldName = 'logo') => {
      const fd = new FormData();
      fd.append(fieldName, file);
      const token = getToken();
      const res = await fetch(BASE + url, {
        method: 'POST', body: fd,
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      return res.json();
    }
  };
})();
