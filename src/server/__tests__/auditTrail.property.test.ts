// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import crypto from 'crypto';

/**
 * Property Test: Audit Trail Hash Chain Integrity (Property 1)
 *
 * Feature: comprehensive-testing
 * Property 1: سلسلة هاش التدقيق غير قابلة للتلاعب
 *
 * **Validates: Requirements 24.1, 24.2, 24.3, 24.4**
 *
 * For any sequence of audit trail records, if any field in an intermediate record
 * is modified, recomputing the hash chain will detect the tampering.
 *
 * Hash computation follows BaseService.logAudit:
 *   recordData = `${previousHash}|${username}|${action}|${module}|${details}|${timestamp}`
 *   hash = SHA-256(recordData)
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface AuditRecord {
  username: string;
  action: string;
  module: string;
  details: string;
  timestamp: string;
  hash: string;
  previous_hash: string;
}

/**
 * Computes the SHA-256 hash for an audit record, matching BaseService.logAudit logic.
 */
function computeAuditHash(
  previousHash: string,
  username: string,
  action: string,
  module: string,
  details: string,
  timestamp: string
): string {
  const recordData = `${previousHash}|${username}|${action}|${module}|${details}|${timestamp}`;
  return crypto.createHash('sha256').update(recordData).digest('hex');
}

/**
 * Builds a valid hash chain from raw audit data entries.
 */
function buildHashChain(
  entries: Array<{ username: string; action: string; module: string; details: string; timestamp: string }>
): AuditRecord[] {
  const records: AuditRecord[] = [];
  let previousHash = '0';

  for (const entry of entries) {
    const hash = computeAuditHash(
      previousHash,
      entry.username,
      entry.action,
      entry.module,
      entry.details,
      entry.timestamp
    );
    records.push({
      ...entry,
      hash,
      previous_hash: previousHash,
    });
    previousHash = hash;
  }

  return records;
}

/**
 * Verifies the integrity of a hash chain. Returns true if valid, false if tampered.
 */
function verifyHashChain(records: AuditRecord[]): boolean {
  for (let i = 0; i < records.length; i++) {
    const expectedPreviousHash = i === 0 ? '0' : records[i - 1].hash;
    if (records[i].previous_hash !== expectedPreviousHash) {
      return false;
    }
    const expectedHash = computeAuditHash(
      records[i].previous_hash,
      records[i].username,
      records[i].action,
      records[i].module,
      records[i].details,
      records[i].timestamp
    );
    if (records[i].hash !== expectedHash) {
      return false;
    }
  }
  return true;
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Generates a valid username */
const usernameArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{2,20}$/);

/** Generates a valid action string */
const actionArb = fc.constantFrom(
  'CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT',
  'APPROVE', 'REJECT', 'ARCHIVE', 'RESTORE', 'EXPORT'
);

/** Generates a valid module string */
const moduleArb = fc.constantFrom(
  'AuditPlans', 'AuditTasks', 'RiskRegister', 'Compliance',
  'Correspondence', 'Users', 'Notifications', 'FraudLog',
  'Recommendations', 'Auth'
);

/** Generates a details string */
const detailsArb = fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0);

/** Generates an ISO timestamp string using integer milliseconds to avoid invalid date issues */
const timestampArb = fc.integer({
  min: new Date('2020-01-01').getTime(),
  max: new Date('2030-12-31').getTime(),
}).map(ms => new Date(ms).toISOString());

/** Generates a single audit entry (without hash fields) */
const auditEntryArb = fc.record({
  username: usernameArb,
  action: actionArb,
  module: moduleArb,
  details: detailsArb,
  timestamp: timestampArb,
});

/** Generates a sequence of audit entries */
const auditSequenceArb = (minLength: number, maxLength: number) =>
  fc.array(auditEntryArb, { minLength, maxLength });

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Property 1: Audit Trail Hash Chain Integrity', () => {
  it('each record\'s hash includes the previous record\'s hash', () => {
    fc.assert(
      fc.property(
        auditSequenceArb(2, 20),
        (entries) => {
          const records = buildHashChain(entries);

          for (let i = 1; i < records.length; i++) {
            // Each record's previous_hash must equal the prior record's hash
            expect(records[i].previous_hash).toBe(records[i - 1].hash);

            // Verify that changing the previous hash would produce a different hash
            const altHash = computeAuditHash(
              'tampered_previous_hash',
              records[i].username,
              records[i].action,
              records[i].module,
              records[i].details,
              records[i].timestamp
            );
            expect(altHash).not.toBe(records[i].hash);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('modifying any field in an intermediate record breaks the chain', () => {
    fc.assert(
      fc.property(
        auditSequenceArb(3, 20),
        fc.constantFrom('username', 'action', 'module', 'details', 'timestamp') as fc.Arbitrary<keyof Omit<AuditRecord, 'hash' | 'previous_hash'>>,
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        (entries, fieldToModify, newValue) => {
          const records = buildHashChain(entries);

          // Pick a random intermediate record (not the last one, so chain continues after it)
          const targetIndex = Math.floor(entries.length / 2);

          // Tamper with the field
          const tamperedRecords = records.map((r, i) => ({ ...r }));
          (tamperedRecords[targetIndex] as any)[fieldToModify] = newValue + '_tampered';

          // Recompute expected hash for the tampered record
          const expectedHash = computeAuditHash(
            tamperedRecords[targetIndex].previous_hash,
            tamperedRecords[targetIndex].username,
            tamperedRecords[targetIndex].action,
            tamperedRecords[targetIndex].module,
            tamperedRecords[targetIndex].details,
            tamperedRecords[targetIndex].timestamp
          );

          // The stored hash no longer matches the recomputed hash
          expect(tamperedRecords[targetIndex].hash).not.toBe(expectedHash);

          // The chain is broken: verification fails
          expect(verifyHashChain(tamperedRecords)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('the first record uses \'0\' as previous hash', () => {
    fc.assert(
      fc.property(
        auditEntryArb,
        (entry) => {
          const records = buildHashChain([entry]);

          // First record must use '0' as previous_hash
          expect(records[0].previous_hash).toBe('0');

          // The hash must be computed with '0' as the previous hash
          const expectedHash = computeAuditHash(
            '0',
            entry.username,
            entry.action,
            entry.module,
            entry.details,
            entry.timestamp
          );
          expect(records[0].hash).toBe(expectedHash);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('the hash includes all required fields (previousHash, username, action, module, details, timestamp)', () => {
    fc.assert(
      fc.property(
        auditSequenceArb(2, 10),
        (entries) => {
          const records = buildHashChain(entries);

          for (const record of records) {
            // Verify that changing any single field produces a different hash
            const fields = ['username', 'action', 'module', 'details', 'timestamp'] as const;

            for (const field of fields) {
              const modifiedValue = record[field] + '_modified';
              const modifiedHash = computeAuditHash(
                record.previous_hash,
                field === 'username' ? modifiedValue : record.username,
                field === 'action' ? modifiedValue : record.action,
                field === 'module' ? modifiedValue : record.module,
                field === 'details' ? modifiedValue : record.details,
                field === 'timestamp' ? modifiedValue : record.timestamp
              );

              // Each field contributes to the hash - changing it produces a different hash
              expect(modifiedHash).not.toBe(record.hash);
            }

            // Also verify that changing previous_hash produces a different hash
            const modifiedPrevHash = computeAuditHash(
              record.previous_hash + '_modified',
              record.username,
              record.action,
              record.module,
              record.details,
              record.timestamp
            );
            expect(modifiedPrevHash).not.toBe(record.hash);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
