/* ══════════════════════════════════════════════════════════════
   MULTI-RESTAURANT SAAS — Express Server
   ══════════════════════════════════════════════════════════════ */
require('dotenv').config();
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
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const app = express();

// Trust reverse proxy (essential for proper IP tracking and rate limiting on hosts like Render/Heroku)
app.set('trust proxy', 1);

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'restaurant-saas-secret-' + Date.now();
const BASE_URL = process.env.RENDER_EXTERNAL_URL || process.env.BASE_URL || `http://localhost:${PORT}`;

// ─── SMTP Configuration (Gmail) ─────────────────────────────
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587');
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'rhitwiksingh16@gmail.com';

let mailTransporter = null;
if (SMTP_USER && SMTP_PASS) {
  const mailConfig = {
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 6000,
    greetingTimeout: 6000,
    socketTimeout: 6000,
    tls: {
      rejectUnauthorized: false
    }
  };

  if (SMTP_HOST.includes('gmail')) {
    mailConfig.service = 'gmail';
  }

  mailTransporter = nodemailer.createTransport(mailConfig);
  
  mailTransporter.verify().then(() => {
    console.log('✦ Email transporter configured and verified for 2FA');
  }).catch(err => {
    console.warn('⚠ Email transporter verification failed:', err.message);
  });
} else {
  console.warn('⚠ SMTP credentials not set — 2FA codes will be printed to console only');
}

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
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, Date.now() + '-' + crypto.randomUUID() + ext);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    if (file.mimetype.startsWith('image/') && safeExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid image file type'));
    }
  }
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

// ─── Ensure email column exists on super_admins ─────────────
try { db.exec('ALTER TABLE super_admins ADD COLUMN email TEXT DEFAULT ""'); } catch (e) { /* column already exists */ }

// ─── Generate strong, unpredictable super admin credentials ──
function generateStrongPassword(length = 14) {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '#$@!%&*?';
  const all = upper + lower + digits + symbols;
  // Guarantee at least one of each class
  let pw = '';
  pw += upper[crypto.randomInt(upper.length)];
  pw += lower[crypto.randomInt(lower.length)];
  pw += digits[crypto.randomInt(digits.length)];
  pw += symbols[crypto.randomInt(symbols.length)];
  for (let i = pw.length; i < length; i++) pw += all[crypto.randomInt(all.length)];
  // Shuffle
  return pw.split('').sort(() => crypto.randomInt(3) - 1).join('');
}

function generateUsername() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let u = 'sa_';
  for (let i = 0; i < 8; i++) u += chars[crypto.randomInt(chars.length)];
  return u;
}

const existingAdmin = db.prepare('SELECT id FROM super_admins LIMIT 1').get();
if (!existingAdmin) {
  const SUPER_USER = generateUsername();
  const SUPER_PASS = generateStrongPassword(14);
  const hashed = bcrypt.hashSync(SUPER_PASS, 12);
  db.prepare('INSERT INTO super_admins (username, password, email) VALUES (?, ?, ?)').run(SUPER_USER, hashed, ADMIN_EMAIL);
  console.log('\n  ╔══════════════════════════════════════════════════════════╗');
  console.log('  ║   🔐  SUPER ADMIN CREDENTIALS (SAVE THESE NOW!)        ║');
  console.log('  ╠══════════════════════════════════════════════════════════╣');
  console.log(`  ║   Username: ${SUPER_USER.padEnd(42)}║`);
  console.log(`  ║   Password: ${SUPER_PASS.padEnd(42)}║`);
  console.log(`  ║   2FA Email: ${ADMIN_EMAIL.padEnd(41)}║`);
  console.log('  ╚══════════════════════════════════════════════════════════╝\n');
} else {
  // Ensure email is set on existing admin
  const admin = db.prepare('SELECT id, email, username FROM super_admins LIMIT 1').get();
  if (!admin.email) {
    db.prepare('UPDATE super_admins SET email = ? WHERE id = ?').run(ADMIN_EMAIL, admin.id);
  }
  console.log(`✦ Super admin loaded: ${admin.username}`);
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
// 2FA EMAIL HELPER
// ═══════════════════════════════════════════════════════════

function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

async function sendOTPEmail(email, code) {
  if (!mailTransporter) {
    console.log(`[2FA] Code: ${code}`);
    return true;
  }
  try {
    await mailTransporter.sendMail({
      from: `"Restaurant SaaS" <${SMTP_USER}>`,
      to: email,
      subject: '🔐 Your Login Verification Code',
      html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:480px;margin:0 auto;background:#0c0a08;border-radius:16px;overflow:hidden;border:1px solid #2a2520">
          <div style="background:linear-gradient(135deg,#D4963A,#B05A2F);padding:32px 24px;text-align:center">
            <div style="font-size:36px;margin-bottom:8px">⚡</div>
            <h1 style="color:#fff;margin:0;font-size:22px;font-weight:600">Restaurant SaaS</h1>
            <p style="color:rgba(255,255,255,0.8);margin:4px 0 0;font-size:14px">Platform Admin Verification</p>
          </div>
          <div style="padding:32px 24px;text-align:center">
            <p style="color:#a89880;font-size:15px;margin:0 0 24px">Enter this code to complete your sign-in:</p>
            <div style="background:#1a1612;border:2px solid #D4963A;border-radius:12px;padding:20px;display:inline-block;margin-bottom:24px">
              <span style="font-size:36px;font-weight:700;letter-spacing:12px;color:#E8C87A;font-family:'Courier New',monospace">${code}</span>
            </div>
            <p style="color:#6b5e50;font-size:13px;margin:0">This code expires in <strong style="color:#D4963A">5 minutes</strong></p>
            <p style="color:#4a3f35;font-size:12px;margin:16px 0 0">If you didn't request this, ignore this email.</p>
          </div>
        </div>
      `
    });
    return true;
  } catch (err) {
    console.error('Email send failed:', err.message);
    // Fallback: print to console
    console.log(`\n  ╔════════════════════════════════╗`);
    console.log(`  ║  🔑 2FA CODE: ${code}            ║`);
    console.log(`  ╚════════════════════════════════╝\n`);
    return true;
  }
}

// Cleanup expired 2FA codes periodically
setInterval(() => {
  try {
    db.prepare("DELETE FROM two_factor_codes WHERE expires_at < ?").run(Date.now());
  } catch (e) { /* ignore cleanup errors */ }
}, 60000);

// ─── Basic rate limiter for login ────────────────────────────
const loginAttempts = new Map();
function checkRateLimit(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record) {
    loginAttempts.set(ip, { count: 1, firstAttempt: now });
    return true;
  }
  // Reset window after 15 minutes
  if (now - record.firstAttempt > 15 * 60 * 1000) {
    loginAttempts.set(ip, { count: 1, firstAttempt: now });
    return true;
  }
  record.count++;
  if (record.count > 10) return false; // Max 10 attempts per 15min
  return true;
}
// Cleanup rate limit map periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of loginAttempts) {
    if (now - record.firstAttempt > 15 * 60 * 1000) loginAttempts.delete(ip);
  }
}, 60000);

// ═══════════════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════════════

// Super admin login — Step 1: Verify password, send OTP
app.post('/api/auth/super-login', async (req, res) => {
  const clientIp = req.ip || req.connection?.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ error: 'Too many login attempts. Please try again in 15 minutes.' });
  }

  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const admin = db.prepare('SELECT * FROM super_admins WHERE username = ?').get(username);
  if (!admin || !bcrypt.compareSync(password, admin.password))
    return res.status(401).json({ error: 'Invalid credentials' });

  // Generate OTP and session
  const code = generateOTP();
  const sessionId = uuid();
  const expiresAt = Date.now() + 5 * 60 * 1000; // epoch ms for reliable comparison

  // Hash the OTP code before storing
  const hashedCode = bcrypt.hashSync(code, 8);

  // Clean old codes for this admin
  db.prepare('DELETE FROM two_factor_codes WHERE admin_id = ?').run(admin.id);
  // Insert new code (hashed)
  db.prepare('INSERT INTO two_factor_codes (admin_id, session_id, code, expires_at) VALUES (?, ?, ?, ?)')
    .run(admin.id, sessionId, hashedCode, expiresAt);

  // Send email (with plaintext code)
  const email = admin.email || ADMIN_EMAIL;
  await sendOTPEmail(email, code);

  // Mask email for frontend display
  const maskedEmail = email.replace(/^(.{2})(.*)(@.*)$/, (m, a, b, c) => a + '*'.repeat(b.length) + c);

  res.json({ requires2FA: true, sessionId, email: maskedEmail });
});

// Super admin login — Step 2: Verify OTP code
app.post('/api/auth/super-login/verify-2fa', (req, res) => {
  const { sessionId, code } = req.body;
  if (!sessionId || !code) return res.status(400).json({ error: 'Session ID and code required' });

  const record = db.prepare('SELECT * FROM two_factor_codes WHERE session_id = ?').get(sessionId);
  if (!record) return res.status(401).json({ error: 'Invalid or expired session' });

  // Check expiry (epoch ms comparison — reliable)
  if (Number(record.expires_at) < Date.now()) {
    db.prepare('DELETE FROM two_factor_codes WHERE id = ?').run(record.id);
    return res.status(401).json({ error: 'Code expired. Please login again.' });
  }

  // Check used
  if (record.used) return res.status(401).json({ error: 'Code already used' });

  // Check attempts
  if (record.attempts >= 5) {
    db.prepare('DELETE FROM two_factor_codes WHERE id = ?').run(record.id);
    return res.status(429).json({ error: 'Too many attempts. Please login again.' });
  }

  // Validate code (compare against hashed OTP)
  const trimmedCode = code.trim();
  if (!bcrypt.compareSync(trimmedCode, record.code)) {
    db.prepare('UPDATE two_factor_codes SET attempts = attempts + 1 WHERE id = ?').run(record.id);
    const remaining = 5 - (record.attempts + 1);
    return res.status(401).json({ error: `Invalid code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.` });
  }

  // Mark as used and delete (one-time use)
  db.prepare('DELETE FROM two_factor_codes WHERE id = ?').run(record.id);

  // Get admin and issue token
  const admin = db.prepare('SELECT * FROM super_admins WHERE id = ?').get(record.admin_id);
  const token = signToken({ id: admin.id, role: 'super', username: admin.username });
  res.json({ token, username: admin.username });
});

// Resend 2FA code
app.post('/api/auth/super-login/resend-2fa', async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'Session ID required' });

  const record = db.prepare('SELECT * FROM two_factor_codes WHERE session_id = ?').get(sessionId);
  if (!record) return res.status(401).json({ error: 'Invalid session' });

  // Generate new code, reset attempts
  const code = generateOTP();
  const expiresAt = Date.now() + 5 * 60 * 1000; // epoch ms
  const hashedCode = bcrypt.hashSync(code, 8);
  db.prepare('UPDATE two_factor_codes SET code = ?, attempts = 0, used = 0, expires_at = ? WHERE id = ?')
    .run(hashedCode, expiresAt, record.id);

  const admin = db.prepare('SELECT email FROM super_admins WHERE id = ?').get(record.admin_id);
  await sendOTPEmail(admin.email || ADMIN_EMAIL, code);

  res.json({ success: true, message: 'New code sent' });
});

// Restaurant registration
app.post('/api/auth/register', (req, res) => {
  const clientIp = req.ip || req.connection?.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
  }

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
  const clientIp = req.ip || req.connection?.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ error: 'Too many login attempts. Please try again later.' });
  }

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
  } catch (e) {
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
  if (!newPassword || newPassword.length < 8)
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  const admin = db.prepare('SELECT * FROM super_admins WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(currentPassword, admin.password))
    return res.status(401).json({ error: 'Current password incorrect' });
  const hashed = bcrypt.hashSync(newPassword, 12);
  db.prepare('UPDATE super_admins SET password = ? WHERE id = ?').run(hashed, req.user.id);
  res.json({ success: true });
});

// Update 2FA email
app.post('/api/super/update-email', verifyToken, requireSuper, (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });
  db.prepare('UPDATE super_admins SET email = ? WHERE id = ?').run(email, req.user.id);
  res.json({ success: true });
});

// Get super admin profile info
app.get('/api/super/profile', verifyToken, requireSuper, (req, res) => {
  const admin = db.prepare('SELECT username, email FROM super_admins WHERE id = ?').get(req.user.id);
  const maskedEmail = admin.email ? admin.email.replace(/^(.{2})(.*)(@.*)$/, (m, a, b, c) => a + '*'.repeat(b.length) + c) : '';
  res.json({ username: admin.username, email: admin.email, maskedEmail });
});

// Change super admin username
app.post('/api/super/change-username', verifyToken, requireSuper, (req, res) => {
  const { newUsername, password } = req.body;
  if (!newUsername || newUsername.length < 4)
    return res.status(400).json({ error: 'Username must be at least 4 characters' });
  const admin = db.prepare('SELECT * FROM super_admins WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(password, admin.password))
    return res.status(401).json({ error: 'Password incorrect' });
  try {
    db.prepare('UPDATE super_admins SET username = ? WHERE id = ?').run(newUsername, req.user.id);
    const token = signToken({ id: admin.id, role: 'super', username: newUsername });
    res.json({ success: true, token, username: newUsername });
  } catch (e) {
    res.status(400).json({ error: 'Username already taken' });
  }
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
