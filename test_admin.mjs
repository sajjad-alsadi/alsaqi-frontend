import { db, initDb } from './src/server/db/index.js';
import { runMigrations } from './src/server/db/migrations.js';

async function verifyAdmin() {
  await initDb();
  await db.client.waitReady;
  await runMigrations();
  const admin = await db.prepare("SELECT * FROM users WHERE username = 'admin'").get();
  console.log("Admin user:", admin);
  process.exit(0);
}
verifyAdmin();
