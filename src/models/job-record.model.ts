/**
 * JobRecord Model
 *
 * Represents a background job tracked in PostgreSQL.
 * Syncs state from BullMQ to provide persistent job status tracking.
 *
 * Requirements: 2.7, 5.6
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type JobType = 'process-file' | 'generate-pdf' | 'send-notification' | 'cleanup-temp';

export type JobRecordStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

// ─── Interface ───────────────────────────────────────────────────────────────

export interface JobRecord {
  id: string;                         // Maps to BullMQ job ID
  type: JobType;
  status: JobRecordStatus;
  data: Record<string, unknown>;      // Serialized job payload
  result?: Record<string, unknown>;
  error?: string;
  progress: number;                   // 0-100
  attempts: number;
  maxAttempts: number;
  createdBy: string;                  // User ID who initiated
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

// ─── Validation ──────────────────────────────────────────────────────────────

export interface ValidationError {
  field: string;
  message: string;
}

/** Valid job types */
const VALID_JOB_TYPES: JobType[] = ['process-file', 'generate-pdf', 'send-notification', 'cleanup-temp'];

/** Valid job record statuses */
const VALID_STATUSES: JobRecordStatus[] = ['queued', 'processing', 'completed', 'failed', 'cancelled'];

/**
 * Validates that a job type is a registered value.
 */
export function validateJobType(type: string): ValidationError | null {
  if (!VALID_JOB_TYPES.includes(type as JobType)) {
    return {
      field: 'type',
      message: `Invalid job type: "${type}". Must be one of: ${VALID_JOB_TYPES.join(', ')}`,
    };
  }
  return null;
}

/**
 * Validates that a job status is a valid value.
 */
export function validateJobStatus(status: string): ValidationError | null {
  if (!VALID_STATUSES.includes(status as JobRecordStatus)) {
    return {
      field: 'status',
      message: `Invalid job status: "${status}". Must be one of: ${VALID_STATUSES.join(', ')}`,
    };
  }
  return null;
}

/**
 * Validates that progress is an integer in [0, 100].
 */
export function validateProgress(progress: number): ValidationError | null {
  if (typeof progress !== 'number' || !Number.isFinite(progress)) {
    return { field: 'progress', message: 'Progress must be a finite number' };
  }
  if (!Number.isInteger(progress)) {
    return { field: 'progress', message: 'Progress must be an integer' };
  }
  if (progress < 0 || progress > 100) {
    return { field: 'progress', message: `Progress must be between 0 and 100 (got ${progress})` };
  }
  return null;
}

/**
 * Validates that attempts does not exceed maxAttempts.
 */
export function validateAttempts(attempts: number, maxAttempts: number): ValidationError | null {
  if (typeof attempts !== 'number' || !Number.isInteger(attempts) || attempts < 0) {
    return { field: 'attempts', message: 'Attempts must be a non-negative integer' };
  }
  if (typeof maxAttempts !== 'number' || !Number.isInteger(maxAttempts) || maxAttempts < 1) {
    return { field: 'maxAttempts', message: 'maxAttempts must be a positive integer' };
  }
  if (attempts > maxAttempts) {
    return {
      field: 'attempts',
      message: `Attempts (${attempts}) must not exceed maxAttempts (${maxAttempts})`,
    };
  }
  return null;
}

/**
 * Validates that completedAt is after startedAt when both are present.
 */
export function validateTimestamps(startedAt?: Date, completedAt?: Date): ValidationError | null {
  if (startedAt && completedAt && completedAt < startedAt) {
    return {
      field: 'completedAt',
      message: 'completedAt must be after startedAt',
    };
  }
  return null;
}

/**
 * Validates all fields of a JobRecord creation payload.
 * Returns an array of validation errors (empty if valid).
 */
export function validateJobRecord(
  record: Pick<JobRecord, 'type' | 'status' | 'progress' | 'attempts' | 'maxAttempts'> &
    Partial<Pick<JobRecord, 'startedAt' | 'completedAt'>>
): ValidationError[] {
  const errors: ValidationError[] = [];

  const typeError = validateJobType(record.type);
  if (typeError) errors.push(typeError);

  const statusError = validateJobStatus(record.status);
  if (statusError) errors.push(statusError);

  const progressError = validateProgress(record.progress);
  if (progressError) errors.push(progressError);

  const attemptsError = validateAttempts(record.attempts, record.maxAttempts);
  if (attemptsError) errors.push(attemptsError);

  const timestampError = validateTimestamps(record.startedAt, record.completedAt);
  if (timestampError) errors.push(timestampError);

  return errors;
}

// ─── BullMQ State Mapping ────────────────────────────────────────────────────

/**
 * Maps BullMQ internal states to JobRecordStatus values.
 *
 * BullMQ states → JobRecordStatus:
 *   waiting  → queued
 *   active   → processing
 *   completed → completed
 *   failed   → failed
 *   delayed  → queued
 */
export function mapBullMQStateToJobRecordStatus(bullmqState: string): JobRecordStatus {
  switch (bullmqState) {
    case 'waiting':
    case 'wait':
    case 'prioritized':
    case 'delayed':
      return 'queued';
    case 'active':
      return 'processing';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    default:
      return 'queued';
  }
}
