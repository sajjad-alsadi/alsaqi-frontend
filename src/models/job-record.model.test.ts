import { describe, it, expect } from 'vitest';
import {
  validateJobType,
  validateJobStatus,
  validateProgress,
  validateAttempts,
  validateTimestamps,
  validateJobRecord,
  mapBullMQStateToJobRecordStatus,
} from './job-record.model';

describe('JobRecord Validation', () => {
  describe('validateJobType', () => {
    it('accepts all valid job types', () => {
      expect(validateJobType('process-file')).toBeNull();
      expect(validateJobType('generate-pdf')).toBeNull();
      expect(validateJobType('send-notification')).toBeNull();
      expect(validateJobType('cleanup-temp')).toBeNull();
    });

    it('rejects an invalid job type', () => {
      const error = validateJobType('invalid-type');
      expect(error).not.toBeNull();
      expect(error!.field).toBe('type');
      expect(error!.message).toContain('invalid-type');
    });

    it('rejects an empty string', () => {
      const error = validateJobType('');
      expect(error).not.toBeNull();
      expect(error!.field).toBe('type');
    });
  });

  describe('validateJobStatus', () => {
    it('accepts all valid statuses', () => {
      expect(validateJobStatus('queued')).toBeNull();
      expect(validateJobStatus('processing')).toBeNull();
      expect(validateJobStatus('completed')).toBeNull();
      expect(validateJobStatus('failed')).toBeNull();
      expect(validateJobStatus('cancelled')).toBeNull();
    });

    it('rejects an invalid status', () => {
      const error = validateJobStatus('running');
      expect(error).not.toBeNull();
      expect(error!.field).toBe('status');
      expect(error!.message).toContain('running');
    });
  });

  describe('validateProgress', () => {
    it('accepts 0', () => {
      expect(validateProgress(0)).toBeNull();
    });

    it('accepts 100', () => {
      expect(validateProgress(100)).toBeNull();
    });

    it('accepts a value in between', () => {
      expect(validateProgress(50)).toBeNull();
    });

    it('rejects negative values', () => {
      const error = validateProgress(-1);
      expect(error).not.toBeNull();
      expect(error!.field).toBe('progress');
    });

    it('rejects values over 100', () => {
      const error = validateProgress(101);
      expect(error).not.toBeNull();
      expect(error!.field).toBe('progress');
    });

    it('rejects non-integer values', () => {
      const error = validateProgress(50.5);
      expect(error).not.toBeNull();
      expect(error!.message).toContain('integer');
    });

    it('rejects NaN', () => {
      const error = validateProgress(NaN);
      expect(error).not.toBeNull();
      expect(error!.message).toContain('finite');
    });
  });

  describe('validateAttempts', () => {
    it('accepts valid attempts within max', () => {
      expect(validateAttempts(1, 3)).toBeNull();
    });

    it('accepts zero attempts', () => {
      expect(validateAttempts(0, 3)).toBeNull();
    });

    it('accepts attempts equal to maxAttempts', () => {
      expect(validateAttempts(3, 3)).toBeNull();
    });

    it('rejects attempts exceeding maxAttempts', () => {
      const error = validateAttempts(4, 3);
      expect(error).not.toBeNull();
      expect(error!.field).toBe('attempts');
      expect(error!.message).toContain('4');
      expect(error!.message).toContain('3');
    });

    it('rejects negative attempts', () => {
      const error = validateAttempts(-1, 3);
      expect(error).not.toBeNull();
      expect(error!.field).toBe('attempts');
    });

    it('rejects maxAttempts less than 1', () => {
      const error = validateAttempts(0, 0);
      expect(error).not.toBeNull();
      expect(error!.field).toBe('maxAttempts');
    });
  });

  describe('validateTimestamps', () => {
    it('accepts when both are undefined', () => {
      expect(validateTimestamps(undefined, undefined)).toBeNull();
    });

    it('accepts when only startedAt is set', () => {
      expect(validateTimestamps(new Date(), undefined)).toBeNull();
    });

    it('accepts when completedAt is after startedAt', () => {
      const start = new Date('2024-01-01T10:00:00Z');
      const end = new Date('2024-01-01T10:05:00Z');
      expect(validateTimestamps(start, end)).toBeNull();
    });

    it('rejects when completedAt is before startedAt', () => {
      const start = new Date('2024-01-01T10:05:00Z');
      const end = new Date('2024-01-01T10:00:00Z');
      const error = validateTimestamps(start, end);
      expect(error).not.toBeNull();
      expect(error!.field).toBe('completedAt');
    });
  });

  describe('validateJobRecord', () => {
    const validRecord = {
      type: 'process-file' as const,
      status: 'queued' as const,
      progress: 0,
      attempts: 0,
      maxAttempts: 3,
    };

    it('returns no errors for a valid record', () => {
      expect(validateJobRecord(validRecord)).toEqual([]);
    });

    it('returns multiple errors for invalid record', () => {
      const errors = validateJobRecord({
        type: 'invalid' as any,
        status: 'running' as any,
        progress: -1,
        attempts: 5,
        maxAttempts: 3,
      });
      expect(errors.length).toBeGreaterThanOrEqual(3);
    });
  });
});

describe('mapBullMQStateToJobRecordStatus', () => {
  it('maps waiting to queued', () => {
    expect(mapBullMQStateToJobRecordStatus('waiting')).toBe('queued');
  });

  it('maps wait to queued', () => {
    expect(mapBullMQStateToJobRecordStatus('wait')).toBe('queued');
  });

  it('maps prioritized to queued', () => {
    expect(mapBullMQStateToJobRecordStatus('prioritized')).toBe('queued');
  });

  it('maps delayed to queued', () => {
    expect(mapBullMQStateToJobRecordStatus('delayed')).toBe('queued');
  });

  it('maps active to processing', () => {
    expect(mapBullMQStateToJobRecordStatus('active')).toBe('processing');
  });

  it('maps completed to completed', () => {
    expect(mapBullMQStateToJobRecordStatus('completed')).toBe('completed');
  });

  it('maps failed to failed', () => {
    expect(mapBullMQStateToJobRecordStatus('failed')).toBe('failed');
  });

  it('maps unknown states to queued as default', () => {
    expect(mapBullMQStateToJobRecordStatus('unknown')).toBe('queued');
  });
});
