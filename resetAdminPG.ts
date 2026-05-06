import { db } from './src/server/db/index.js';
import bcrypt from 'bcryptjs';

async function reset() {
  await db.client.waitReady;
  const hash = bcrypt.hashSync('admin', 12);
  await db.prepare(`UPDATE users SET password = $1, failed_attempts = 0, locked_until = NULL WHERE username = 'admin'`).run(hash);
  console.log("Admin password reset successfully.");
  process.exit(0);
}

reset().catch(console.error);
