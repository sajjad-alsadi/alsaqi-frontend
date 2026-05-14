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
];
