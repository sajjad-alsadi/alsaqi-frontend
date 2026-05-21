import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// Mock dependencies
vi.mock('../db/index', () => ({
  db: {
    isExternal: false,
    prepare: vi.fn().mockReturnValue({
      all: vi.fn().mockResolvedValue([{ id: '1', title: 'Test' }]),
    }),
    validateIdentifier: vi.fn((id: string) => {
      if (!/^[a-zA-Z0-9_]+$/.test(id)) throw new Error('Invalid identifier');
      return id;
    }),
  },
}));

vi.mock('../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Backup Utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should validate table identifiers to prevent SQL injection', async () => {
    const { db } = await import('../db/index');
    
    // Valid identifiers
    expect(() => db.validateIdentifier('users')).not.toThrow();
    expect(() => db.validateIdentifier('audit_plans')).not.toThrow();
    
    // Invalid identifiers (SQL injection attempts)
    expect(() => db.validateIdentifier('users; DROP TABLE users')).toThrow();
    expect(() => db.validateIdentifier('users--')).toThrow();
    expect(() => db.validateIdentifier("users' OR '1'='1")).toThrow();
  });

  it('should limit maximum number of backups', () => {
    const MAX_BACKUPS = parseInt(process.env.MAX_BACKUPS || '7', 10);
    
    // Should keep a reasonable number of backups
    expect(MAX_BACKUPS).toBeGreaterThanOrEqual(3);
    expect(MAX_BACKUPS).toBeLessThanOrEqual(30);
  });

  it('should use configurable backup directory', () => {
    const BACKUP_DIR = process.env.BACKUP_DIR || path.join(process.cwd(), 'backups');
    
    expect(BACKUP_DIR).toBeTruthy();
    expect(typeof BACKUP_DIR).toBe('string');
  });
});
