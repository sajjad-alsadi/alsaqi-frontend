/**
 * Environment Variable Validator
 *
 * Validates that all required environment variables are present and meet
 * minimum length constraints before the server starts. This prevents
 * running with weak or missing credentials in production.
 *
 * Requirements: 5.2, 5.3
 */

export interface EnvRequirement {
  name: string;
  minLength?: number;
}

export const REQUIRED_VARS: EnvRequirement[] = [
  { name: 'DATABASE_URL' },
  { name: 'JWT_SECRET', minLength: 64 },
  { name: 'MINIO_ROOT_USER', minLength: 8 },
  { name: 'MINIO_ROOT_PASSWORD', minLength: 32 },
  { name: 'REDIS_PASSWORD', minLength: 32 },
];

/**
 * Validates that all required environment variables are set and meet minimum
 * length constraints. Exits the process with code 1 if validation fails.
 *
 * @param env - The environment object to validate (defaults to process.env)
 */
export function validateRequiredEnv(
  env: Record<string, string | undefined> = process.env
): void {
  const missing: string[] = [];
  const tooShort: string[] = [];

  for (const req of REQUIRED_VARS) {
    const value = env[req.name];
    if (!value) {
      missing.push(req.name);
    } else if (req.minLength && value.length < req.minLength) {
      tooShort.push(`${req.name} (minimum ${req.minLength} characters)`);
    }
  }

  if (missing.length > 0 || tooShort.length > 0) {
    const errors: string[] = [];
    if (missing.length) errors.push(`Missing: ${missing.join(', ')}`);
    if (tooShort.length) errors.push(`Too short: ${tooShort.join(', ')}`);

    console.error(`[FATAL] Environment validation failed:\n${errors.join('\n')}`);
    process.exit(1);
  }
}
