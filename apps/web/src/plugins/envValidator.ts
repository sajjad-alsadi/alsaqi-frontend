import type { Plugin } from 'vite';

/**
 * Required environment variables for the AL-SAQI production build.
 * In an air-gapped banking environment, all variables must be explicitly set —
 * the build will fail if any are missing.
 */
const REQUIRED_ENV_VARS = [
  'VITE_API_URL',
  'VITE_APP_VERSION',
  'VITE_ERROR_REPORT_URL',
  'VITE_WS_URL',
] as const;

/**
 * Vite plugin that validates required environment variables at build time.
 * Runs during the `configResolved` hook and fails the build with a clear error
 * naming each missing variable.
 */
export function envValidatorPlugin(): Plugin {
  return {
    name: 'env-validator',
    configResolved(config) {
      if (config.command === 'build') {
        const missing = REQUIRED_ENV_VARS.filter(
          (varName) => !process.env[varName] && !config.env[varName]
        );

        if (missing.length > 0) {
          const missingList = missing.map((v) => `  - ${v}`).join('\n');
          throw new Error(
            `\n[env-validator] Build failed: missing required environment variables:\n` +
              `${missingList}\n\n` +
              `All environment variables must be explicitly set for air-gapped deployment.\n` +
              `Copy apps/web/.env.example to apps/web/.env and configure all values.\n`
          );
        }
      }
    },
  };
}
