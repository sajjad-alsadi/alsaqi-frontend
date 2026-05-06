import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

const db = new Database('./src/server/db/database.sqlite');
const hash = bcrypt.hashSync('admin', 12);
db.prepare("UPDATE users SET password = ? WHERE username = 'admin'").run(hash);
console.log('Password reset to admin');
db.prepare("UPDATE users SET locked_until = NULL, failed_attempts = 0 WHERE username = 'admin'").run();
console.log('Admin unlocked');
