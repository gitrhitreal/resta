-- ══════════════════════════════════════════════
-- MULTI-RESTAURANT SAAS — DATABASE SCHEMA
-- ══════════════════════════════════════════════

-- Super admin (you — platform owner)
CREATE TABLE IF NOT EXISTS super_admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  email TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Two-factor authentication codes
CREATE TABLE IF NOT EXISTS two_factor_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER NOT NULL,
  session_id TEXT UNIQUE NOT NULL,
  code TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  used INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  FOREIGN KEY (admin_id) REFERENCES super_admins(id) ON DELETE CASCADE
);

-- Restaurants (tenants)
CREATE TABLE IF NOT EXISTS restaurants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  tagline TEXT DEFAULT '',
  kicker TEXT DEFAULT 'Fine Dining Experience',
  currency TEXT DEFAULT '₹',
  logo_emoji TEXT DEFAULT '🪔',
  logo_image TEXT DEFAULT '',
  address TEXT DEFAULT '',
  contact_info TEXT DEFAULT '',
  primary_color TEXT DEFAULT '#D4963A',
  accent_color TEXT DEFAULT '#E8C87A',
  accent2_color TEXT DEFAULT '#B05A2F',
  bg_color TEXT DEFAULT '#0C0A08',
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Custom Categories
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
);

-- Menu items
CREATE TABLE IF NOT EXISTS menu_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  price REAL NOT NULL,
  category TEXT NOT NULL DEFAULT 'main',
  diet TEXT DEFAULT 'meat',
  img TEXT DEFAULT '🍽️',
  tags TEXT DEFAULT '[]',
  sort_order INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  available INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
);

-- Homepage buttons (configurable per restaurant)
CREATE TABLE IF NOT EXISTS homepage_buttons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  icon TEXT DEFAULT '🍽️',
  action TEXT NOT NULL DEFAULT 'browse',
  sort_order INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
);
