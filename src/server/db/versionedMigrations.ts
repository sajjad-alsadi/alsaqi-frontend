import { Migration } from './migrationRunner';

/**
 * Registry of all versioned migrations.
 * 
 * Each migration has a unique version string (zero-padded for correct ordering),
 * a human-readable name, a type ('schema' for DDL or 'seed' for data), and an
 * `up` function that performs the migration.
 * 
 * The base schema (all CREATE TABLE IF NOT EXISTS statements) is handled by
 * `runMigrations()` in migrations.ts. This registry is for incremental changes
 * that should only run once and be tracked in the schema_migrations table.
 * 
 * To add a new migration:
 * 1. Add a new entry with the next sequential version number
 * 2. Provide a descriptive name
 * 3. Implement the `up` function with the migration logic
 */

// Import db for use in migration up() functions
import { db } from './index';

export const versionedMigrations: Migration[] = [
  {
    version: '001',
    name: 'Unify Administrator role to Admin',
    type: 'seed',
    up: async () => {
      await db.exec("UPDATE users SET role = 'Admin' WHERE role = 'Administrator'");
    },
  },

  {
    version: '002',
    name: 'Add API audit tables and soft delete columns',
    type: 'schema',
    up: async () => {
      // 1. Create idempotency_keys table (Requirement 13.3)
      await db.exec(`
        CREATE TABLE IF NOT EXISTS idempotency_keys (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          idempotency_key TEXT NOT NULL,
          user_id UUID NOT NULL,
          method TEXT NOT NULL,
          path TEXT NOT NULL,
          response_status INTEGER NOT NULL,
          response_body TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          expires_at TIMESTAMPTZ NOT NULL,
          UNIQUE(idempotency_key, user_id)
        )
      `);
      await db.exec(`CREATE INDEX IF NOT EXISTS idx_idempotency_keys_key_user ON idempotency_keys(idempotency_key, user_id)`);
      await db.exec(`CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires_at ON idempotency_keys(expires_at)`);

      // 2. Create request_logs table (Requirement 11.4)
      await db.exec(`
        CREATE TABLE IF NOT EXISTS request_logs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          request_id TEXT NOT NULL,
          user_id UUID,
          method TEXT NOT NULL,
          path TEXT NOT NULL,
          status_code INTEGER NOT NULL,
          duration_ms INTEGER NOT NULL,
          ip_address TEXT,
          user_agent TEXT,
          error_message TEXT,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await db.exec(`CREATE INDEX IF NOT EXISTS idx_request_logs_request_id ON request_logs(request_id)`);
      await db.exec(`CREATE INDEX IF NOT EXISTS idx_request_logs_user_id ON request_logs(user_id)`);
      await db.exec(`CREATE INDEX IF NOT EXISTS idx_request_logs_created_at ON request_logs(created_at)`);
      await db.exec(`CREATE INDEX IF NOT EXISTS idx_request_logs_status_code ON request_logs(status_code)`);

      // 3. Create file_access_logs table (Requirement 12.4)
      await db.exec(`
        CREATE TABLE IF NOT EXISTS file_access_logs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id TEXT NOT NULL,
          file_path TEXT NOT NULL,
          access_type TEXT NOT NULL,
          result TEXT NOT NULL,
          ip_address TEXT,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await db.exec(`CREATE INDEX IF NOT EXISTS idx_file_access_logs_user_id ON file_access_logs(user_id)`);
      await db.exec(`CREATE INDEX IF NOT EXISTS idx_file_access_logs_file_path ON file_access_logs(file_path)`);
      await db.exec(`CREATE INDEX IF NOT EXISTS idx_file_access_logs_created_at ON file_access_logs(created_at)`);

      // 4. Create dead_letter_queue table (Requirement 17.2)
      await db.exec(`
        CREATE TABLE IF NOT EXISTS dead_letter_queue (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          event_type TEXT NOT NULL,
          payload TEXT NOT NULL,
          failure_reason TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          retry_count INTEGER DEFAULT 0
        )
      `);
      await db.exec(`CREATE INDEX IF NOT EXISTS idx_dead_letter_queue_event_type ON dead_letter_queue(event_type)`);
      await db.exec(`CREATE INDEX IF NOT EXISTS idx_dead_letter_queue_created_at ON dead_letter_queue(created_at)`);

      // 5. Add deleted_at and deleted_by columns to entity tables that need soft delete (Requirement 8.1)
      // Tables that already have deleted_at: audit_tasks, audit_findings, compliance_items
      // Tables that need soft delete support added:
      const softDeleteTables = [
        'audit_programs',
        'audit_plans',
        'recommendations',
        'risk_register',
        'audit_evidence',
        'audit_reports',
        'fraud_log',
        'incoming_correspondence',
        'outgoing_correspondence',
        'correspondence_attachments',
      ];

      for (const table of softDeleteTables) {
        await db.exec(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`);
        await db.exec(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS deleted_by UUID`);
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_${table}_deleted_at ON ${table}(deleted_at)`);
      }

      // Add deleted_by to tables that already have deleted_at but lack deleted_by
      const tablesNeedingDeletedBy = [
        'audit_tasks',
        'audit_findings',
        'compliance_items',
      ];

      for (const table of tablesNeedingDeletedBy) {
        await db.exec(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS deleted_by UUID`);
      }
    },
  },
];
