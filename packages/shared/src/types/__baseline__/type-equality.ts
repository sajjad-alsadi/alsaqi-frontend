/**
 * TYPE-LEVEL EQUALITY CHECK — Extra_Shared_Types (FIX-FE-1, criteria 1.1 & 1.6)
 *
 * Compile-time guard that the 8 live Extra_Shared_Types in `../models.ts` remain
 * exactly equal to their recorded baseline in `./extra-shared-types.baseline.ts`.
 *
 * How it works:
 *   - `Equals<X, Y>` resolves to `true` only when X and Y are mutually identical
 *     types (invariant, exact). It distinguishes optional keys (`a?: T`) from
 *     `a: T | undefined`, so an optionality change is caught. It also catches a
 *     deleted/renamed field (shape differs), a narrowed field (e.g. `string` ->
 *     `'a' | 'b'`), and any changed field type.
 *   - `Expect<T extends true>` only accepts `true`. Feeding it the result of an
 *     `Equals` comparison that resolved to `false` is a TYPE ERROR, failing
 *     `tsc --noEmit` / `tsc --build`.
 *
 * Because these are `type` aliases plus a single runtime sentinel, the module has
 * effectively zero runtime cost; its value lies in the compile step. The Vitest
 * suite imports {@link extraSharedTypesEqualityVerified} so the check participates
 * in the test graph as well.
 */
import type {
  DashboardStats,
  AuditProgressByType,
  RiskLevelBreakdown,
  Role,
  Permission,
  UserSession,
  JobTitle,
  UserManagementSettings,
} from '../models';

import type {
  BaselineDashboardStats,
  BaselineAuditProgressByType,
  BaselineRiskLevelBreakdown,
  BaselineRole,
  BaselinePermission,
  BaselineUserSession,
  BaselineJobTitle,
  BaselineUserManagementSettings,
} from './extra-shared-types.baseline';

/**
 * Strict, invariant type equality. Resolves to `true` only if `X` and `Y` are the
 * exact same type in both directions — including optionality and readonly-ness.
 */
type Equals<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;

/** Accepts only the literal `true`; anything else is a compile error. */
type Expect<T extends true> = T;

// ─── The 8 guarded equality assertions ─────────────────────────────────────────
// Each line fails to compile if the corresponding live type drifts from baseline.

type _AssertDashboardStats = Expect<Equals<DashboardStats, BaselineDashboardStats>>;
type _AssertAuditProgressByType = Expect<
  Equals<AuditProgressByType, BaselineAuditProgressByType>
>;
type _AssertRiskLevelBreakdown = Expect<
  Equals<RiskLevelBreakdown, BaselineRiskLevelBreakdown>
>;
type _AssertRole = Expect<Equals<Role, BaselineRole>>;
type _AssertPermission = Expect<Equals<Permission, BaselinePermission>>;
type _AssertUserSession = Expect<Equals<UserSession, BaselineUserSession>>;
type _AssertJobTitle = Expect<Equals<JobTitle, BaselineJobTitle>>;
type _AssertUserManagementSettings = Expect<
  Equals<UserManagementSettings, BaselineUserManagementSettings>
>;

// Reference the assertion aliases so `noUnusedLocals`-style checks stay happy and
// the intent is explicit. These are erased at compile time.
export type ExtraSharedTypesEqualityAssertions = [
  _AssertDashboardStats,
  _AssertAuditProgressByType,
  _AssertRiskLevelBreakdown,
  _AssertRole,
  _AssertPermission,
  _AssertUserSession,
  _AssertJobTitle,
  _AssertUserManagementSettings,
];

/**
 * Runtime sentinel imported by the test suite. Its value is always `true`; the
 * guarantee it represents is enforced by the compile-time assertions above. If a
 * guarded type drifts, this module fails to type-check and the build/CI breaks
 * before this value is ever produced.
 */
export const extraSharedTypesEqualityVerified = true as const;

/** The canonical list of the 8 Extra_Shared_Types names guarded by this check. */
export const EXTRA_SHARED_TYPE_NAMES = [
  'DashboardStats',
  'AuditProgressByType',
  'RiskLevelBreakdown',
  'Role',
  'Permission',
  'UserSession',
  'JobTitle',
  'UserManagementSettings',
] as const;
