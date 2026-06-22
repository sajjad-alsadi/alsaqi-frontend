// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom/vitest" />
/**
 * Integration — CRUD round-trips through the REAL composed API client.
 *
 * For every API module (`api.<module>.*`) this exercises the production
 * request/response path end-to-end against MSW handlers that emulate the backend
 * `{ success, data, meta }` envelope. It asserts:
 *  - the client hits the exact URL + HTTP method the module declares,
 *  - the success envelope is unwrapped to the inner `data`,
 *  - the unwrapped payload passes the module's own Zod schema (no throw),
 *  - list/detail/create/update/delete each return the expected shape.
 *
 * Because `onUnhandledRequest: 'error'` is set, any call to a URL the test did
 * not register fails the test — so a wrong path/prefix is caught immediately.
 *
 * @module test/integration/crud
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import {
  API_BASE,
  server,
  installServer,
  successEnvelope,
  setCookie,
  makeComposedClient,
} from './harness';

installServer();

let api = makeComposedClient();
beforeEach(() => {
  setCookie('csrf-token=itest-csrf');
  api = makeComposedClient();
});

/** Record the method+path MSW actually received, to assert URL correctness. */
function captureRoute(method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string, data: unknown) {
  const url = `${API_BASE}${path}`;
  const hits: string[] = [];
  const handler = (http as Record<string, typeof http.get>)[method](url, () => {
    hits.push(`${method.toUpperCase()} ${path}`);
    return HttpResponse.json(successEnvelope(data));
  });
  server.use(handler);
  return hits;
}

// ─── Fixtures aligned to each module's Zod schema ──────────────────────────────

const FINDING = {
  id: 1,
  audit_id: 10,
  condition: 'c',
  criteria: 'cr',
  cause: 'ca',
  consequence: 'co',
  recommendation: 'r',
  risk_level: 'High' as const,
  status: 'Open' as const,
};

const CORRESPONDENCE = {
  id: '1',
  type: 'Incoming',
  letter_number: 'L-1',
  subject: 's',
  letter_date: '2024-01-01',
  classification: 'General',
  priority: 'Normal',
  status: 'Received',
  notes: null,
  created_at: '2024-01-01T00:00:00Z',
  sender_entity: 'Entity',
};

const USER = {
  id: 1,
  username: 'admin',
  name: 'Admin',
  role: 'Admin',
  status: 'Active',
};

describe('Integration: Findings CRUD via real composed client', () => {
  it('list → GET /audit-findings, unwraps + validates a Finding[]', async () => {
    captureRoute('get', '/audit-findings', [FINDING]);
    const result = await api.findings.list({ status: 'Open' });
    expect(result).toEqual([FINDING]);
  });

  it('create → POST /audit-findings returns a validated Finding', async () => {
    const hits = captureRoute('post', '/audit-findings', FINDING);
    const created = await api.findings.create(FINDING as never);
    expect(created).toEqual(FINDING);
    expect(hits).toContain('POST /audit-findings');
  });

  it('update → PUT /audit-findings/:id', async () => {
    const hits = captureRoute('put', '/audit-findings/1', FINDING);
    await api.findings.update('1', FINDING as never);
    expect(hits).toContain('PUT /audit-findings/1');
  });

  it('delete → DELETE /audit-findings/:id returns { deleted }', async () => {
    captureRoute('delete', '/audit-findings/1', { deleted: true });
    const res = await api.findings.delete('1');
    expect(res).toEqual({ deleted: true });
  });
});

describe('Integration: Correspondence CRUD via real composed client', () => {
  it('getIncoming → GET /correspondence/incoming', async () => {
    captureRoute('get', '/correspondence/incoming', [CORRESPONDENCE]);
    const list = await api.correspondence.getIncoming({ page: 1 });
    expect(list).toEqual([CORRESPONDENCE]);
  });

  it('getOutgoing → GET /correspondence/outgoing', async () => {
    const out = { ...CORRESPONDENCE, type: 'Outgoing', recipient_entity: 'R' };
    captureRoute('get', '/correspondence/outgoing', [out]);
    const list = await api.correspondence.getOutgoing();
    expect(list[0]?.type).toBe('Outgoing');
  });

  it('getArchive → GET /correspondence/archive', async () => {
    captureRoute('get', '/correspondence/archive', []);
    expect(await api.correspondence.getArchive()).toEqual([]);
  });

  it('createIncoming → POST /correspondence/incoming', async () => {
    const hits = captureRoute('post', '/correspondence/incoming', CORRESPONDENCE);
    await api.correspondence.createIncoming({} as never);
    expect(hits).toContain('POST /correspondence/incoming');
  });

  it('deleteOutgoing → DELETE /correspondence/outgoing/:id', async () => {
    captureRoute('delete', '/correspondence/outgoing/9', { deleted: true });
    expect(await api.correspondence.deleteOutgoing(9)).toEqual({ deleted: true });
  });

  it('getStats → GET /correspondence/stats (record payload)', async () => {
    captureRoute('get', '/correspondence/stats', { total_incoming: 5 });
    expect(await api.correspondence.getStats()).toEqual({ total_incoming: 5 });
  });
});

describe('Integration: Users CRUD via real composed client', () => {
  it('list → GET /users (bare array)', async () => {
    captureRoute('get', '/users', [USER]);
    expect(await api.users.list()).toEqual([USER]);
  });

  it('list → GET /users tolerates a { data, pagination } payload', async () => {
    server.use(
      http.get(`${API_BASE}/users`, () =>
        HttpResponse.json(
          successEnvelope({ data: [USER], pagination: { total: 1, totalPages: 1 } })
        )
      )
    );
    // The module's preprocess normalizes the paginated object to the inner array.
    expect(await api.users.list()).toEqual([USER]);
  });

  it('create → POST /users', async () => {
    const hits = captureRoute('post', '/users', USER);
    await api.users.create(USER as never);
    expect(hits).toContain('POST /users');
  });

  it('delete → DELETE /users/:id', async () => {
    captureRoute('delete', '/users/1', { deleted: true });
    expect(await api.users.delete('1')).toEqual({ deleted: true });
  });
});

describe('Integration: Dashboard stats via real composed client', () => {
  it('getStats → GET /dashboard-stats validates the stats shape', async () => {
    const stats = {
      audits: { total: 1, completed: 1, progress_by_type: [] },
      findings: { summary: { open: 0, high_risk_open: 0 } },
      recommendations: { open: 0, overdue: 0 },
      risks: { summary: { total: 0, high: 0 } },
      correspondence: { incoming_total: 0, outgoing_total: 0, pending_responses: 0 },
      compliance: { total: 0 },
      activity: [],
    };
    captureRoute('get', '/dashboard-stats', stats);
    const result = await api.dashboard.getStats();
    expect(result.audits.total).toBe(1);
  });
});

describe('Integration: Recommendations / Risk / Departments / Tasks CRUD', () => {
  it('recommendations.list → GET /recommendations', async () => {
    const rec = {
      id: 1,
      finding_id: 1,
      department: 'IT',
      responsible: 'x',
      due_date: '2024-01-01',
      status: 'Open',
      risk_level: 'High',
    };
    captureRoute('get', '/recommendations', [rec]);
    const list = await api.recommendations.list();
    expect(list).toHaveLength(1);
  });

  it('riskRegister.delete → DELETE /risk-register/:id', async () => {
    captureRoute('delete', '/risk-register/7', { deleted: true });
    expect(await api.riskRegister.delete('7')).toEqual({ deleted: true });
  });

  it('departments.list → GET /departments', async () => {
    const dept = {
      id: '1',
      name: 'Finance',
      name_ar: 'مالية',
      name_en: 'Finance',
      entity_code: 'FIN',
      entity_type: 'dept',
      parent_id: null,
      manager_name: null,
      level: 1,
      status: 'Active',
      display_order: 1,
    };
    captureRoute('get', '/departments', [dept]);
    expect(await api.departments.list()).toHaveLength(1);
  });
});

describe('Integration: Auth flows via real composed client', () => {
  it('login → POST /auth/login returns the login response shape', async () => {
    const loginUser = { ...USER, email: null, department: null };
    server.use(
      http.post(`${API_BASE}/auth/login`, () =>
        HttpResponse.json(successEnvelope({ user: loginUser, token: 'authenticated' }))
      )
    );
    const res = await api.auth.login({ usernameOrEmail: 'admin', password: 'admin' } as never);
    expect(res).toBeDefined();
  });

  it('logout → POST /auth/logout', async () => {
    const hits = captureRoute('post', '/auth/logout', { success: true });
    await api.auth.logout();
    expect(hits).toContain('POST /auth/logout');
  });
});
