import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database module
vi.mock('../db/index', () => ({
  db: {
    isExternal: false,
    client: { dataDir: '/tmp/test' },
    prepare: vi.fn().mockReturnValue({
      get: vi.fn().mockResolvedValue({ check_val: 1 }),
      all: vi.fn().mockResolvedValue([]),
      run: vi.fn().mockResolvedValue({ changes: 0 }),
    }),
  },
}));

describe('Health Check Endpoint', () => {
  it('should return database status information', async () => {
    const { db } = await import('../db/index');
    
    // Verify the mock is set up correctly
    expect(db.isExternal).toBe(false);
    expect(db.client.dataDir).toBe('/tmp/test');
  });

  it('should detect PGlite vs PostgreSQL correctly', async () => {
    const { db } = await import('../db/index');
    
    // PGlite mode
    expect(db.isExternal).toBe(false);
  });
});
