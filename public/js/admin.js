/* ══════════════════════════════════════════════════════════════
   RESTAURANT ADMIN LOGIC
   ══════════════════════════════════════════════════════════════ */

let RESTAURANT = null;
let CATEGORIES = [];
let MENU = [];
let BUTTONS = [];

function escapeHTML(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}


// ─── Boot & Auth ──────────────────────────────────────────────
async function init() {
  if (API.getToken()) {
    try {
      RESTAURANT = await API.get('/api/restaurant');
      showApp();
    } catch { API.clearToken(); document.getElementById('login-screen').style.display = 'flex'; }
  } else {
    document.getElementById('login-screen').style.display = 'flex';
  }
}

// UI Toggles
function toggleAuth(type) {
  document.getElementById('login-screen').style.display = 'flex';
}

// Login
document.getElementById('btn-login').onclick = async () => {
  try {
    const data = await API.post('/api/auth/restaurant-login', {
      username: document.getElementById('login-user').value.trim(),
      password: document.getElementById('login-pass').value
    });
    API.setToken(data.token);
    RESTAURANT = data.restaurant;
    showApp();
  } catch(e) { showError('login-error', e.message); }
};



function showError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg; el.classList.add('show');
}

async function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('admin-app').classList.add('active');
  
  // Fill sidebar info
  document.getElementById('sb-name').textContent = RESTAURANT.name;
  document.getElementById('sb-user').textContent = '@' + RESTAURANT.username;
  
  applyBrandingColors();

  // Preload categories so Menu and other pages don't crash on an empty map
  try {
    const rawCats = await API.get('/api/restaurant/categories');
    CATEGORIES = Array.isArray(rawCats) ? rawCats : [];
  } catch(e) { console.error("Failed to load categories on boot", e); CATEGORIES = []; }

  loadDashboard();
}

document.getElementById('btn-logout').onclick = () => { API.clearToken(); location.reload(); };
document.getElementById('btn-copy-link').onclick = () => {
  navigator.clipboard.writeText(location.origin + '/r/' + RESTAURANT.slug);
  showToast('Customer link copied to clipboard!');
};

// ─── Navigation ──────────────────────────────────────────────
const pages = ['dashboard', 'qr', 'categories', 'menu', 'branding', 'buttons', 'settings'];
document.querySelectorAll('.nav-item[data-page]').forEach(item => {
  item.onclick = () => {
    document.querySelectorAll('.nav-item[data-page]').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    const p = item.dataset.page;
    pages.forEach(pg => document.getElementById('page-' + pg).style.display = pg === p ? '' : 'none');
    document.getElementById('page-title').textContent = item.querySelector('span:last-child')?.textContent?.trim() || item.textContent.trim();
    if(p === 'dashboard') loadDashboard();
    if(p === 'categories') loadCategories();
    if(p === 'menu') loadMenu();
    if(p === 'qr') loadQR();
    if(p === 'branding') loadBranding();
    if(p === 'buttons') loadButtons();
    closeSidebar();
  };
});

document.getElementById('mobile-toggle').onclick = () => {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar-overlay').classList.add('open');
};
document.getElementById('sidebar-overlay').onclick = closeSidebar;
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
}

// ─── Dashboard ───────────────────────────────────────────────
async function loadDashboard() {
  try {
    const s = await API.get('/api/restaurant/stats');
    document.getElementById('stats-grid').innerHTML = `
      <div class="stat-card"><div class="stat-icon">🍔</div><div class="stat-value">${s.totalItems}</div><div class="stat-label">Total Menu Items</div></div>
      <div class="stat-card"><div class="stat-icon">✅</div><div class="stat-value">${s.activeItems}</div><div class="stat-label">Active Items</div></div>
    `;
  } catch(e) { showToast('Stats error', true); }
}

// ─── Universal QR ────────────────────────────────────────────
async function loadQR() {
  try {
    const data = await API.get('/api/restaurant/qr');
    document.getElementById('universal-qr-img').src = data.qr_url;
    
    // Convert DataURL to Blob safely
    const arr = data.qr_url.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while(n--) { u8arr[n] = bstr.charCodeAt(n); }
    const blob = new Blob([u8arr], {type:mime});
    const objectUrl = URL.createObjectURL(blob);
    
    const dlBtn = document.getElementById('universal-qr-download');
    dlBtn.href = objectUrl;
    dlBtn.download = RESTAURANT.slug + '-qr.png';
    
    document.getElementById('btn-copy-link-main').onclick = () => {
      navigator.clipboard.writeText(data.url);
      showToast('Link copied!');
    };
  } catch(e) { showToast('QR load failed', true); }
}

// ─── Categories Management ───────────────────────────────────
async function loadCategories() {
  try {
    const rawCats = await API.get('/api/restaurant/categories');
    CATEGORIES = Array.isArray(rawCats) ? rawCats : [];
    
    const list = document.getElementById('categories-list');
    
    if (CATEGORIES.length === 0) {
      list.innerHTML = '<div class="empty-state">No categories defined yet. Add one above!</div>';
      return;
    }

    list.innerHTML = CATEGORIES.map((c, index) => `
      <div class="menu-item" data-id="${c.id}" style="padding:16px;">
        <div class="mi-drag"><span></span><span></span><span></span></div>
        <div class="mi-body" style="padding-left:16px;">
        <div class="mi-name">${escapeHTML(c.name)}</div>
          <div class="mi-meta"><span class="mi-cat">Sort Order: ${index + 1}</span></div>
        </div>
        <div class="mi-actions">
          <button class="btn-icon" title="Edit" onclick="editCategory(${c.id})">✏️</button>
          <button class="btn-icon danger" title="Delete" onclick="deleteCategory(${c.id})">🗑️</button>
        </div>
      </div>
    `).join('');

    Sortable.create(list, {
      handle: '.mi-drag',
      animation: 150,
      onEnd: async function() {
        const order = Array.from(list.children).map((el, idx) => ({ id: parseInt(el.dataset.id), sort_order: idx }));
        try { await API.post('/api/restaurant/categories/reorder', { order }); }
        catch(e) { showToast('Reorder failed', true); loadCategories(); }
      }
    });
  } catch(e) { showToast('Failed to load categories', true); }
}

window.addCategory = async () => {
  const name = prompt('Enter new category name:');
  if(!name) return;
  try {
    await API.post('/api/restaurant/categories', { name });
    showToast('Category added');
    loadCategories();
  } catch(e) { showToast('Failed', true); }
};

window.editCategory = async (id) => {
  const c = CATEGORIES.find(x => x.id === id);
  if(!c) return;
  const name = prompt('Edit category name:', c.name);
  if(!name || name === c.name) return;
  try {
    await API.put('/api/restaurant/categories/' + id, { name });
    showToast('Category updated');
    loadCategories();
  } catch(e) { showToast('Failed', true); }
};

window.deleteCategory = async (id) => {
  const c = CATEGORIES.find(x => x.id === id);
  if(!c) return;
  if(!confirm(`Delete "${c.name}" category? (This won't delete the items in it, but they may be hidden from the menu until assigned a new category)`)) return;
  try {
    await API.del('/api/restaurant/categories/' + id);
    showToast('Deleted');
    loadCategories();
  } catch(e) { showToast('Delete failed', true); }
};

// ─── Menu Management ─────────────────────────────────────────
async function loadMenu() {
  try {
    MENU = await API.get('/api/restaurant/menu');
    // Extract unique categories for filters
    const allCats = new Set([ ...CATEGORIES.map(c => c.name), ...MENU.map(i => i.category) ]);
    const cats = [...allCats];
    document.getElementById('cat-filters').innerHTML = `
      <button class="filter-pill active" data-cat="all">All</button>
      ${cats.map(c => `<button class="filter-pill" data-cat="${escapeHTML(c)}">${escapeHTML(c)}</button>`).join('')}
    `;
    
    document.querySelectorAll('#cat-filters .filter-pill').forEach(btn => {
      btn.onclick = () => {
        activeCat = btn.getAttribute('data-cat');
        document.querySelectorAll('#cat-filters .filter-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderMenu();
      };
    });
    
    renderMenu();
  } catch(e) { showToast('Menu error', true); }
}

let activeCat = 'all';

document.getElementById('menu-search').oninput = renderMenu;

function renderMenu() {
  const q = document.getElementById('menu-search').value.toLowerCase();
  let items = MENU;
  if(activeCat !== 'all') items = items.filter(i => i.category === activeCat);
  if(q) items = items.filter(i => i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q));
  
  const list = document.getElementById('menu-list');
  if(!items.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🍽️</div><div class="empty-state-text">No menu items found</div></div>`;
    return;
  }

  list.innerHTML = items.map(i => `
    <div class="menu-item ${i.active ? '' : 'inactive'} ${i.available ? '' : 'unavailable'}" data-id="${i.id}">
      <div class="mi-drag"><span></span><span></span><span></span></div>
      <div class="mi-img">${i.img.length < 5 ? i.img : `<img src="${i.img}"/>`}</div>
      <div class="mi-body">
        <div class="mi-name">${escapeHTML(i.name)}</div>
        <div class="mi-meta">
          <span class="mi-price">${RESTAURANT.currency || '£'}${i.price.toFixed(2)}</span>
          <span class="mi-cat">${escapeHTML(i.category)}</span>
          ${!i.available ? `<span class="badge badge-error">Out of Stock</span>` : ''}
        </div>
      </div>
      <div class="mi-actions">
        <button class="btn-icon" title="Toggle Out of Stock" onclick="toggleStock(${i.id}, ${i.available})">${i.available ? '🟢' : '🔴'}</button>
        <button class="btn-icon" title="Edit" onclick="editItem(${i.id})">✏️</button>
        <button class="btn-icon danger" title="Delete" onclick="deleteItem(${i.id})">🗑️</button>
      </div>
    </div>
  `).join('');

  // Enable drag & drop sorting
  if(activeCat === 'all' && !q) {
    Sortable.create(list, {
      handle: '.mi-drag',
      animation: 150,
      onEnd: async function() {
        const order = Array.from(list.children).map((el, index) => ({ id: parseInt(el.dataset.id), sort_order: index }));
        try { await API.post('/api/restaurant/menu/reorder', { order }); }
        catch(e) { showToast('Reorder failed', true); loadMenu(); }
      }
    });
  }
}

// Menu Modals & Actions

// Traits Toggles logic
document.querySelectorAll('.trait-btn').forEach(btn => {
  btn.onclick = () => {
    btn.classList.toggle('active');
    btn.classList.toggle('btn-primary');
    btn.classList.toggle('btn-outline');
    syncTraits();
  };
});

function syncTraits() {
  const activeTags = Array.from(document.querySelectorAll('.trait-btn.active')).map(b => b.dataset.val);
  document.getElementById('mi-tags').value = JSON.stringify(activeTags);
}

document.getElementById('btn-add-item').onclick = () => {
  document.getElementById('form-item').reset();
  document.getElementById('mi-id').value = '';
  document.querySelectorAll('.trait-btn').forEach(b => {
    b.classList.remove('active', 'btn-primary');
    b.classList.add('btn-outline');
  });
  document.getElementById('mi-tags').value = '[]';
  
  // Populate categories dropdown
  const catSelect = document.getElementById('mi-cat');
  catSelect.innerHTML = CATEGORIES.map(c => `<option value="${escapeHTML(c.name)}">${escapeHTML(c.name)}</option>`).join('');
  if (CATEGORIES.length === 0) {
    catSelect.innerHTML = `<option value="" disabled selected>Please add a Category first from the Categories tab</option>`;
  }

  document.getElementById('modal-title-item').textContent = 'Add Item';
  document.getElementById('modal-item').classList.add('open');
};

window.editItem = (id) => {
  const item = MENU.find(i => i.id === id);
  if(!item) return;
  document.getElementById('mi-id').value = item.id;
  document.getElementById('mi-name').value = item.name;
  document.getElementById('mi-price').value = item.price;
  
  // Populate categories dropdown and set selected
  const catSelect = document.getElementById('mi-cat');
  catSelect.innerHTML = CATEGORIES.map(c => `<option value="${escapeHTML(c.name)}">${escapeHTML(c.name)}</option>`).join('');
  if (!CATEGORIES.find(c => c.name === item.category)) {
      // If item's legacy category doesn't exist in the new master list, add it as a temporary option so it doesn't blank out
      catSelect.innerHTML += `<option value="${escapeHTML(item.category)}">${escapeHTML(item.category)} (Legacy)</option>`;
  }
  catSelect.value = item.category;

  document.getElementById('mi-desc').value = item.description || '';
  document.getElementById('mi-img').value = item.img || '';
  
  // Apply tags to toggle buttons
  let tags = [];
  try { tags = typeof item.tags === 'string' ? JSON.parse(item.tags) : item.tags; } catch(e) {}
  document.getElementById('mi-tags').value = JSON.stringify(tags || []);
  
  document.querySelectorAll('.trait-btn').forEach(b => {
    if (tags && tags.includes(b.dataset.val)) {
      b.classList.add('active', 'btn-primary');
      b.classList.remove('btn-outline');
    } else {
      b.classList.remove('active', 'btn-primary');
      b.classList.add('btn-outline');
    }
  });

  document.getElementById('mi-active').checked = item.active === 1;
  document.getElementById('mi-avail').checked = item.available === 1;
  document.getElementById('modal-title-item').textContent = 'Edit Item';
  document.getElementById('modal-item').classList.add('open');
};

window.saveItem = async () => {
  const id = document.getElementById('mi-id').value;
  const payload = {
    name: document.getElementById('mi-name').value,
    price: parseFloat(document.getElementById('mi-price').value),
    category: document.getElementById('mi-cat').value,
    diet: 'meat', // deprecated, leaving fallback for db constraint
    description: document.getElementById('mi-desc').value,
    img: document.getElementById('mi-img').value,
    tags: document.getElementById('mi-tags').value, // save stringified JSON array
    active: document.getElementById('mi-active').checked,
    available: document.getElementById('mi-avail').checked
  };
  try {
    if(id) await API.put('/api/restaurant/menu/' + id, payload);
    else await API.post('/api/restaurant/menu', payload);
    closeModal('item');
    showToast('Item saved ✓');
    loadMenu();
  } catch(e) { showToast('Failed to save', true); }
};

window.toggleStock = async (id, currentAvailable) => {
  try {
    await API.patch(`/api/restaurant/menu/${id}/availability`, { available: !currentAvailable });
    loadMenu();
  } catch(e) { showToast('Failed to toggle', true); }
};

window.deleteItem = async (id) => {
  const item = MENU.find(x => x.id === id);
  if(!item) return;
  if(!confirm(`Delete ${item.name}?`)) return;
  try {
    await API.del('/api/restaurant/menu/' + id);
    showToast('Deleted');
    loadMenu();
  } catch(e) { showToast('Delete failed', true); }
};


// ─── App Buttons ─────────────────────────────────────────────
async function loadButtons() {
  try {
    BUTTONS = await API.get('/api/restaurant/buttons');
    const list = document.getElementById('hb-list');
    list.innerHTML = BUTTONS.map((b, i) => `
      <div class="hb-item" data-id="${b.id}">
        <div class="hb-icon">${b.icon}</div>
        <div class="hb-label">${b.label}</div>
        <div class="hb-action">${b.action}</div>
        <div class="mi-actions">
          <button class="btn-icon" onclick="editHb(${b.id})">✏️</button>
          <button class="btn-icon danger" onclick="deleteHb(${b.id})">🗑️</button>
        </div>
      </div>
    `).join('');
    
    Sortable.create(list, {
      animation: 150,
      onEnd: async function() {
        // Not implementing reorder for buttons in Phase 1 MVP to save time
      }
    });
  } catch(e) {}
}

document.getElementById('btn-add-hb').onclick = () => {
  document.getElementById('mb-id').value = '';
  document.getElementById('mb-label').value = '';
  document.getElementById('mb-icon').value = '🍽️';
  document.getElementById('mb-action').value = 'browse';
  document.getElementById('modal-btn').classList.add('open');
};

window.editHb = (id) => {
  const b = BUTTONS.find(x => x.id === id);
  if(!b) return;
  document.getElementById('mb-id').value = b.id;
  document.getElementById('mb-label').value = b.label;
  document.getElementById('mb-icon').value = b.icon;
  document.getElementById('mb-action').value = b.action;
  document.getElementById('mb-active').checked = b.active === 1;
  document.getElementById('modal-btn').classList.add('open');
};

window.saveHb = async () => {
  const id = document.getElementById('mb-id').value;
  const payload = {
    label: document.getElementById('mb-label').value,
    icon: document.getElementById('mb-icon').value,
    action: document.getElementById('mb-action').value,
    active: document.getElementById('mb-active').checked
  };
  try {
    if(id) await API.put('/api/restaurant/buttons/' + id, payload);
    else await API.post('/api/restaurant/buttons', payload);
    closeModal('btn'); showToast('Saved ✓'); loadButtons();
  } catch(e) { showToast('Failed', true); }
};
window.deleteHb = async id => {
  if(!confirm('Delete button?')) return;
  try { await API.del('/api/restaurant/buttons/' + id); showToast('Deleted'); loadButtons(); }
  catch(e) { showToast('Failed', true); }
};

// ─── Branding ────────────────────────────────────────────────
async function loadBranding() {
  document.getElementById('b-name').value = RESTAURANT.name;
  document.getElementById('b-tag').value = RESTAURANT.tagline || '';
  document.getElementById('b-kicker').value = RESTAURANT.kicker || 'Fine Dining Experience';
  document.getElementById('b-curr').value = RESTAURANT.currency || '£';
  
  if (RESTAURANT.logo_image) {
    document.getElementById('logo-preview').innerHTML = `<img src="${RESTAURANT.logo_image}?t=${Date.now()}"/>`;
  } else {
    document.getElementById('logo-preview').innerHTML = RESTAURANT.logo_emoji || '🪔';
    document.getElementById('b-emoji').value = RESTAURANT.logo_emoji || '🪔';
  }

  // Colors
  const cols = ['primary', 'accent', 'accent2', 'bg'];
  cols.forEach(c => {
    const val = RESTAURANT[c + '_color'] || '#000000';
    document.getElementById('b-' + c).value = val;
    document.getElementById('cp-' + c).style.backgroundColor = val;
    document.getElementById('ch-' + c).textContent = val.toUpperCase();
  });
}

window.saveBranding = async () => {
  const payload = {
    name: document.getElementById('b-name').value,
    tagline: document.getElementById('b-tag').value,
    kicker: document.getElementById('b-kicker').value,
    currency: document.getElementById('b-curr').value,
    logo_emoji: document.getElementById('b-emoji').value,
    primary_color: document.getElementById('b-primary').value,
    accent_color: document.getElementById('b-accent').value,
    accent2_color: document.getElementById('b-accent2').value,
    bg_color: document.getElementById('b-bg').value,
  };
  try {
    await API.patch('/api/restaurant/branding', payload);
    showToast('Branding saved ✓');
    RESTAURANT = { ...RESTAURANT, ...payload };
    applyBrandingColors();
    document.getElementById('sb-name').textContent = payload.name;
    document.getElementById('sb-logo').textContent = payload.logo_emoji;
  } catch(e) { showToast('Save failed', true); }
};

// Color sync
['primary', 'accent', 'accent2', 'bg'].forEach(c => {
  const input = document.getElementById('b-' + c);
  input.addEventListener('input', e => {
    document.getElementById('cp-' + c).style.backgroundColor = e.target.value;
    document.getElementById('ch-' + c).textContent = e.target.value.toUpperCase();
    document.documentElement.style.setProperty('--' + c, e.target.value);
  });
});

window.setEmoji = e => { document.getElementById('b-emoji').value = e; document.getElementById('logo-preview').innerHTML = e; };

// File upload
document.getElementById('logo-drop').onclick = () => document.getElementById('logo-input').click();
document.getElementById('logo-input').onchange = async e => {
  const file = e.target.files[0];
  if(!file) return;
  try {
    const data = await API.upload('/api/restaurant/logo', file);
    document.getElementById('logo-preview').innerHTML = `<img src="${data.logo_image}?t=${Date.now()}"/>`;
    RESTAURANT.logo_image = data.logo_image;
    showToast('Logo uploaded ✓');
  } catch(err) { showToast('Upload failed', true); }
};

function applyBrandingColors() {
  if(!RESTAURANT) return;
  const root = document.documentElement;
  if(RESTAURANT.primary_color) root.style.setProperty('--primary', RESTAURANT.primary_color);
  if(RESTAURANT.accent_color) root.style.setProperty('--accent', RESTAURANT.accent_color);
  if(RESTAURANT.accent2_color) root.style.setProperty('--accent2', RESTAURANT.accent2_color);
  if(RESTAURANT.bg_color) root.style.setProperty('--bg', RESTAURANT.bg_color);
  if(RESTAURANT.logo_emoji && !RESTAURANT.logo_image) document.getElementById('sb-logo').textContent = RESTAURANT.logo_emoji;
}

// ─── Passwords ────────────────────────────────────────────────
const btnChangePass = document.getElementById('btn-change-pass');
if (btnChangePass) {
  btnChangePass.onclick = async () => {
    const c = document.getElementById('current-pass').value;
    const n = document.getElementById('new-pass').value;
    const cn = document.getElementById('confirm-pass').value;
    if(!c || !n) return showToast('Fill all fields', true);
    if(n !== cn) return showToast("Passwords don't match", true);
    try {
      await API.post('/api/auth/change-password', { currentPassword: c, newPassword: n });
      showToast('Password changed ✓');
      ['current-pass','new-pass','confirm-pass'].forEach(id => document.getElementById(id).value = '');
    } catch(e) { showToast(e.message, true); }
  };
}

// ─── Helpers ──────────────────────────────────────────────────
window.closeModal = id => document.getElementById('modal-' + id).classList.remove('open');
let tt;
window.showToast = function(msg, isErr) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = 'toast show' + (isErr ? ' error' : '');
  clearTimeout(tt); tt = setTimeout(() => el.className = 'toast', 2500);
};

// Begin
init();
