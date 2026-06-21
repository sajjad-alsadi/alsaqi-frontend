// @vitest-environment jsdom
/**
 * Unit Tests — RolePermissions registry-matching identifiers + preview label
 * ==========================================================================
 * **Validates: Requirements 26.1, 26.3**
 *
 * Requirement 26.1: THE RolePermissions component SHALL use Module_Registry
 *   identifiers rather than legacy `fallbackModules` identifiers that do not
 *   match the registry.
 * Requirement 26.3: WHEN the RolePermissions component lists modules, THE listed
 *   identifiers SHALL match the identifiers defined in the Module_Registry.
 *
 * When `allPermissions` is empty the component falls back to
 * `ModuleRegistry.getModuleNames()` for its matrix rows. These tests render the
 * real component with NO live permissions so the fallback path is exercised and
 * assert:
 *   1. Exactly one matrix row is rendered per registry identifier (count match).
 *   2. Every registry identifier resolves to a clean localized label
 *      (`t('modules.<id>')`) with no missing-key marker — proving the listed
 *      identifiers match the registry and their translation keys resolve.
 *   3. The preview-mode label is driven by the translation key
 *      (`userManagement.roles.previewMode`) rather than a hardcoded
 *      "(Preview Mode)" string.
 *
 * Test stack mirrors RolePermissions.module-i18n.test.tsx: the global mocks from
 * src/test/setup.ts are unmocked and a real isolated i18next instance is wired
 * through <I18nextProvider>; formatService and motion/react are mocked locally.
 */

import React from 'react';
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

// Use the real i18n stack instead of the global mocks from src/test/setup.ts.
vi.unmock('react-i18next');
vi.unmock('i18next');

// formatService depends on PreferencesContext + i18n; the component only uses
// formatNumber, so provide a minimal real-shape stub (mirrors AuditPlan.test.tsx).
vi.mock('../../utils/formatService', () => ({
  useFormat: () => ({
    formatNumber: (n: number | string | undefined) => String(n ?? 0),
  }),
}));

// The global motion/react mock only defines `motion.div`; RolePermissions uses
// `motion.tr`. Provide a passthrough proxy for any motion element + AnimatePresence.
vi.mock('motion/react', () => {
  const ReactLib = require('react');
  const createMotionComponent = (tag: string) =>
    ReactLib.forwardRef(
      (
        {
          children,
          initial,
          animate,
          exit,
          transition,
          whileHover,
          whileTap,
          layout,
          ...props
        }: Record<string, unknown> & { children?: React.ReactNode },
        ref: React.Ref<unknown>,
      ) => ReactLib.createElement(tag, { ...props, ref }, children),
    );
  const motion = new Proxy(
    {},
    {
      get: (_target, tag: string) => createMotionComponent(tag),
    },
  );
  return {
    motion,
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
  };
});

import { createInstance, type i18n as I18nType } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';

import ar from '../../locales/ar.json';
import en from '../../locales/en.json';
// Side-effect import: register every module into the registry (single source of
// truth) so getModuleNames() returns the canonical identifier list.
import '../../permissions/modules';
import { ModuleRegistry } from '../../permissions/registry';
import RolePermissions from './RolePermissions';

const MISSING_KEY_MARKER = '⚠️';
const PREVIEW_SENTINEL = '__PREVIEW_MODE_SENTINEL__';

// ─── Isolated, real i18next instance wired through react-i18next ─────────────

function buildI18n(overrides?: { previewMode?: string }): I18nType {
  const instance = createInstance();
  const enResources = JSON.parse(JSON.stringify(en));
  if (overrides?.previewMode !== undefined) {
    enResources.userManagement.roles.previewMode = overrides.previewMode;
  }
  instance.use(initReactI18next).init({
    resources: {
      ar: { translation: ar },
      en: { translation: enResources },
    },
    lng: 'en',
    fallbackLng: 'ar',
    supportedLngs: ['en', 'ar'],
    interpolation: { escapeValue: false },
    parseMissingKeyHandler: (key: string) => `${MISSING_KEY_MARKER} [${key}]`,
    saveMissing: false,
    returnNull: false,
    returnEmptyString: false,
  });
  return instance;
}

let i18nInstance: I18nType;

beforeAll(() => {
  i18nInstance = buildI18n();
});

afterEach(() => {
  cleanup();
});

// ─── Test helpers ─────────────────────────────────────────────────────────

function renderFallbackMatrix(i18n: I18nType) {
  // No live permissions → component falls back to ModuleRegistry.getModuleNames().
  const allRoles = [{ id: 1, name: 'Admin', permissions: [] as unknown[] }];
  return render(
    <I18nextProvider i18n={i18n}>
      <RolePermissions
        allRoles={allRoles}
        allPermissions={[]}
        showSaveSuccess={false}
        getRoleLabel={(role: string) => role}
        onSave={vi.fn()}
      />
    </I18nextProvider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('RolePermissions fallback rows — registry-matching identifiers (Req 26.1, 26.3)', () => {
  it('renders exactly one matrix row per Module_Registry identifier', async () => {
    const registryNames = ModuleRegistry.getModuleNames();
    expect(registryNames.length).toBeGreaterThan(0);

    const { container } = renderFallbackMatrix(i18nInstance);

    // Flush mount effects (localRoles initialization) within act().
    await screen.findByText(i18nInstance.t(`modules.${registryNames[0]}`));

    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(registryNames.length);
  });

  it('renders each registry identifier as a clean localized label with no missing-key marker', async () => {
    const registryNames = ModuleRegistry.getModuleNames();

    renderFallbackMatrix(i18nInstance);
    await screen.findByText(i18nInstance.t(`modules.${registryNames[0]}`));

    for (const name of registryNames) {
      const expectedLabel = i18nInstance.t(`modules.${name}`);
      // The translation key must exist (no fallback marker) and the label must
      // be present in the rendered matrix — proving the listed identifier
      // matches the registry and resolves via `modules.<id>`.
      expect(expectedLabel).not.toContain(MISSING_KEY_MARKER);
      const cell = screen.getByText(expectedLabel);
      expect(cell).toBeInTheDocument();
      expect(cell.textContent ?? '').not.toContain(MISSING_KEY_MARKER);
    }
  });

  it('lists only registry identifiers (no legacy fallback identifiers leak through)', async () => {
    const registryNames = ModuleRegistry.getModuleNames();
    const { container } = renderFallbackMatrix(i18nInstance);
    await screen.findByText(i18nInstance.t(`modules.${registryNames[0]}`));

    // The set of rendered labels must equal the set of registry-derived labels.
    const expectedLabels = new Set(
      registryNames.map((name) => i18nInstance.t(`modules.${name}`)),
    );
    // The first cell's label lives in the outer span; a nested tooltip span was
    // added alongside it, so select the DIRECT child span only (not descendants)
    // to read exactly one label per row.
    const renderedLabels = Array.from(
      container.querySelectorAll('tbody tr td:first-child > span'),
    ).map((el) => (el.firstChild?.textContent ?? '').trim());

    expect(renderedLabels.length).toBe(expectedLabels.size);
    for (const label of renderedLabels) {
      expect(expectedLabels.has(label)).toBe(true);
    }
  });
});

describe('RolePermissions preview-mode label — uses translation key (Req 26.2)', () => {
  it('renders the preview-mode label from the translation key, not a hardcoded string', async () => {
    const sentinelI18n = buildI18n({ previewMode: PREVIEW_SENTINEL });
    const registryNames = ModuleRegistry.getModuleNames();
    const allRoles = [{ id: 1, name: 'Admin', permissions: [] as unknown[] }];
    const { container } = render(
      <I18nextProvider i18n={sentinelI18n}>
        <RolePermissions
          allRoles={allRoles}
          allPermissions={[]}
          showSaveSuccess={false}
          getRoleLabel={(role: string) => role}
          onSave={vi.fn()}
        />
      </I18nextProvider>,
    );

    // Flush mount effects (localRoles init) so the preview block renders; the
    // preview block only shows when allPermissions is empty AND localRoles > 0.
    await screen.findByText(sentinelI18n.t(`modules.${registryNames[0]}`));

    // The sentinel injected into the `previewMode` resource must appear, proving
    // the component renders t('userManagement.roles.previewMode') rather than a
    // hardcoded "(Preview Mode)" literal.
    expect(container.textContent ?? '').toContain(PREVIEW_SENTINEL);
    // The default hardcoded literal must NOT appear (it was overridden in i18n).
    expect(container.textContent ?? '').not.toContain('(Preview Mode)');
  });
});
