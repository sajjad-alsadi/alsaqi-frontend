const { PGlite } = require('@electric-sql/pglite');
const path = require('path');

async function main() {
  const dataDir = path.resolve('/tmp', 'audit_db_persistent_v2');
  console.log('Connecting to:', dataDir);
  
  const client = new PGlite(dataDir);
  await client.waitReady;
  
  await client.query("UPDATE users SET status = 'active', failed_attempts = 0, locked_until = NULL WHERE username = 'admin'");
  
  const result = await client.query("SELECT username, status, failed_attempts FROM users WHERE username = 'admin'");
  console.log('Admin account:', result.rows[0]);
  
  await client.close();
  console.log('Done!');
}

main().catch(e => { console.error(e); process.exit(1); });
