/**
 * k6 load-test: login -> audit-plan list -> finding (in order).
 *
 * This script models the core read workflow of the AL-SAQI frontend against the
 * backend REST API. It is a plain k6 ES-module script run by the k6 runtime
 * (`k6 run`); it is NOT part of the Vite/app build and is never bundled.
 *
 * Requirements 4.2:
 *   - Executable with k6.
 *   - Accepts the backend base URL as an EXTERNAL parameter (no source edit to
 *     retarget): set `-e BASE_URL=https://api.example.com/api` (or the
 *     `BASE_URL` environment variable). Defaults to the local dev backend.
 *   - Exercises the login -> audit-plan list -> finding steps IN ORDER.
 *
 * Usage:
 *   k6 run -e BASE_URL=http://localhost:3000/api apps/web/load-tests/workflow.js
 *   k6 run -e BASE_URL=https://staging.example.com/api \
 *          -e USERNAME=admin -e PASSWORD=admin123 \
 *          apps/web/load-tests/workflow.js
 *
 * Tunable external parameters (all via `-e KEY=VALUE` / environment):
 *   BASE_URL  API base URL incl. the `/api` prefix (default http://localhost:3000/api)
 *   USERNAME  Login username (default "admin")
 *   PASSWORD  Login password (default "admin123")
 *   VUS       Virtual users (default 5)
 *   DURATION  Test duration (default "30s")
 */
import http from 'k6/http';
import { check, group, fail } from 'k6';
import { Trend } from 'k6/metrics';

// ─── External configuration (no source edit required to retarget) ──────────────

/** Strip any trailing slashes so path joins never produce `//`. */
function trimTrailingSlash(value) {
  return String(value).replace(/\/+$/, '');
}

const BASE_URL = trimTrailingSlash(__ENV.BASE_URL || 'http://localhost:3000/api');
const USERNAME = __ENV.USERNAME || 'admin';
const PASSWORD = __ENV.PASSWORD || 'admin123';
const VUS = Number(__ENV.VUS || 5);
const DURATION = __ENV.DURATION || '30s';

// ─── Per-step latency metrics ──────────────────────────────────────────────────

const loginDuration = new Trend('step_login_duration', true);
const auditPlanListDuration = new Trend('step_audit_plan_list_duration', true);
const findingDuration = new Trend('step_finding_duration', true);

// ─── k6 options ──────────────────────────────────────────────────────────────

export const options = {
  vus: VUS,
  duration: DURATION,
  thresholds: {
    // Fail the run if more than 1% of checks fail or p95 latency is too high.
    checks: ['rate>0.99'],
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<2000'],
  },
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Build common JSON headers, attaching CSRF + correlation like the real client. */
function jsonHeaders(extra) {
  return Object.assign(
    {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      // The real API client attaches a per-request correlation id.
      'x-correlation-id': `k6-${__VU}-${__ITER}`,
    },
    extra || {}
  );
}

/**
 * Read a cookie value from k6's per-VU cookie jar. The frontend mirrors the
 * `csrf-token` cookie into the `x-csrf-token` header on state-changing requests.
 */
function readCookie(name) {
  const jar = http.cookieJar();
  const cookies = jar.cookiesForURL(BASE_URL);
  const entry = cookies[name];
  if (Array.isArray(entry) && entry.length > 0) {
    return entry[0];
  }
  return undefined;
}

/** Unwrap the `{ success, data, meta }` response envelope, tolerating raw bodies. */
function unwrapEnvelope(body) {
  if (body && typeof body === 'object' && 'data' in body) {
    return body.data;
  }
  return body;
}

/** Safely JSON-parse a k6 response body, returning undefined on failure. */
function parseJson(res) {
  try {
    return res.json();
  } catch (_err) {
    return undefined;
  }
}

/** Extract a usable id from an unwrapped record/list payload. */
function firstId(data) {
  if (Array.isArray(data)) {
    const found = data.find((item) => item && item.id != null);
    return found ? String(found.id) : undefined;
  }
  if (data && typeof data === 'object' && data.id != null) {
    return String(data.id);
  }
  return undefined;
}

// ─── Workflow (executed in order per iteration) ─────────────────────────────────

export default function workflow() {
  // ── Step 1: Login ──────────────────────────────────────────────────────────
  let auditPlanId;

  group('1. login', function loginStep() {
    // Attach the CSRF header if a csrf-token cookie is already present (the
    // backend may issue one before authentication). Login is a state-changing
    // POST, so this mirrors the real client's CSRF behavior.
    const csrf = readCookie('csrf-token');
    const headers = jsonHeaders(csrf ? { 'x-csrf-token': csrf } : undefined);

    const res = http.post(
      `${BASE_URL}/v1/auth/login`,
      JSON.stringify({ username: USERNAME, password: PASSWORD }),
      { headers, tags: { step: 'login' } }
    );
    loginDuration.add(res.timings.duration);

    const ok = check(res, {
      'login status is 200': (r) => r.status === 200,
      'login returns a session payload': (r) => {
        const data = unwrapEnvelope(parseJson(r));
        return !!data && (data.user != null || data.token != null || data.accessToken != null);
      },
    });

    if (!ok) {
      // Abort this iteration's workflow: the ordered steps depend on a session.
      fail(`login failed (status ${res.status}); cannot proceed to audit-plan list`);
    }
  });

  // ── Step 2: Audit-plan list ──────────────────────────────────────────────────
  group('2. audit-plan list', function auditPlanListStep() {
    const res = http.get(`${BASE_URL}/v1/audit-plans?page=1&pageSize=20`, {
      headers: jsonHeaders(),
      tags: { step: 'audit-plan-list' },
    });
    auditPlanListDuration.add(res.timings.duration);

    check(res, {
      'audit-plan list status is 200': (r) => r.status === 200,
      'audit-plan list returns an array': (r) => Array.isArray(unwrapEnvelope(parseJson(r))),
    });

    auditPlanId = firstId(unwrapEnvelope(parseJson(res)));
  });

  // ── Step 3: Finding ──────────────────────────────────────────────────────────
  group('3. finding', function findingStep() {
    // Scope findings to the audit plan selected in step 2 when available, so the
    // workflow stays causally ordered (a finding belongs to an audit plan).
    const query = auditPlanId
      ? `?audit_id=${encodeURIComponent(auditPlanId)}&page=1&pageSize=20`
      : '?page=1&pageSize=20';
    const res = http.get(`${BASE_URL}/v1/findings${query}`, {
      headers: jsonHeaders(),
      tags: { step: 'finding' },
    });
    findingDuration.add(res.timings.duration);

    check(res, {
      'finding status is 200': (r) => r.status === 200,
      'finding returns an array': (r) => Array.isArray(unwrapEnvelope(parseJson(r))),
    });
  });
}
