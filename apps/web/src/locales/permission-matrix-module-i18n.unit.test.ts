/**
 * Unit Tests — Permission Matrix Module i18n
 * ==========================================
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**
 *
 * These tests verify the five previously-missing `modules.*` keys now resolve to
 * their exact localized labels in both English and Arabic, contain no `⚠️`
 * missing-translation marker, and that both locale files parse as valid JSON and
 * actually contain the five new keys.
 *
 * Uses the same isolated `createInstance` + `parseMissingKeyHandler` pattern as the
 * existing exploration test (`permission-matrix-module-i18n.bug.test.ts`).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, it, expect, beforeAll, vi } from 'vitest';

// Unmock i18next so we can use the real module for translation testing.
vi.unmock('i18next');

import { createInstance } from 'i18next';
import ar from './ar.json';
import en from './en.json';

// ─── Expected localized labels for the five affected identifiers ─────────────

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

// ─── Isolated i18next instance (mirrors i18n.ts shape) ───────────────────────

const i18nInstance = createInstance();

beforeAll(async () => {
  await i18nInstance.init({
    resources: {
      ar: { translation: ar },
      en: { translation: en },
    },
    lng: 'en',
    fallbackLng: 'ar',
    supportedLngs: ['en', 'ar'],
    interpolation: { escapeValue: false },
    parseMissingKeyHandler: (key: string) => {
      return `⚠️ [${key}]`;
    },
    saveMissing: false,
    returnNull: false,
    returnEmptyString: false,
  });
});

// ─── Tests ────────────────────────────────────────────────────────────────

describe('Permission Matrix Module i18n — unit: English labels', () => {
  for (const identifier of AFFECTED_IDENTIFIERS) {
    it(`resolves modules.${identifier} to "${EXPECTED_EN[identifier]}" in English`, () => {
      const result = i18nInstance.t(`modules.${identifier}`, { lng: 'en' });
      expect(result).toBe(EXPECTED_EN[identifier]);
    });
  }
});

describe('Permission Matrix Module i18n — unit: Arabic labels', () => {
  for (const identifier of AFFECTED_IDENTIFIERS) {
    it(`resolves modules.${identifier} to "${EXPECTED_AR[identifier]}" in Arabic`, () => {
      const result = i18nInstance.t(`modules.${identifier}`, { lng: 'ar' });
      expect(result).toBe(EXPECTED_AR[identifier]);
    });
  }
});

describe('Permission Matrix Module i18n — unit: no missing-translation marker', () => {
  it('none of the five resolved labels contain the ⚠️ marker (en or ar)', () => {
    for (const identifier of AFFECTED_IDENTIFIERS) {
      expect(i18nInstance.t(`modules.${identifier}`, { lng: 'en' })).not.toContain('⚠️');
      expect(i18nInstance.t(`modules.${identifier}`, { lng: 'ar' })).not.toContain('⚠️');
    }
  });
});

describe('Permission Matrix Module i18n — unit: locale files are valid JSON containing the new keys', () => {
  it('en.json parses as valid JSON and contains the five new modules keys', () => {
    const raw = readFileSync(path.resolve(process.cwd(), 'src/locales/en.json'), 'utf-8');
    const parsed = JSON.parse(raw) as { modules: Record<string, string> };
    for (const identifier of AFFECTED_IDENTIFIERS) {
      expect(parsed.modules).toHaveProperty(identifier);
      expect(parsed.modules[identifier]).toBe(EXPECTED_EN[identifier]);
    }
  });

  it('ar.json parses as valid JSON and contains the five new modules keys', () => {
    const raw = readFileSync(path.resolve(process.cwd(), 'src/locales/ar.json'), 'utf-8');
    const parsed = JSON.parse(raw) as { modules: Record<string, string> };
    for (const identifier of AFFECTED_IDENTIFIERS) {
      expect(parsed.modules).toHaveProperty(identifier);
      expect(parsed.modules[identifier]).toBe(EXPECTED_AR[identifier]);
    }
  });
});
