import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Requirement 22: Correct the Dashboard KPI route target.
 *
 * These tests assert that every Dashboard KPI card `link` resolves to a route
 * that is registered in the Web_App router (App.tsx). They guard against the
 * specific regressions called out in the requirement:
 *   - 22.1 Every KPI card links to a route registered in the router.
 *   - 22.2 The card that previously linked to `/regulatory` now points at a
 *          defined, registered route (i.e. `/regulatory` is gone).
 *   - 22.3 No KPI card link is unregistered such that it would fall through the
 *          catch-all (`path="*"`) to `/dashboard`.
 *
 * We extract links and routes from source rather than rendering the dashboard:
 * the KPI links are static literals, while rendering would require mocking the
 * context/i18n/router/scroll-reveal stack and only surface links via click
 * navigation. Source extraction is deterministic and directly validates the
 * "target resolves to a registered route" contract.
 */

// Vitest runs from the apps/web package root; resolve sources from there so the
// test does not depend on the module URL scheme of the transform pipeline.
const WEB_ROOT = process.cwd();
const dashboardSource = readFileSync(
  path.join(WEB_ROOT, 'src/modules/Dashboard/index.tsx'),
  'utf8',
);
const appSource = readFileSync(
  path.join(WEB_ROOT, 'src/App.tsx'),
  'utf8',
);

/** Extract the `link:` targets declared in the `kpiCards` array only. */
function extractKpiLinks(source: string): string[] {
  const start = source.indexOf('const kpiCards');
  expect(start, 'kpiCards declaration should exist in Dashboard').toBeGreaterThan(-1);
  // The KPI array ends before the next memoized list (quickActions).
  const end = source.indexOf('const quickActions', start);
  const block = end > start ? source.slice(start, end) : source.slice(start);
  const links = [...block.matchAll(/link:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  return links;
}

/**
 * Extract the set of routes registered in App.tsx. This includes both directly
 * rendered routes (`path="/x"`) and redirect routes (which still have a
 * registered `path` and resolve to a real destination via `<Navigate>`).
 */
function extractRegisteredRoutes(source: string): Set<string> {
  const paths = [...source.matchAll(/path=["']([^"']+)["']/g)].map((m) => m[1]);
  return new Set(paths);
}

describe('Dashboard KPI route targets (Requirement 22)', () => {
  const kpiLinks = extractKpiLinks(dashboardSource);
  const registeredRoutes = extractRegisteredRoutes(appSource);

  it('finds KPI links and registered routes to validate', () => {
    expect(kpiLinks.length).toBeGreaterThan(0);
    expect(registeredRoutes.size).toBeGreaterThan(0);
    // Sanity check: the router should at least register the dashboard route.
    expect(registeredRoutes.has('/dashboard')).toBe(true);
  });

  // 22.1 — every KPI card links to a route registered in the router.
  it.each([...new Set(kpiLinks)])(
    'KPI link %s resolves to a registered route',
    (link) => {
      expect(link, 'KPI link should be defined').toBeTruthy();
      expect(
        registeredRoutes.has(link),
        `KPI link "${link}" is not a registered route in App.tsx`,
      ).toBe(true);
    },
  );

  // 22.2 — the card that previously linked to `/regulatory` must no longer do so.
  it('does not link any KPI card to the unregistered /regulatory route', () => {
    expect(kpiLinks).not.toContain('/regulatory');
  });

  // 22.3 — no KPI link is unregistered (which would fall through `path="*"` to /dashboard).
  it('contains no KPI link that would fall through to /dashboard', () => {
    const unregistered = kpiLinks.filter((link) => !registeredRoutes.has(link));
    expect(
      unregistered,
      `These KPI links are unregistered and would fall through to /dashboard: ${unregistered.join(', ')}`,
    ).toEqual([]);
  });

  // The compliance KPI card specifically should target the registered matrix route.
  it('links the compliance KPI card to the registered /compliance-matrix route', () => {
    expect(kpiLinks).toContain('/compliance-matrix');
    expect(registeredRoutes.has('/compliance-matrix')).toBe(true);
  });
});
