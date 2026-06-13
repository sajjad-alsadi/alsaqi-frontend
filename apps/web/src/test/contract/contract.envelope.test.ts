/**
 * Tests for task 2.5: envelope fidelity and malformed-envelope handling.
 *
 * Covers:
 *  - Requirement 2.1 — On a `success: true` envelope, `unwrapEnvelope` returns
 *    `data`, `readEnvelopeMeta` returns `meta`, and the value handed to the
 *    caller's Zod schema is deep-equal to the envelope `data` with no fields
 *    added, removed, or reordered.
 *  - Requirement 2.7 — A malformed Envelope is rejected (via the contract guard
 *    `assertEnvelope`) WITHOUT passing any data to the caller's Zod schema, and
 *    leaves caller state unchanged.
 *
 * The fidelity assertions are exercised two ways: directly against the envelope
 * helpers (`unwrapEnvelope` / `readEnvelopeMeta`) where reference identity proves
 * no copy/reorder occurs, and end-to-end through the real `createApiClient`
 * (driven by axios-mock-adapter, mirroring the existing `client.test.ts` pattern)
 * where a spy on the caller schema captures exactly what value the client passes
 * to `schema.parse`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import { z } from 'zod';
import { createApiClient, type ApiClientConfig } from '../../api/client';
import { unwrapEnvelope, readEnvelopeMeta } from '../../api/utils/envelope';
import { assertEnvelope } from './contract';

// ─── A contract-guarded read mirroring the client's success-path semantics ────

/**
 * Minimal stand-in for caller state that a successful read would mutate. Used to
 * prove a malformed-envelope rejection leaves the caller untouched (Req 2.7).
 */
interface CallerState<T> {
  value: T | undefined;
  updates: number;
}

/**
 * Read a raw (pre-unwrap) backend body under the contract guard. The guard
 * (`assertEnvelope`) rejects a malformed envelope BEFORE the caller's Zod schema
 * is ever invoked and before any caller state is mutated (Requirement 2.7).
 *
 * On a well-formed success envelope it mirrors the client's success path:
 * `unwrapEnvelope` → `schema.parse(data)` → commit to caller state.
 */
function contractGuardedRead<T>(
  rawBody: unknown,
  schema: z.ZodType<T>,
  state: CallerState<T>
): T {
  // Contract guard first — a malformed envelope throws here, so neither the
  // caller schema nor the caller state is ever touched.
  assertEnvelope(rawBody);

  const data = unwrapEnvelope(rawBody);
  const parsed = schema.parse(data);
  state.value = parsed;
  state.updates += 1;
  return parsed;
}

// ─── Fixtures ──────────────────────────────────────────────────────────────────

/** A nested, multi-field payload so "no fields added/removed/reordered" is meaningful. */
const findingData = {
  id: 42,
  title: 'Insufficient access logging',
  risk_level: 'high',
  tags: ['audit', 'logging', 'access'],
  owner: { id: 7, name: 'Layla', department: 'Compliance' },
  open: true,
} as const;

const findingSchema = z.object({
  id: z.number(),
  title: z.string(),
  risk_level: z.string(),
  tags: z.array(z.string()),
  owner: z.object({ id: z.number(), name: z.string(), department: z.string() }),
  open: z.boolean(),
});

const sampleMeta = {
  requestId: '550e8400-e29b-41d4-a716-446655440000',
  timestamp: '2024-01-01T00:00:00Z',
  version: '1.0.0',
  pagination: { total: 1, totalPages: 1 },
};

// ─── Requirement 2.1 — envelope fidelity (helpers) ─────────────────────────────

describe('envelope fidelity — helpers (Requirement 2.1)', () => {
  it('unwrapEnvelope returns the exact data with no fields added, removed, or reordered', () => {
    const envelope = { success: true, data: findingData, meta: sampleMeta };

    const unwrapped = unwrapEnvelope(envelope);

    // Reference identity is the strongest proof that nothing was copied/reordered.
    expect(unwrapped).toBe(envelope.data);
    // Deep-equal — no field added or removed.
    expect(unwrapped).toEqual(findingData);
    // Key order preserved exactly.
    expect(JSON.stringify(unwrapped)).toBe(JSON.stringify(findingData));
  });

  it('readEnvelopeMeta returns the meta block from the success envelope', () => {
    const envelope = { success: true, data: findingData, meta: sampleMeta };

    const meta = readEnvelopeMeta(envelope);

    expect(meta).toBe(envelope.meta);
    expect(meta).toEqual(sampleMeta);
  });

  it('unwrapEnvelope preserves array data shape and order', () => {
    const list = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const envelope = { success: true, data: list, meta: { total: 3 } };

    const unwrapped = unwrapEnvelope(envelope);

    expect(unwrapped).toBe(list);
    expect(JSON.stringify(unwrapped)).toBe(JSON.stringify(list));
  });
});

// ─── Requirement 2.1 — envelope fidelity (end-to-end through createApiClient) ──

describe('envelope fidelity — through createApiClient (Requirement 2.1)', () => {
  let mockAdapter: MockAdapter;
  let config: ApiClientConfig;

  beforeEach(() => {
    config = { baseUrl: 'http://localhost:3000/api', timeout: 5000 };
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: 'csrf-token=test-csrf-token-123',
    });
  });

  afterEach(() => {
    mockAdapter?.restore();
    vi.restoreAllMocks();
  });

  it('passes a value deep-equal to envelope.data (no fields added/removed/reordered) to the caller schema', async () => {
    const client = createApiClient(config);
    mockAdapter = new MockAdapter(client.http);

    const envelope = { success: true, data: findingData, meta: sampleMeta };
    mockAdapter.onGet('/findings/42').reply(200, envelope);

    // Spy on the caller's schema to capture exactly what value the client validates.
    const parseSpy = vi.spyOn(findingSchema, 'parse');

    const result = await client.get('/findings/42', findingSchema);

    // The caller's schema was invoked exactly once.
    expect(parseSpy).toHaveBeenCalledTimes(1);

    // The value handed to the schema equals envelope.data with no fields
    // added/removed and identical key order.
    const valuePassedToSchema = parseSpy.mock.calls[0]?.[0];
    expect(valuePassedToSchema).toEqual(findingData);
    expect(JSON.stringify(valuePassedToSchema)).toBe(JSON.stringify(findingData));

    // The unwrapped+validated result returned to the caller is the data, not the envelope.
    expect(result).toEqual(findingData);
    expect(result).not.toHaveProperty('success');
    expect(result).not.toHaveProperty('meta');
  });

  it('surfaces the envelope meta via getWithMeta while returning data through the schema', async () => {
    const client = createApiClient(config);
    mockAdapter = new MockAdapter(client.http);

    const envelope = { success: true, data: findingData, meta: sampleMeta };
    mockAdapter.onGet('/findings/42').reply(200, envelope);

    const { data, meta } = await client.getWithMeta('/findings/42', findingSchema);

    expect(data).toEqual(findingData);
    expect(meta).toEqual(sampleMeta);
  });
});

// ─── Requirement 2.7 — malformed envelope rejection ────────────────────────────

describe('malformed envelope rejection (Requirement 2.7)', () => {
  // Each malformed shape must be rejected by the contract guard before the
  // caller schema is reached.
  const malformedBodies: Array<{ name: string; body: unknown }> = [
    { name: 'a bare string (not an object)', body: 'not-an-envelope' },
    { name: 'null', body: null },
    { name: 'a number', body: 123 },
    { name: 'an object missing the success field', body: { data: { id: 1 } } },
    { name: 'success not a boolean', body: { success: 'true', data: { id: 1 } } },
    { name: 'success: true but no data field', body: { success: true, meta: {} } },
    { name: 'meta present but not an object', body: { success: true, data: { id: 1 }, meta: 7 } },
  ];

  it.each(malformedBodies)(
    'rejects $name without invoking the caller schema and leaves caller state unchanged',
    ({ body }) => {
      const schema = z.object({ id: z.number() });
      const parseSpy = vi.spyOn(schema, 'parse');
      const state: CallerState<{ id: number }> = { value: undefined, updates: 0 };

      expect(() => contractGuardedRead(body, schema, state)).toThrowError(
        /Contract violation: response does not match/
      );

      // The caller's Zod schema was never handed any data.
      expect(parseSpy).not.toHaveBeenCalled();
      // Caller state is unchanged.
      expect(state.value).toBeUndefined();
      expect(state.updates).toBe(0);
    }
  );

  it('commits caller state for a well-formed success envelope (positive control)', () => {
    const schema = z.object({ id: z.number() });
    const parseSpy = vi.spyOn(schema, 'parse');
    const state: CallerState<{ id: number }> = { value: undefined, updates: 0 };

    const result = contractGuardedRead({ success: true, data: { id: 9 }, meta: {} }, schema, state);

    expect(parseSpy).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ id: 9 });
    expect(state.value).toEqual({ id: 9 });
    expect(state.updates).toBe(1);
  });

  it('does not mutate previously committed caller state when a later malformed read is rejected', () => {
    const schema = z.object({ id: z.number() });
    const state: CallerState<{ id: number }> = { value: undefined, updates: 0 };

    // First, a good read commits state.
    contractGuardedRead({ success: true, data: { id: 1 }, meta: {} }, schema, state);
    expect(state.value).toEqual({ id: 1 });
    expect(state.updates).toBe(1);

    const parseSpy = vi.spyOn(schema, 'parse');

    // A subsequent malformed read must not touch the previously committed state.
    expect(() => contractGuardedRead({ success: 'nope' }, schema, state)).toThrow();
    expect(parseSpy).not.toHaveBeenCalled();
    expect(state.value).toEqual({ id: 1 });
    expect(state.updates).toBe(1);
  });
});
