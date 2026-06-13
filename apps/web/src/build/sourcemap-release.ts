/**
 * Source-map release-hardening gate (Stream 6, Component 6).
 *
 * Single source of truth for the credential gate that decides whether a
 * production build uploads source maps to Sentry and then deletes them, so
 * `dist/` never ships a `.map` file on EITHER path:
 *
 *   • Upload enabled  (req 6.4): production mode AND all three Sentry
 *     credentials present and non-empty. The build emits `hidden` maps (no
 *     `sourceMappingURL` comment), uploads them, then deletes the emitted
 *     `.map` files via `SOURCEMAP_DELETE_GLOB`.
 *   • Upload disabled (req 6.5): not production, or any credential
 *     absent/empty. No maps are generated at all (`sourcemap: false`).
 *
 * `vite.config.ts` consumes this module so the gate stays testable without
 * loading the full Vite plugin chain.
 *
 * Requirements: 6.4, 6.5
 */

/** Glob of emitted source maps to delete from `dist/` after a successful upload. */
export const SOURCEMAP_DELETE_GLOB = './dist/**/*.map' as const;

export interface SourcemapReleaseEnv {
  /** The Vite build mode (`'production'` enables upload when creds are present). */
  mode: string;
  /** `SENTRY_AUTH_TOKEN` (build-time, typically a CI secret). */
  authToken?: string;
  /** `SENTRY_ORG`. */
  org?: string;
  /** `SENTRY_PROJECT`. */
  project?: string;
}

/**
 * True iff a production build should upload + delete source maps — i.e. the
 * build is in production mode and all three Sentry credentials are present and
 * non-empty. An empty string counts as absent.
 */
export function isSentrySourceMapUploadEnabled(env: SourcemapReleaseEnv): boolean {
  return env.mode === 'production' && !!env.authToken && !!env.org && !!env.project;
}

/**
 * Resolve the Vite `build.sourcemap` setting from the gate result: `'hidden'`
 * when upload is enabled (maps emitted for upload, then deleted), otherwise
 * `false` (no maps emitted at all). Either way `dist/` ships zero `.map` files.
 */
export function resolveSourcemapSetting(uploadEnabled: boolean): 'hidden' | false {
  return uploadEnabled ? 'hidden' : false;
}
