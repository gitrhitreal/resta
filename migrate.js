const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'db', 'database.sqlite'));

try {
  db.exec("ALTER TABLE restaurants ADD COLUMN address TEXT DEFAULT ''");
  console.log("Added address column");
} catch(e) { console.log("Address column might exist:", e.message); }

try {
  db.exec("ALTER TABLE restaurants ADD COLUMN contact_info TEXT DEFAULT ''");
  console.log("Added contact_info column");
} catch(e) { console.log("Contact column might exist:", e.message); }

console.log("Migration complete");
