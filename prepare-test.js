const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = new Database(path.join(__dirname, 'db', 'database.sqlite'));
const hashed = bcrypt.hashSync('SaasAdmin@123!', 12);
const admin = db.prepare('SELECT id FROM super_admins LIMIT 1').get();
db.prepare('UPDATE super_admins SET username = ?, password = ? WHERE id = ?').run('saasadmin', hashed, admin.id);
console.log('Credentials updated.');
