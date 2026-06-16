// @vitest-environment jsdom
/**
 * Integration Tests — RolePermissions matrix module i18n
 * ======================================================
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4**
 *
 * Renders the real `RolePermissions` component with a permissions list whose
 * `module` identifiers include the five previously-affected ones and asserts each
 * matrix row shows a clean localized label (no `⚠️`) in both English and Arabic,
 * and that previously-correct identifiers (AuditCharter, Dashboard) render
 * unchanged.
 *
 * Integration approach:
 * - The global test setup (src/test/setup.ts) mocks `react-i18next` so `t` returns
 *   the raw key. That mock would defeat this test, so we `vi.unmock('react-i18next')`
 *   and `vi.unmock('i18next')` here and drive the component with a REAL isolated
 *   i18next instance (createInstance) loaded from the actual en.json / ar.json,
 *   wired through `<I18nextProvider>`. This exercises the exact `t('modules.<id>')`
 *   resolution path the component uses in production.
 * - `useFormat` (formatService) pulls in PreferencesContext + i18n; it is mocked
 *   minimally (only `formatNumber` is used by the component) following the existing
 *   repo pattern in modules/__tests__/AuditPlan.test.tsx.
 * - `motion/react` is mocked locally to passthrough ALL motion elements (the global
 *   setup mock only provides `motion.div`, but this component uses `motion.tr`).
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
import RolePermissions from './RolePermissions';

// ─── Affected + previously-correct identifiers and their expected labels ─────

const EXPECTED_EN: Record<string, string> = {
  AuditEvidence: 'Audit Evidence',
  AuditFindings: 'Audit Findings',
  ComplianceMatrix: 'Compliance Matrix',
  Notifications: 'Notifications',
  SystemLogs: 'System Logs',
};

const EXPECTED_AR: Record<string, string> = {
  AuditEvidence: 'أدلة التدقيق',
  AuditFindings: 'نتائج التدقيق',
  ComplianceMatrix: 'مصفوفة الامتثال',
  Notifications: 'الإشعارات',
  SystemLogs: 'سجلات النظام',
};

const AFFECTED_IDENTIFIERS = Object.keys(EXPECTED_EN);

// Previously-correct identifiers that must remain unchanged (Requirement 3.x).
const PRECORRECT_EN: Record<string, string> = {
  AuditCharter: 'Audit Charter',
  Dashboard: 'Dashboard',
};

// ─── Isolated, real i18next instance wired through react-i18next ─────────────

const i18nInstance = createInstance();

beforeAll(async () => {
  await i18nInstance.use(initReactI18next).init({
    resources: {
      ar: { translation: ar },
      en: { translation: en },
    },
    lng: 'en',
    fallbackLng: 'ar',
    supportedLngs: ['en', 'ar'],
    interpolation: { escapeValue: false },
    parseMissingKeyHandler: (key: string) => `⚠️ [${key}]`,
    saveMissing: false,
    returnNull: false,
    returnEmptyString: false,
  });
});

afterEach(() => {
  cleanup();
});

// ─── Test helpers ─────────────────────────────────────────────────────────

interface PermissionRow {
  id: number;
  module: string;
  action: string;
}

function buildPermissions(modules: string[]): PermissionRow[] {
  // One permission row per module is enough for the matrix to render a row.
  return modules.map((module, idx) => ({ id: idx + 1, module, action: 'View' }));
}

function renderMatrix(modules: string[], i18n: I18nType) {
  const allPermissions = buildPermissions(modules);
  const allRoles = [{ id: 1, name: 'Admin', permissions: [] as unknown[] }];
  return render(
    <I18nextProvider i18n={i18n}>
      <RolePermissions
        allRoles={allRoles}
        allPermissions={allPermissions}
        showSaveSuccess={false}
        getRoleLabel={(role: string) => role}
        onSave={vi.fn()}
      />
    </I18nextProvider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('RolePermissions matrix — affected module labels (English)', () => {
  it('renders each affected identifier as a clean English label with no ⚠️', async () => {
    await i18nInstance.changeLanguage('en');
    const { container } = renderMatrix(AFFECTED_IDENTIFIERS, i18nInstance);

    // Await the first label so the component's mount effects flush within act().
    await screen.findByText(EXPECTED_EN.AuditEvidence);

    for (const identifier of AFFECTED_IDENTIFIERS) {
      const cell = screen.getByText(EXPECTED_EN[identifier]);
      expect(cell).toBeInTheDocument();
      expect(cell.textContent ?? '').not.toContain('⚠️');
    }

    // No missing-translation marker anywhere in the rendered matrix.
    expect(container.textContent ?? '').not.toContain('⚠️');
  });
});

describe('RolePermissions matrix — affected module labels (Arabic)', () => {
  it('renders each affected identifier as a clean Arabic label with no ⚠️', async () => {
    await i18nInstance.changeLanguage('ar');
    const { container } = renderMatrix(AFFECTED_IDENTIFIERS, i18nInstance);

    await screen.findByText(EXPECTED_AR.AuditEvidence);

    for (const identifier of AFFECTED_IDENTIFIERS) {
      const cell = screen.getByText(EXPECTED_AR[identifier]);
      expect(cell).toBeInTheDocument();
      expect(cell.textContent ?? '').not.toContain('⚠️');
    }

    expect(container.textContent ?? '').not.toContain('⚠️');

    // Reset for any subsequent tests.
    await i18nInstance.changeLanguage('en');
  });
});

describe('RolePermissions matrix — mixed correct + affected identifiers', () => {
  it('renders previously-correct rows unchanged alongside the fixed affected rows (English)', async () => {
    await i18nInstance.changeLanguage('en');
    const modules = [
      'AuditCharter',
      'Dashboard',
      ...AFFECTED_IDENTIFIERS,
    ];
    const { container } = renderMatrix(modules, i18nInstance);

    await screen.findByText(PRECORRECT_EN.AuditCharter);

    // Previously-correct identifiers remain exactly as before.
    for (const [, label] of Object.entries(PRECORRECT_EN)) {
      const cell = screen.getByText(label);
      expect(cell).toBeInTheDocument();
      expect(cell.textContent ?? '').not.toContain('⚠️');
    }

    // The affected identifiers now resolve to clean labels too.
    for (const identifier of AFFECTED_IDENTIFIERS) {
      expect(screen.getByText(EXPECTED_EN[identifier])).toBeInTheDocument();
    }

    // Whole matrix is free of the missing-translation marker.
    expect(container.textContent ?? '').not.toContain('⚠️');
  });
});
