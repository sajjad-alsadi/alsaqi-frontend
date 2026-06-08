import { Plugin } from 'vite';

const REQUIRED_VARS = ['VITE_API_URL'];

export function envValidatorPlugin(): Plugin {
  return {
    name: 'env-validator',
    configResolved(config) {
      if (config.command === 'build') {
        const missing = REQUIRED_VARS.filter(
          (v) => !process.env[v] && !config.env[v]
        );
        if (missing.length > 0) {
          throw new Error(
            `[env-validator] Missing required environment variables: ${missing.join(', ')}.\n` +
            `Copy apps/web/.env.example to apps/web/.env and configure values.`
          );
        }
      }
    },
  };
}
