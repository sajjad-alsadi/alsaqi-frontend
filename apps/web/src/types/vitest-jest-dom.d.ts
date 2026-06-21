/**
 * Register `@testing-library/jest-dom` matchers on Vitest's `expect`.
 *
 * The runtime side-effect import lives in `src/test/setup.ts`, but the test
 * files are excluded from the app `tsconfig.json`, so the IDE/TS server does not
 * pick up the matcher augmentation transitively. This ambient declaration makes
 * the jest-dom matchers (`toBeInTheDocument`, `toHaveTextContent`, …) visible to
 * the language server and `tsc` for every spec, eliminating spurious
 * "Property 'toBeInTheDocument' does not exist on type 'Assertion'" errors.
 */
import 'vitest';
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Assertion<T = any> extends TestingLibraryMatchers<unknown, T> {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining
    extends TestingLibraryMatchers<unknown, unknown> {}
}
