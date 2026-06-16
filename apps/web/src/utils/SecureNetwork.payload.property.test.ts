/**
 * Property-based tests for outgoing payload transmission after the
 * network-layer monkey-patching was removed (code-review remediation, Req 2).
 *
 * Feature: code-review-remediation, Property 1: Outgoing payloads are
 * transmitted unchanged and never pattern-blocked
 *
 * For any request body string — including strings that contain
 * previously-blocked substrings such as `<script`, `onerror=`, or
 * `javascript:` — the transport layer transmits the body byte-for-byte
 * identical to the input and never rejects the request for payload-pattern
 * reasons.
 *
 * **Validates: Requirements 2.1, 2.2**
 *
 * Strategy: `SecureNetwork` is now a behavior-free shim, so initialising it
 * installs no global interceptors. We init the shim, then drive a real axios
 * instance through axios-mock-adapter, capturing the body the transport layer
 * hands to the network. We assert the captured body equals the input exactly
 * and that the request resolves (is never rejected for payload-pattern
 * reasons). fast-check explores arbitrary strings that are seeded with the
 * formerly-blocked substrings so the generator covers the previously-rejected
 * input space.
 */
import { describe, it, expect, afterEach } from 'vitest';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import fc from 'fast-check';
import { initSecureNetwork } from './SecureNetwork';

// Substrings the legacy SecureNetwork module used to reject outright.
const PREVIOUSLY_BLOCKED = [
  '<script',
  '</script>',
  'onerror=',
  'onload=',
  'javascript:',
  'eval(',
  '<img src=x onerror=alert(1)>',
  'data:text/html',
];

/**
 * Arbitrary that interleaves arbitrary text with formerly-blocked substrings,
 * guaranteeing wide coverage of the previously-rejected payload space while
 * still exploring random content. The minLength on the seeds ensures most
 * generated payloads carry at least one blocked substring.
 */
const payloadArb: fc.Arbitrary<string> = fc
  .array(
    fc.oneof(
      { weight: 2, arbitrary: fc.string() },
      { weight: 3, arbitrary: fc.constantFrom(...PREVIOUSLY_BLOCKED) }
    ),
    { minLength: 1, maxLength: 12 }
  )
  .map((parts) => parts.join(''));

describe('Feature: code-review-remediation, Property 1: Outgoing payloads are transmitted unchanged and never pattern-blocked', () => {
  afterEach(() => {
    // nothing global to restore — SecureNetwork installs no interceptors
  });

  it('transmits string request bodies byte-for-byte unchanged and never blocks on payload pattern', async () => {
    // Initialising the shim must not install any interception.
    initSecureNetwork({
      blockedPatterns: [/<script/i, /onerror=/i, /javascript:/i],
    });

    await fc.assert(
      fc.asyncProperty(payloadArb, async (payload) => {
        const client = axios.create({ baseURL: 'http://localhost:3000/api' });
        const mock = new MockAdapter(client);

        let captured: unknown = undefined;
        mock.onPost('/submit').reply((config) => {
          captured = config.data;
          return [200, { ok: true }];
        });

        try {
          // A string body is sent as-is by axios (no JSON serialisation), so
          // the captured value is directly comparable byte-for-byte.
          const res = await client.post('/submit', payload, {
            headers: { 'Content-Type': 'text/plain' },
          });

          // Request was accepted — not rejected for payload-pattern reasons.
          expect(res.status).toBe(200);
          // Body transmitted unchanged.
          expect(captured).toBe(payload);
        } finally {
          mock.restore();
        }
      }),
      { numRuns: 120 }
    );
  });

  it('transmits JSON field values containing blocked substrings unchanged', async () => {
    initSecureNetwork();

    await fc.assert(
      fc.asyncProperty(payloadArb, async (content) => {
        const client = axios.create({ baseURL: 'http://localhost:3000/api' });
        const mock = new MockAdapter(client);

        let capturedBody: unknown = undefined;
        mock.onPost('/finding').reply((config) => {
          capturedBody = config.data;
          return [201, { ok: true }];
        });

        try {
          const res = await client.post('/finding', { content });

          // Accepted, not blocked.
          expect(res.status).toBe(201);
          // axios serialises the object to JSON; the field value round-trips
          // unchanged through the transport layer.
          const parsed = JSON.parse(String(capturedBody));
          expect(parsed.content).toBe(content);
        } finally {
          mock.restore();
        }
      }),
      { numRuns: 120 }
    );
  });
});
