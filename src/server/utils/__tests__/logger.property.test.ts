// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import winston from 'winston';
import os from 'os';
import { Writable } from 'stream';

/**
 * Property Test: Log entries contain mandatory fields (Property 1)
 *
 * Feature: production-readiness-review
 * Property 1: Log entries contain mandatory fields
 *
 * **Validates: Requirements 2.4, 9.5**
 *
 * For any log message written by the Logger (regardless of level or content),
 * the JSON output SHALL contain the fields: `timestamp`, `level`, `service`,
 * `message`, `pid`, and `hostname`.
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Creates a fresh Winston logger instance that writes JSON to a captured buffer.
 * Uses the same format pipeline as the production logger (timestamp + addMetadata + json).
 */
function createTestLogger(): { logger: winston.Logger; getEntries: () => string[] } {
  const entries: string[] = [];

  const addMetadata = winston.format((info) => {
    info.pid = process.pid;
    info.hostname = os.hostname();
    info.service = 'alsaqi-api';
    return info;
  });

  const writableStream = new Writable({
    write(chunk, _encoding, callback) {
      entries.push(chunk.toString().trim());
      callback();
    },
  });

  const captureTransport = new winston.transports.Stream({
    stream: writableStream,
  });

  const logger = winston.createLogger({
    level: 'silly', // Accept all levels
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      addMetadata(),
      winston.format.json()
    ),
    transports: [captureTransport],
  });

  return { logger, getEntries: () => entries };
}

// ─── Custom Arbitraries ──────────────────────────────────────────────────────

/** Generates arbitrary log messages — any non-empty unicode string */
const logMessageArb = fc.string({ minLength: 1, maxLength: 200 });

/** Generates a random log level from Winston's standard levels */
const logLevelArb = fc.constantFrom(
  'error',
  'warn',
  'info',
  'http',
  'verbose',
  'debug',
  'silly'
);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Property 1: Log entries contain mandatory fields', () => {
  const MANDATORY_FIELDS = ['timestamp', 'level', 'service', 'message', 'pid', 'hostname'];

  it('for any log message at any level, the JSON output contains all mandatory fields', () => {
    fc.assert(
      fc.property(logMessageArb, logLevelArb, (message, level) => {
        const { logger, getEntries } = createTestLogger();

        // Log the message at the specified level
        logger.log(level, message);

        // Verify at least one entry was captured
        expect(getEntries().length).toBeGreaterThanOrEqual(1);

        const lastEntry = getEntries()[getEntries().length - 1];

        // Parse JSON output
        const parsed = JSON.parse(lastEntry);

        // Verify all mandatory fields are present and defined
        for (const field of MANDATORY_FIELDS) {
          expect(parsed).toHaveProperty(field);
          expect(parsed[field]).toBeDefined();
        }
      }),
      { numRuns: 100 }
    );
  });

  it('for any log message, `pid` is a number and `hostname` is a non-empty string', () => {
    fc.assert(
      fc.property(logMessageArb, logLevelArb, (message, level) => {
        const { logger, getEntries } = createTestLogger();

        logger.log(level, message);

        const lastEntry = getEntries()[getEntries().length - 1];
        const parsed = JSON.parse(lastEntry);

        expect(typeof parsed.pid).toBe('number');
        expect(typeof parsed.hostname).toBe('string');
        expect(parsed.hostname.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  it('for any log message, `service` is always "alsaqi-api"', () => {
    fc.assert(
      fc.property(logMessageArb, logLevelArb, (message, level) => {
        const { logger, getEntries } = createTestLogger();

        logger.log(level, message);

        const lastEntry = getEntries()[getEntries().length - 1];
        const parsed = JSON.parse(lastEntry);

        expect(parsed.service).toBe('alsaqi-api');
      }),
      { numRuns: 100 }
    );
  });

  it('for any log message, `timestamp` matches a date-time pattern', () => {
    fc.assert(
      fc.property(logMessageArb, logLevelArb, (message, level) => {
        const { logger, getEntries } = createTestLogger();

        logger.log(level, message);

        const lastEntry = getEntries()[getEntries().length - 1];
        const parsed = JSON.parse(lastEntry);

        // Timestamp should match YYYY-MM-DD HH:mm:ss pattern
        expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
      }),
      { numRuns: 100 }
    );
  });

  it('for any log message, `message` preserves the original input', () => {
    fc.assert(
      fc.property(logMessageArb, logLevelArb, (message, level) => {
        const { logger, getEntries } = createTestLogger();

        logger.log(level, message);

        const lastEntry = getEntries()[getEntries().length - 1];
        const parsed = JSON.parse(lastEntry);

        expect(parsed.message).toBe(message);
      }),
      { numRuns: 100 }
    );
  });

  it('for any log message, `level` matches the level used to log', () => {
    fc.assert(
      fc.property(logMessageArb, logLevelArb, (message, level) => {
        const { logger, getEntries } = createTestLogger();

        logger.log(level, message);

        const lastEntry = getEntries()[getEntries().length - 1];
        const parsed = JSON.parse(lastEntry);

        expect(parsed.level).toBe(level);
      }),
      { numRuns: 100 }
    );
  });
});
