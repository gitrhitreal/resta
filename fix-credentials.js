/**
 * Emergency credential reset for Super Admin
 * Run this if you've lost your super admin credentials.
 * Usage: node fix-credentials.js
 * 
 * This will reset credentials to a new STRONG password and print them.
 * ⚠  Save the credentials immediately — they are NOT stored in plaintext.
 */
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');

const dbPath = path.join(__dirname, 'db', 'database.sqlite');
const db = new Database(dbPath);

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'rhitwiksingh16@gmail.com';

// Generate a strong random username
function generateUsername() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let u = 'sa_';
  for (let i = 0; i < 10; i++) u += chars[crypto.randomInt(chars.length)];
  return u;
}

// Generate a strong random password (16 chars, all classes)
function generateStrongPassword(length = 16) {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '#$@!%&*?^+~';
  const all = upper + lower + digits + symbols;
  // Guarantee at least one of each class
  let pw = '';
  pw += upper[crypto.randomInt(upper.length)];
  pw += lower[crypto.randomInt(lower.length)];
  pw += digits[crypto.randomInt(digits.length)];
  pw += symbols[crypto.randomInt(symbols.length)];
  for (let i = pw.length; i < length; i++) pw += all[crypto.randomInt(all.length)];
  // Shuffle using Fisher-Yates
  const arr = pw.split('');
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join('');
}

const NEW_USER = generateUsername();
const NEW_PASS = generateStrongPassword(16);

try {
  // Ensure email column exists
  try { db.exec('ALTER TABLE super_admins ADD COLUMN email TEXT DEFAULT ""'); } catch(e) {}

  const existing = db.prepare('SELECT id FROM super_admins LIMIT 1').get();
  const hashed = bcrypt.hashSync(NEW_PASS, 12);

  if (existing) {
    db.prepare('UPDATE super_admins SET username = ?, password = ?, email = ? WHERE id = ?')
      .run(NEW_USER, hashed, ADMIN_EMAIL, existing.id);
  } else {
    db.prepare('INSERT INTO super_admins (username, password, email) VALUES (?, ?, ?)')
      .run(NEW_USER, hashed, ADMIN_EMAIL);
  }

  console.log('\n  ╔══════════════════════════════════════════════════════════╗');
  console.log('  ║   🔐  SUPER ADMIN CREDENTIALS RESET                    ║');
  console.log('  ╠══════════════════════════════════════════════════════════╣');
  console.log(`  ║   Username: ${NEW_USER.padEnd(42)}║`);
  console.log(`  ║   Password: ${NEW_PASS.padEnd(42)}║`);
  console.log(`  ║   2FA Email: ${ADMIN_EMAIL.padEnd(41)}║`);
  console.log('  ╠══════════════════════════════════════════════════════════╣');
  console.log('  ║   ⚠  SAVE THESE NOW! Change after first login!         ║');
  console.log('  ║   ⚠  Password is 16 chars with mixed case + symbols    ║');
  console.log('  ╚══════════════════════════════════════════════════════════╝\n');

} catch (error) {
  console.log('Error: ' + error.message);
}
