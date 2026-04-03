/* ══════════════════════════════════════════════════════════════
   MULTI-RESTAURANT SAAS — Express Server
   ══════════════════════════════════════════════════════════════ */
const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const { v4: uuid } = require('uuid');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'restaurant-saas-secret-' + Date.now();
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// ─── Middleware ──────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/qr', express.static(path.join(__dirname, 'qr')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Multer for image uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(__dirname, 'uploads');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/'))
});

// ─── Database ───────────────────────────────────────────────
const dbPath = path.join(__dirname, 'db', 'database.sqlite');
if (!fs.existsSync(path.dirname(dbPath))) fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Init schema
const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
db.exec(schema);

// Create default super admin (you)
const SUPER_USER = 'superadmin';
const SUPER_PASS = 'admin123';
const existing = db.prepare('SELECT id FROM super_admins WHERE username = ?').get(SUPER_USER);
if (!existing) {
  const hashed = bcrypt.hashSync(SUPER_PASS, 10);
  db.prepare('INSERT INTO super_admins (username, password) VALUES (?, ?)').run(SUPER_USER, hashed);
  console.log(`✦ Super admin created: ${SUPER_USER} / ${SUPER_PASS}`);
}

// Ensure QR directory
if (!fs.existsSync(path.join(__dirname, 'qr'))) fs.mkdirSync(path.join(__dirname, 'qr'));

// ─── Auth Helpers ───────────────────────────────────────────
function signToken(payload, expiresIn = '24h') {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { return res.status(401).json({ error: 'Invalid token' }); }
}

function requireSuper(req, res, next) {
  if (req.user?.role !== 'super') return res.status(403).json({ error: 'Super admin only' });
  next();
}

function requireRestaurant(req, res, next) {
  if (req.user?.role !== 'restaurant') return res.status(403).json({ error: 'Restaurant admin only' });
  next();
}

// ═══════════════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════════════

// Super admin login
app.post('/api/auth/super-login', (req, res) => {
  const { username, password } = req.body;
  const admin = db.prepare('SELECT * FROM super_admins WHERE username = ?').get(username);
  if (!admin || !bcrypt.compareSync(password, admin.password))
    return res.status(401).json({ error: 'Invalid credentials' });
  const token = signToken({ id: admin.id, role: 'super', username });
  res.json({ token, username });
});

// Restaurant registration
app.post('/api/auth/register', (req, res) => {
  const { username, password, name } = req.body;
  if (!username || !password || !name)
    return res.status(400).json({ error: 'Username, password and restaurant name required' });
  if (username.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters' });
  if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });

  // Check unique username
  const exists = db.prepare('SELECT id FROM restaurants WHERE username = ?').get(username);
  if (exists) return res.status(409).json({ error: 'Username already taken' });

  const slug = username.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const hashed = bcrypt.hashSync(password, 10);

  try {
    const result = db.prepare(
      'INSERT INTO restaurants (slug, username, password, name) VALUES (?, ?, ?, ?)'
    ).run(slug, username, hashed, name);
    const restaurantId = result.lastInsertRowid;

    // Create default homepage buttons
    const insertBtn = db.prepare(
      'INSERT INTO homepage_buttons (restaurant_id, label, icon, action, sort_order) VALUES (?, ?, ?, ?, ?)'
    );
    insertBtn.run(restaurantId, 'Surprise Me', '🎲', 'surprise', 0);
    insertBtn.run(restaurantId, 'Help Me Choose', '✦', 'quiz', 1);
    insertBtn.run(restaurantId, 'Browse Menu', '📖', 'browse', 2);

    const token = signToken({ id: Number(restaurantId), role: 'restaurant', username, slug });
    res.json({ token, restaurant: { id: Number(restaurantId), slug, name, username } });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Restaurant login
app.post('/api/auth/restaurant-login', (req, res) => {
  const { username, password } = req.body;
  const rest = db.prepare('SELECT * FROM restaurants WHERE username = ?').get(username);
  if (!rest || !bcrypt.compareSync(password, rest.password))
    return res.status(401).json({ error: 'Invalid credentials' });
  if (rest.status !== 'active')
    return res.status(403).json({ error: 'Account suspended. Contact platform admin.' });
  const token = signToken({ id: rest.id, role: 'restaurant', username, slug: rest.slug });
  res.json({ token, restaurant: { id: rest.id, slug: rest.slug, name: rest.name, username: rest.username } });
});



// ═══════════════════════════════════════════════════════════
// SUPER ADMIN ROUTES
// ═══════════════════════════════════════════════════════════

// List all restaurants
app.get('/api/super/restaurants', verifyToken, requireSuper, (req, res) => {
  const restaurants = db.prepare(`
    SELECT r.*, 
      (SELECT COUNT(*) FROM menu_items WHERE restaurant_id = r.id) as item_count
    FROM restaurants r ORDER BY r.created_at DESC
  `).all();
  res.json(restaurants);
});

// Suspend / activate restaurant
app.patch('/api/super/restaurants/:id/status', verifyToken, requireSuper, (req, res) => {
  const { status } = req.body;
  if (!['active', 'suspended'].includes(status))
    return res.status(400).json({ error: 'Invalid status' });
  db.prepare('UPDATE restaurants SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ success: true });
});

// Edit restaurant details / password
app.patch('/api/super/restaurants/:id', verifyToken, requireSuper, async (req, res) => {
  const { name, username, password, address, contact_info } = req.body;
  try {
    if (password) {
      const hashed = bcrypt.hashSync(password, 10);
      db.prepare('UPDATE restaurants SET name=?, username=?, password=?, address=?, contact_info=? WHERE id=?')
        .run(name, username, hashed, address || '', contact_info || '', req.params.id);
    } else {
      db.prepare('UPDATE restaurants SET name=?, username=?, address=?, contact_info=? WHERE id=?')
        .run(name, username, address || '', contact_info || '', req.params.id);
    }
    res.json({ success: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'That login username is already taken!' });
    }
    res.status(500).json({ error: 'Database update failed' });
  }
});

// Mint new restaurant
app.post('/api/super/restaurants', verifyToken, requireSuper, async (req, res) => {
  const { name, username, password, address, contact_info } = req.body;
  if (!name || !username || !password) return res.status(400).json({ error: 'Name, username, password required' });
  
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const hashed = bcrypt.hashSync(password, 10);
  
  try {
    db.prepare('INSERT INTO restaurants (slug, username, password, name, address, contact_info) VALUES (?, ?, ?, ?, ?, ?)')
      .run(slug, username, hashed, name, address || '', contact_info || '');
    res.json({ success: true });
  } catch(e) {
    if (e.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Username or basic slug already exists. Try a different name/login ID' });
    }
    return res.status(500).json({ error: 'Database error' });
  }
});

// Delete restaurant
app.delete('/api/super/restaurants/:id', verifyToken, requireSuper, (req, res) => {
  db.prepare('DELETE FROM restaurants WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Super admin stats
app.get('/api/super/stats', verifyToken, requireSuper, (req, res) => {
  const totalRestaurants = db.prepare('SELECT COUNT(*) as c FROM restaurants').get().c;
  const activeRestaurants = db.prepare("SELECT COUNT(*) as c FROM restaurants WHERE status = 'active'").get().c;
  const totalItems = db.prepare('SELECT COUNT(*) as c FROM menu_items').get().c;
  res.json({ totalRestaurants, activeRestaurants, totalItems });
});

// Regenerate universal QR
app.post('/api/super/restaurants/:id/regenerate-qr', verifyToken, requireSuper, async (req, res) => {
  const rest = db.prepare('SELECT slug FROM restaurants WHERE id = ?').get(req.params.id);
  if (!rest) return res.status(404).json({ error: 'Restaurant not found' });
  const url = `${BASE_URL}/r/${rest.slug}`;
  const qrPath = path.join(__dirname, 'qr', `${rest.slug}.png`);
  await QRCode.toFile(qrPath, url, { width: 512, margin: 2 });
  res.json({ success: true, qr_url: `/qr/${rest.slug}.png` });
});

// Change super admin password
app.post('/api/super/change-password', verifyToken, requireSuper, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const admin = db.prepare('SELECT * FROM super_admins WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(currentPassword, admin.password))
    return res.status(401).json({ error: 'Current password incorrect' });
  const hashed = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE super_admins SET password = ? WHERE id = ?').run(hashed, req.user.id);
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════
// RESTAURANT ADMIN ROUTES
// ═══════════════════════════════════════════════════════════

// Get my restaurant
app.get('/api/restaurant', verifyToken, requireRestaurant, (req, res) => {
  const rest = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(req.user.id);
  if (!rest) return res.status(404).json({ error: 'Not found' });
  delete rest.password;
  res.json(rest);
});

// Update branding
app.patch('/api/restaurant/branding', verifyToken, requireRestaurant, (req, res) => {
  const { name, tagline, kicker, currency, logo_emoji, logo_image, primary_color, accent_color, accent2_color, bg_color } = req.body;
  db.prepare(`UPDATE restaurants SET 
    name = COALESCE(?, name), tagline = COALESCE(?, tagline), kicker = COALESCE(?, kicker),
    currency = COALESCE(?, currency), logo_emoji = COALESCE(?, logo_emoji), logo_image = COALESCE(?, logo_image),
    primary_color = COALESCE(?, primary_color), accent_color = COALESCE(?, accent_color),
    accent2_color = COALESCE(?, accent2_color), bg_color = COALESCE(?, bg_color)
    WHERE id = ?`
  ).run(name, tagline, kicker, currency, logo_emoji, logo_image, primary_color, accent_color, accent2_color, bg_color, req.user.id);
  res.json({ success: true });
});

// Upload logo
app.post('/api/restaurant/logo', verifyToken, requireRestaurant, upload.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const logoUrl = `/uploads/${req.file.filename}`;
  db.prepare('UPDATE restaurants SET logo_image = ? WHERE id = ?').run(logoUrl, req.user.id);
  res.json({ logo_image: logoUrl });
});

// ─── Categories ──────────────────────────────────────────────

app.get('/api/restaurant/categories', verifyToken, requireRestaurant, (req, res) => {
  const cats = db.prepare('SELECT * FROM categories WHERE restaurant_id = ? ORDER BY sort_order, id').all(req.user.id);
  res.json(cats);
});

app.post('/api/restaurant/categories', verifyToken, requireRestaurant, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const maxSort = db.prepare('SELECT MAX(sort_order) as m FROM categories WHERE restaurant_id = ?').get(req.user.id)?.m || 0;
  const result = db.prepare('INSERT INTO categories (restaurant_id, name, sort_order) VALUES (?, ?, ?)')
    .run(req.user.id, name, maxSort + 1);
  res.json({ id: Number(result.lastInsertRowid), success: true });
});

app.put('/api/restaurant/categories/:id', verifyToken, requireRestaurant, (req, res) => {
  const { name } = req.body;
  db.prepare('UPDATE categories SET name=? WHERE id=? AND restaurant_id=?').run(name, req.params.id, req.user.id);
  res.json({ success: true });
});

app.delete('/api/restaurant/categories/:id', verifyToken, requireRestaurant, (req, res) => {
  db.prepare('DELETE FROM categories WHERE id=? AND restaurant_id=?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

app.post('/api/restaurant/categories/reorder', verifyToken, requireRestaurant, (req, res) => {
  const { order } = req.body;
  const stmt = db.prepare('UPDATE categories SET sort_order=? WHERE id=? AND restaurant_id=?');
  db.transaction(() => order.forEach(({ id, sort_order }) => stmt.run(sort_order, id, req.user.id)))();
  res.json({ success: true });
});

// ─── Menu Items ─────────────────────────────────────────────

app.get('/api/restaurant/menu', verifyToken, requireRestaurant, (req, res) => {
  const items = db.prepare('SELECT * FROM menu_items WHERE restaurant_id = ? ORDER BY sort_order, id').all(req.user.id);
  items.forEach(i => { try { i.tags = JSON.parse(i.tags); } catch { i.tags = []; } });
  res.json(items);
});

app.post('/api/restaurant/menu', verifyToken, requireRestaurant, (req, res) => {
  const { name, description, price, category, diet, img, tags, active, available } = req.body;
  if (!name || price == null) return res.status(400).json({ error: 'Name and price required' });
  const maxSort = db.prepare('SELECT MAX(sort_order) as m FROM menu_items WHERE restaurant_id = ?').get(req.user.id)?.m || 0;
  const result = db.prepare(
    'INSERT INTO menu_items (restaurant_id, name, description, price, category, diet, img, tags, sort_order, active, available) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(req.user.id, name, description || '', price, category || 'main', diet || 'meat', img || '🍽️', JSON.stringify(tags || []), maxSort + 1, active !== false ? 1 : 0, available !== false ? 1 : 0);
  res.json({ id: Number(result.lastInsertRowid), success: true });
});

app.put('/api/restaurant/menu/:id', verifyToken, requireRestaurant, (req, res) => {
  const { name, description, price, category, diet, img, tags, active, available } = req.body;
  const item = db.prepare('SELECT * FROM menu_items WHERE id = ? AND restaurant_id = ?').get(req.params.id, req.user.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  db.prepare(`UPDATE menu_items SET name=?, description=?, price=?, category=?, diet=?, img=?, tags=?, active=?, available=? WHERE id=?`)
    .run(name, description || '', price, category || 'main', diet || 'meat', img || '🍽️', JSON.stringify(tags || []), active !== false ? 1 : 0, available !== false ? 1 : 0, req.params.id);
  res.json({ success: true });
});

app.delete('/api/restaurant/menu/:id', verifyToken, requireRestaurant, (req, res) => {
  db.prepare('DELETE FROM menu_items WHERE id = ? AND restaurant_id = ?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

// Toggle availability
app.patch('/api/restaurant/menu/:id/availability', verifyToken, requireRestaurant, (req, res) => {
  const { available } = req.body;
  db.prepare('UPDATE menu_items SET available = ? WHERE id = ? AND restaurant_id = ?').run(available ? 1 : 0, req.params.id, req.user.id);
  res.json({ success: true });
});

// Toggle active/visible
app.patch('/api/restaurant/menu/:id/active', verifyToken, requireRestaurant, (req, res) => {
  const { active } = req.body;
  db.prepare('UPDATE menu_items SET active = ? WHERE id = ? AND restaurant_id = ?').run(active ? 1 : 0, req.params.id, req.user.id);
  res.json({ success: true });
});

// Reorder
app.post('/api/restaurant/menu/reorder', verifyToken, requireRestaurant, (req, res) => {
  const { order } = req.body; // array of { id, sort_order }
  const stmt = db.prepare('UPDATE menu_items SET sort_order = ? WHERE id = ? AND restaurant_id = ?');
  const tx = db.transaction(() => {
    order.forEach(({ id, sort_order }) => stmt.run(sort_order, id, req.user.id));
  });
  tx();
  res.json({ success: true });
});

// ─── Universal QR ────────────────────────────────────────────

app.get('/api/restaurant/qr', verifyToken, requireRestaurant, async (req, res) => {
  const url = `${BASE_URL}/r/${req.user.slug}`;
  try {
    const qrDataUrl = await QRCode.toDataURL(url, { width: 512, margin: 2 });
    res.json({ qr_url: qrDataUrl, url });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR' });
  }
});


// ─── Homepage Buttons ───────────────────────────────────────

app.get('/api/restaurant/buttons', verifyToken, requireRestaurant, (req, res) => {
  const buttons = db.prepare('SELECT * FROM homepage_buttons WHERE restaurant_id = ? ORDER BY sort_order').all(req.user.id);
  res.json(buttons);
});

app.post('/api/restaurant/buttons', verifyToken, requireRestaurant, (req, res) => {
  const { label, icon, action } = req.body;
  if (!label || !action) return res.status(400).json({ error: 'Label and action required' });
  const maxSort = db.prepare('SELECT MAX(sort_order) as m FROM homepage_buttons WHERE restaurant_id = ?').get(req.user.id)?.m || 0;
  const result = db.prepare('INSERT INTO homepage_buttons (restaurant_id, label, icon, action, sort_order) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, label, icon || '🍽️', action, maxSort + 1);
  res.json({ id: Number(result.lastInsertRowid), success: true });
});

app.put('/api/restaurant/buttons/:id', verifyToken, requireRestaurant, (req, res) => {
  const { label, icon, action, active } = req.body;
  db.prepare('UPDATE homepage_buttons SET label=?, icon=?, action=?, active=? WHERE id=? AND restaurant_id=?')
    .run(label, icon, action, active !== false ? 1 : 0, req.params.id, req.user.id);
  res.json({ success: true });
});

app.delete('/api/restaurant/buttons/:id', verifyToken, requireRestaurant, (req, res) => {
  db.prepare('DELETE FROM homepage_buttons WHERE id = ? AND restaurant_id = ?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

// Restaurant stats
app.get('/api/restaurant/stats', verifyToken, requireRestaurant, (req, res) => {
  const totalItems = db.prepare('SELECT COUNT(*) as c FROM menu_items WHERE restaurant_id = ?').get(req.user.id).c;
  const activeItems = db.prepare('SELECT COUNT(*) as c FROM menu_items WHERE restaurant_id = ? AND active = 1').get(req.user.id).c;
  const availableItems = db.prepare('SELECT COUNT(*) as c FROM menu_items WHERE restaurant_id = ? AND available = 1 AND active = 1').get(req.user.id).c;
  const cats = {};
  db.prepare('SELECT category, COUNT(*) as c FROM menu_items WHERE restaurant_id = ? GROUP BY category').all(req.user.id)
    .forEach(r => { cats[r.category] = r.c; });
  res.json({ totalItems, activeItems, availableItems, categories: cats });
});

// ═══════════════════════════════════════════════════════════
// PUBLIC / CUSTOMER ROUTES (no auth needed)
// ═══════════════════════════════════════════════════════════

// Get all public restaurants for directory
app.get('/api/public/restaurants', (req, res) => {
  const rests = db.prepare('SELECT id, slug, name, tagline, logo_emoji, logo_image, primary_color, accent_color, bg_color FROM restaurants WHERE status = ?').all('active');
  res.json(rests);
});
// Get restaurant data by slug (customer-facing)
app.get('/api/public/restaurant/:slug', (req, res) => {
  const rest = db.prepare('SELECT * FROM restaurants WHERE slug = ? AND status = ?').get(req.params.slug, 'active');
  if (!rest) return res.status(404).json({ error: 'Restaurant not found' });
  delete rest.password;
  delete rest.username;
  res.json(rest);
});

// Get menu for a restaurant (customer sees available + active only)
app.get('/api/public/restaurant/:slug/menu', (req, res) => {
  const rest = db.prepare('SELECT id FROM restaurants WHERE slug = ?').get(req.params.slug);
  if (!rest) return res.status(404).json({ error: 'Restaurant not found' });
  const items = db.prepare('SELECT * FROM menu_items WHERE restaurant_id = ? AND active = 1 AND available = 1 ORDER BY sort_order, id').all(rest.id);
  items.forEach(i => { try { i.tags = JSON.parse(i.tags); } catch { i.tags = []; } });
  
  const categories = db.prepare('SELECT name FROM categories WHERE restaurant_id = ? ORDER BY sort_order').all(rest.id).map(c => c.name);
  res.json({ items, categories });
});

// Get homepage buttons for customer
app.get('/api/public/restaurant/:slug/buttons', (req, res) => {
  const rest = db.prepare('SELECT id FROM restaurants WHERE slug = ?').get(req.params.slug);
  if (!rest) return res.status(404).json({ error: 'Restaurant not found' });
  const buttons = db.prepare('SELECT * FROM homepage_buttons WHERE restaurant_id = ? AND active = 1 ORDER BY sort_order').all(rest.id);
  res.json(buttons);
});

// Get quiz (handled locally in customer app now)
app.get('/api/public/restaurant/:slug/quiz', (req, res) => {
  res.json([{ local: true }]); 
});


// ─── Customer page route ────────────────────────────────────
app.get('/r/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'customer.html'));
});

// ─── Start ──────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  ✦ Restaurant SaaS running at ${BASE_URL}`);
  console.log(`  ✦ Super Admin: /super-admin.html`);
  console.log(`  ✦ Restaurant Admin: /admin.html`);
  console.log(`  ✦ Customer: /r/:restaurant-slug?table=N&tk=TOKEN\n`);
});
