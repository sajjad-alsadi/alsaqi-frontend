/**
 * Job Payload Security Validator
 *
 * Runtime defense-in-depth validation ensuring job payloads never contain
 * sensitive data such as credentials, tokens, or session information.
 *
 * The typed JobDataMap already enforces safe payloads at compile time,
 * but this validator catches any runtime violations (e.g., from casts,
 * dynamic data, or compromised upstream code).
 *
 * Requirements: 11.4
 */

import logger from './logger.js';

/**
 * Fields that must never appear in job payloads.
 * Case-insensitive matching is applied.
 */
const SENSITIVE_FIELD_PATTERNS: string[] = [
  'password',
  'token',
  'secret',
  'apikey',
  'api_key',
  'sessionid',
  'session_id',
  'cookie',
  'authorization',
  'jwt',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'credential',
  'private_key',
  'privatekey',
];

export interface PayloadValidationResult {
  isValid: boolean;
  sensitiveFields: string[];
}

/**
 * Recursively checks an object for keys matching sensitive field patterns.
 * Returns a list of offending field paths (e.g., "metadata.token").
 */
function findSensitiveFields(
  obj: unknown,
  path: string = '',
): string[] {
  const found: string[] = [];

  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return found;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      found.push(...findSensitiveFields(obj[i], `${path}[${i}]`));
    }
    return found;
  }

  // Handle plain objects
  for (const key of Object.keys(obj)) {
    const normalizedKey = key.toLowerCase().replace(/[-_]/g, '');
    const currentPath = path ? `${path}.${key}` : key;

    for (const pattern of SENSITIVE_FIELD_PATTERNS) {
      const normalizedPattern = pattern.toLowerCase().replace(/[-_]/g, '');
      if (normalizedKey === normalizedPattern || normalizedKey.includes(normalizedPattern)) {
        found.push(currentPath);
        break;
      }
    }

    // Recurse into nested objects
    const value = (obj as Record<string, unknown>)[key];
    if (value !== null && typeof value === 'object') {
      found.push(...findSensitiveFields(value, currentPath));
    }
  }

  return found;
}

/**
 * Validates that a job payload does not contain sensitive fields.
 *
 * @param payload - The job data object to validate
 * @returns Validation result with list of any detected sensitive fields
 */
export function validateJobPayload(payload: unknown): PayloadValidationResult {
  const sensitiveFields = findSensitiveFields(payload);

  return {
    isValid: sensitiveFields.length === 0,
    sensitiveFields,
  };
}

/**
 * Validates and sanitizes a job payload by stripping sensitive fields.
 * Logs a warning if sensitive fields are detected and removed.
 *
 * @param jobType - The job type being enqueued (for logging context)
 * @param payload - The job data object to validate and sanitize
 * @returns The sanitized payload with sensitive fields removed
 * @throws Error if the payload contains sensitive fields (strict mode)
 */
export function assertJobPayloadSecurity(
  jobType: string,
  payload: unknown,
): void {
  const result = validateJobPayload(payload);

  if (!result.isValid) {
    const message = `[JobPayloadValidator] SECURITY: Job payload for "${jobType}" contains sensitive fields: [${result.sensitiveFields.join(', ')}]. Rejecting job.`;
    logger.error(message);
    throw new Error(
      `Job payload contains sensitive data. Detected fields: ${result.sensitiveFields.join(', ')}`,
    );
  }
}
