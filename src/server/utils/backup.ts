import fs from 'fs';
import path from 'path';
import { db } from '../db/index';
import logger from './logger';

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(process.cwd(), 'backups');
const MAX_BACKUPS = parseInt(process.env.MAX_BACKUPS || '7', 10);

/**
 * Creates a logical backup of critical database tables.
 * For PostgreSQL production: use pg_dump externally.
 * For PGlite development: exports table data as JSON files.
 */
export async function createBackup(): Promise<string | null> {
  if (db.isExternal) {
    // For external PostgreSQL, log a reminder to use pg_dump
    logger.info('[BACKUP] External PostgreSQL detected. Use pg_dump for production backups.');
    return null;
  }

  try {
    // Ensure backup directory exists
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `backup_${timestamp}`);
    fs.mkdirSync(backupPath, { recursive: true });

    // Critical tables to backup
    const tables = [
      'users',
      'audit_programs',
      'audit_plans',
      'audit_tasks',
      'audit_findings',
      'recommendations',
      'risk_register',
      'incoming_correspondence',
      'outgoing_correspondence',
      'notifications',
    ];

    let backedUp = 0;
    for (const table of tables) {
      try {
        const rows = await db.prepare(`SELECT * FROM ${db.validateIdentifier(table)}`).all();
        const filePath = path.join(backupPath, `${table}.json`);
        fs.writeFileSync(filePath, JSON.stringify(rows, null, 2));
        backedUp++;
      } catch (err: any) {
        // Table might not exist yet
        if (!err.message?.includes('does not exist')) {
          logger.warn(`[BACKUP] Failed to backup table ${table}:`, err.message);
        }
      }
    }

    logger.info(`[BACKUP] Created backup at ${backupPath} (${backedUp} tables)`);

    // Cleanup old backups
    await cleanupOldBackups();

    return backupPath;
  } catch (err) {
    logger.error('[BACKUP] Backup failed:', err);
    return null;
  }
}

async function cleanupOldBackups(): Promise<void> {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return;

    const entries = fs.readdirSync(BACKUP_DIR)
      .filter(e => e.startsWith('backup_'))
      .sort()
      .reverse();

    // Keep only MAX_BACKUPS most recent
    for (let i = MAX_BACKUPS; i < entries.length; i++) {
      const dirPath = path.join(BACKUP_DIR, entries[i]);
      fs.rmSync(dirPath, { recursive: true, force: true });
      logger.info(`[BACKUP] Removed old backup: ${entries[i]}`);
    }
  } catch (err) {
    logger.warn('[BACKUP] Cleanup failed:', err);
  }
}

export default { createBackup };
