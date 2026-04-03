const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const db = new Database('d:/wat/Restaurant/db/database.sqlite');
const superHashed = bcrypt.hashSync('admin123', 10);
const demoHashed = bcrypt.hashSync('demo123', 10);

try {
  db.prepare("UPDATE super_admins SET password = ? WHERE username = 'superadmin'").run(superHashed);
  console.log("Superadmin password restored to admin123");
  
  const existingDemo = db.prepare("SELECT id FROM restaurants WHERE username = 'demo'").get();
  if (existingDemo) {
    db.prepare("UPDATE restaurants SET password = ? WHERE username = 'demo'").run(demoHashed);
    console.log("Demo password restored to demo123, ID:", existingDemo.id);
  } else {
    const res = db.prepare(
      "INSERT INTO restaurants (slug, username, password, name, status) VALUES ('demo', 'demo', ?, 'The Demo Restaurant', 'active')"
    ).run(demoHashed);
    db.prepare("INSERT INTO homepage_buttons (restaurant_id, label, icon, action, sort_order) VALUES (?, 'Surprise Me', '🎲', 'surprise', 0)").run(res.lastInsertRowid);
    console.log("Created demo user with demo123");
  }
} catch (error) {
  console.log('Error: ' + error.message);
}
