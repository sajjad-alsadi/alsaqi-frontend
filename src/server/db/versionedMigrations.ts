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

  {
    version: '003',
    name: 'Add encrypted_files table for file encryption at rest',
    type: 'schema',
    up: async () => {
      // Create encrypted_files table to store encryption metadata for uploaded files
      await db.exec(`
        CREATE TABLE IF NOT EXISTS encrypted_files (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          original_name TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          original_size INTEGER NOT NULL,
          encrypted_path TEXT NOT NULL,
          iv TEXT NOT NULL,
          auth_tag TEXT NOT NULL,
          checksum_sha256 TEXT NOT NULL,
          key_version INTEGER NOT NULL DEFAULT 1,
          encrypted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          uploaded_by TEXT NOT NULL,
          module TEXT NOT NULL CHECK (module IN ('audit', 'fraud', 'coi', 'correspondence'))
        )
      `);

      // Index on uploaded_by for querying files by user
      await db.exec(`CREATE INDEX IF NOT EXISTS idx_encrypted_files_uploaded_by ON encrypted_files(uploaded_by)`);

      // Index on module for filtering by application module
      await db.exec(`CREATE INDEX IF NOT EXISTS idx_encrypted_files_module ON encrypted_files(module)`);

      // Index on key_version for key rotation operations
      await db.exec(`CREATE INDEX IF NOT EXISTS idx_encrypted_files_key_version ON encrypted_files(key_version)`);
    },
  },

  {
    version: '004',
    name: 'Add backup_history table for backup scheduling',
    type: 'schema',
    up: async () => {
      // Create backup_history table to track all backup operations
      await db.exec(`
        CREATE TABLE IF NOT EXISTS backup_history (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          completed_at TIMESTAMPTZ,
          status TEXT NOT NULL CHECK (status IN ('running', 'success', 'partial', 'failed')),
          type TEXT NOT NULL CHECK (type IN ('scheduled', 'manual')),
          size_bytes BIGINT DEFAULT 0,
          tables_count INTEGER DEFAULT 0,
          file_path TEXT,
          error_message TEXT,
          verified BOOLEAN DEFAULT FALSE,
          verified_at TIMESTAMPTZ
        )
      `);

      // Index on started_at for querying recent backups
      await db.exec(`CREATE INDEX IF NOT EXISTS idx_backup_history_started_at ON backup_history(started_at)`);
    },
  },

  {
    version: '005',
    name: 'Add user_totp table and requires_2fa_setup column for 2FA',
    type: 'schema',
    up: async () => {
      // Create user_totp table to store TOTP secrets and backup codes
      await db.exec(`
        CREATE TABLE IF NOT EXISTS user_totp (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id TEXT NOT NULL UNIQUE,
          secret_encrypted TEXT NOT NULL,
          secret_iv TEXT NOT NULL,
          secret_tag TEXT NOT NULL,
          is_enabled BOOLEAN DEFAULT FALSE,
          enabled_at TIMESTAMPTZ,
          backup_codes_hash TEXT NOT NULL,
          last_used_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Index on user_id for fast lookups
      await db.exec(`CREATE INDEX IF NOT EXISTS idx_user_totp_user_id ON user_totp(user_id)`);

      // Add requires_2fa_setup column to users table
      await db.exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS requires_2fa_setup BOOLEAN DEFAULT FALSE`);
    },
  },

  {
    version: '006',
    name: 'Convert audit_trail to range-partitioned table by timestamp',
    type: 'schema',
    up: async () => {
      // Partitioning only works with external PostgreSQL (not PGlite)
      if (!db.isExternal) {
        return;
      }

      // Check if already partitioned
      const checkResult = await db.prepare(`
        SELECT relkind FROM pg_class WHERE relname = 'audit_trail'
      `).get();

      if (checkResult?.relkind === 'p') {
        // Already partitioned, skip
        return;
      }

      // Step 1: Create the partitioned parent table
      await db.exec(`
        CREATE TABLE IF NOT EXISTS audit_trail_partitioned (
          id UUID DEFAULT gen_random_uuid(),
          "user" TEXT NOT NULL,
          action TEXT NOT NULL,
          module TEXT NOT NULL,
          details TEXT,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id, timestamp)
        ) PARTITION BY RANGE (timestamp)
      `);

      // Step 2: Create initial partitions (previous month, current, +3 future)
      const now = new Date();
      for (let i = -1; i <= 3; i++) {
        const start = new Date(Date.UTC(now.getFullYear(), now.getMonth() + i, 1));
        const end = new Date(Date.UTC(now.getFullYear(), now.getMonth() + i + 1, 1));
        const partName = `audit_trail_y${start.getFullYear()}m${String(start.getMonth() + 1).padStart(2, '0')}`;

        await db.exec(`
          CREATE TABLE IF NOT EXISTS ${partName}
          PARTITION OF audit_trail_partitioned
          FOR VALUES FROM ('${start.toISOString()}') TO ('${end.toISOString()}')
        `);
      }

      // Step 3: Check for existing data and create historical partitions if needed
      const existingData = await db.prepare(
        `SELECT COUNT(*) as count FROM audit_trail`
      ).get();

      if (existingData && parseInt(existingData.count) > 0) {
        // Find the oldest record to create partitions for historical data
        const oldestRow = await db.prepare(
          `SELECT MIN(timestamp) as min_ts FROM audit_trail`
        ).get();

        if (oldestRow?.min_ts) {
          const oldestDate = new Date(oldestRow.min_ts);
          const currentPartStart = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 1));

          // Create partitions for all months between oldest data and already-created partitions
          let iterDate = new Date(Date.UTC(oldestDate.getFullYear(), oldestDate.getMonth(), 1));
          while (iterDate < currentPartStart) {
            const start = new Date(Date.UTC(iterDate.getFullYear(), iterDate.getMonth(), 1));
            const end = new Date(Date.UTC(iterDate.getFullYear(), iterDate.getMonth() + 1, 1));
            const partName = `audit_trail_y${start.getFullYear()}m${String(start.getMonth() + 1).padStart(2, '0')}`;

            await db.exec(`
              CREATE TABLE IF NOT EXISTS ${partName}
              PARTITION OF audit_trail_partitioned
              FOR VALUES FROM ('${start.toISOString()}') TO ('${end.toISOString()}')
            `);

            iterDate = new Date(Date.UTC(iterDate.getFullYear(), iterDate.getMonth() + 1, 1));
          }
        }

        // Step 4: Migrate existing data from original table to partitioned table
        await db.exec(`
          INSERT INTO audit_trail_partitioned (id, "user", action, module, details, timestamp)
          SELECT id, "user", action, module, details, timestamp
          FROM audit_trail
        `);
      }

      // Step 5: Swap table names (old → _old, partitioned → audit_trail)
      await db.exec(`ALTER TABLE audit_trail RENAME TO audit_trail_old`);
      await db.exec(`ALTER TABLE audit_trail_partitioned RENAME TO audit_trail`);
    },
  },
];
