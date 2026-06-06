// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import fc from 'fast-check';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Use vi.hoisted to create mock references (avoids hoisting issues)
const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    log: vi.fn(),
    crit: vi.fn(),
  },
}));

vi.mock('../../utils/logger', () => ({
  default: mockLogger,
}));

import { CertificateManager } from '../certificate-manager.js';
import type { TLSConfig } from '../../config/tls.config.js';

/**
 * Property Test: Certificate Expiry Detection (Property 5)
 *
 * **Validates: Requirements 7.4, 7.5**
 *
 * For any loaded TLS certificate, the CertificateManager SHALL produce a warning
 * when the certificate expires within 30 days but more than 7 days, and SHALL
 * produce a critical alert when the certificate expires within 7 days or fewer.
 * Certificates with more than 30 days remaining SHALL produce no expiry notification.
 */

// ─── Constants ───────────────────────────────────────────────────────────────

const EXPIRY_WARNING_DAYS = 30;
const EXPIRY_CRITICAL_DAYS = 7;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Generates a self-signed test certificate valid for a long time.
 * We generate the certs ONCE and reuse them — the property test
 * controls the expiry by mocking the X509Certificate constructor.
 */
function generateLongLivedCerts(tmpDir: string) {
  const caKeyPair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const caCertPem = createSelfSignedCert('Test CA', caKeyPair, 3650);

  const serverKeyPair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const serverCertPem = createSignedCert('localhost', serverKeyPair, caKeyPair.privateKey, caCertPem, 3650);

  const caCertPath = path.join(tmpDir, 'ca.crt');
  const serverCertPath = path.join(tmpDir, 'server.crt');
  const serverKeyPath = path.join(tmpDir, 'server.key');

  fs.writeFileSync(caCertPath, caCertPem);
  fs.writeFileSync(serverCertPath, serverCertPem);
  fs.writeFileSync(serverKeyPath, serverKeyPair.privateKey);

  return { caCertPath, serverCertPath, serverKeyPath };
}

function createSelfSignedCert(
  cn: string,
  keyPair: { publicKey: string; privateKey: string },
  days: number,
): string {
  return createX509Cert({
    subject: `CN=${cn}`,
    issuer: `CN=${cn}`,
    publicKey: keyPair.publicKey,
    signingKey: keyPair.privateKey,
    days,
    isCA: true,
    serialNumber: crypto.randomBytes(16).toString('hex'),
  });
}

function createSignedCert(
  cn: string,
  serverKeyPair: { publicKey: string; privateKey: string },
  caPrivateKey: string,
  _caCertPem: string,
  days: number,
): string {
  return createX509Cert({
    subject: `CN=${cn}`,
    issuer: `CN=Test CA`,
    publicKey: serverKeyPair.publicKey,
    signingKey: caPrivateKey,
    days,
    isCA: false,
    serialNumber: crypto.randomBytes(16).toString('hex'),
  });
}

function createX509Cert(params: {
  subject: string;
  issuer: string;
  publicKey: string;
  signingKey: string;
  days: number;
  isCA: boolean;
  serialNumber: string;
}): string {
  const notBefore = new Date();
  notBefore.setMinutes(notBefore.getMinutes() - 5);
  const notAfter = new Date();
  notAfter.setDate(notAfter.getDate() + params.days);

  const pubKeyObj = crypto.createPublicKey(params.publicKey);
  const privKeyObj = crypto.createPrivateKey(params.signingKey);

  const tbsCert = buildTBSCertificate({
    serialNumber: params.serialNumber,
    issuer: params.issuer,
    subject: params.subject,
    notBefore,
    notAfter,
    publicKeyDer: pubKeyObj.export({ type: 'spki', format: 'der' }),
    isCA: params.isCA,
  });

  const sign = crypto.createSign('SHA256');
  sign.update(tbsCert);
  const signature = sign.sign(privKeyObj);

  const certDer = buildFullCertificate(tbsCert, signature);
  const certBase64 = certDer.toString('base64');
  const lines = certBase64.match(/.{1,64}/g) || [];
  return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----\n`;
}

// ─── ASN.1 DER Helpers ───────────────────────────────────────────────────────

function encodeLength(length: number): Buffer {
  if (length < 0x80) return Buffer.from([length]);
  if (length < 0x100) return Buffer.from([0x81, length]);
  if (length < 0x10000) return Buffer.from([0x82, (length >> 8) & 0xff, length & 0xff]);
  return Buffer.from([0x83, (length >> 16) & 0xff, (length >> 8) & 0xff, length & 0xff]);
}

function encodeSequence(...items: Buffer[]): Buffer {
  const content = Buffer.concat(items);
  return Buffer.concat([Buffer.from([0x30]), encodeLength(content.length), content]);
}

function encodeSet(...items: Buffer[]): Buffer {
  const content = Buffer.concat(items);
  return Buffer.concat([Buffer.from([0x31]), encodeLength(content.length), content]);
}

function encodeInteger(value: Buffer): Buffer {
  let v = value;
  if (v[0] & 0x80) v = Buffer.concat([Buffer.from([0x00]), v]);
  return Buffer.concat([Buffer.from([0x02]), encodeLength(v.length), v]);
}

function encodeOID(oid: string): Buffer {
  const parts = oid.split('.').map(Number);
  const bytes: number[] = [parts[0] * 40 + parts[1]];
  for (let i = 2; i < parts.length; i++) {
    let val = parts[i];
    if (val < 128) {
      bytes.push(val);
    } else {
      const encoded: number[] = [val & 0x7f];
      val >>= 7;
      while (val > 0) {
        encoded.push((val & 0x7f) | 0x80);
        val >>= 7;
      }
      encoded.reverse();
      bytes.push(...encoded);
    }
  }
  const buf = Buffer.from(bytes);
  return Buffer.concat([Buffer.from([0x06]), encodeLength(buf.length), buf]);
}

function encodeUTF8String(str: string): Buffer {
  const buf = Buffer.from(str, 'utf8');
  return Buffer.concat([Buffer.from([0x0c]), encodeLength(buf.length), buf]);
}

function encodeBitString(data: Buffer): Buffer {
  const content = Buffer.concat([Buffer.from([0x00]), data]);
  return Buffer.concat([Buffer.from([0x03]), encodeLength(content.length), content]);
}

function encodeUTCTime(date: Date): Buffer {
  const y = date.getUTCFullYear() % 100;
  const str =
    String(y).padStart(2, '0') +
    String(date.getUTCMonth() + 1).padStart(2, '0') +
    String(date.getUTCDate()).padStart(2, '0') +
    String(date.getUTCHours()).padStart(2, '0') +
    String(date.getUTCMinutes()).padStart(2, '0') +
    String(date.getUTCSeconds()).padStart(2, '0') +
    'Z';
  const buf = Buffer.from(str, 'ascii');
  return Buffer.concat([Buffer.from([0x17]), encodeLength(buf.length), buf]);
}

function encodeExplicit(tag: number, content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([0xa0 | tag]), encodeLength(content.length), content]);
}

function encodeName(dn: string): Buffer {
  const match = dn.match(/CN=(.+)/);
  const cn = match ? match[1] : dn;
  const cnOid = encodeOID('2.5.4.3');
  const cnValue = encodeUTF8String(cn);
  const attrTypeAndValue = encodeSequence(cnOid, cnValue);
  const rdn = encodeSet(attrTypeAndValue);
  return encodeSequence(rdn);
}

function buildTBSCertificate(params: {
  serialNumber: string;
  issuer: string;
  subject: string;
  notBefore: Date;
  notAfter: Date;
  publicKeyDer: Buffer;
  isCA: boolean;
}): Buffer {
  const version = encodeExplicit(0, encodeInteger(Buffer.from([0x02])));
  const serialBuf = Buffer.from(params.serialNumber, 'hex');
  const serial = encodeInteger(serialBuf);
  const sigAlg = encodeSequence(encodeOID('1.2.840.113549.1.1.11'), Buffer.from([0x05, 0x00]));
  const issuer = encodeName(params.issuer);
  const validity = encodeSequence(encodeUTCTime(params.notBefore), encodeUTCTime(params.notAfter));
  const subject = encodeName(params.subject);
  const spki = params.publicKeyDer;
  const extensions: Buffer[] = [];

  if (params.isCA) {
    const basicConstraintsOid = encodeOID('2.5.29.19');
    const basicConstraintsValue = encodeSequence(Buffer.from([0x01, 0x01, 0xff]));
    const basicConstraintsExtValue = Buffer.concat([
      Buffer.from([0x04]),
      encodeLength(basicConstraintsValue.length),
      basicConstraintsValue,
    ]);
    const critical = Buffer.from([0x01, 0x01, 0xff]);
    extensions.push(encodeSequence(basicConstraintsOid, critical, basicConstraintsExtValue));
  }

  const tbsItems = [version, serial, sigAlg, issuer, validity, subject, spki];
  if (extensions.length > 0) {
    const extsSeq = encodeSequence(...extensions);
    const extsExplicit = encodeExplicit(3, extsSeq);
    tbsItems.push(extsExplicit);
  }

  return encodeSequence(...tbsItems);
}

function buildFullCertificate(tbsCert: Buffer, signature: Buffer): Buffer {
  const sigAlg = encodeSequence(encodeOID('1.2.840.113549.1.1.11'), Buffer.from([0x05, 0x00]));
  const sigBitString = encodeBitString(signature);
  return encodeSequence(tbsCert, sigAlg, sigBitString);
}

// ─── Custom Arbitraries ──────────────────────────────────────────────────────

/**
 * Generates a daysUntilExpiry value in the "no alert" range (> 30 days).
 */
const noAlertDaysArb = fc.integer({ min: 31, max: 365 });

/**
 * Generates a daysUntilExpiry value in the "warning" range (8..30 days inclusive).
 * The implementation uses Math.floor, so days in (7, 30] triggers warning.
 * With our mock returning exactly daysFromNow days, 8-30 lands in warning zone.
 */
const warningDaysArb = fc.integer({ min: 8, max: 30 });

/**
 * Generates a daysUntilExpiry value in the "critical" range (≤ 7 days).
 * Includes negative values (already expired) and zero.
 */
const criticalDaysArb = fc.integer({ min: -30, max: 7 });

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Property 5: Certificate Expiry Detection', () => {
  /**
   * Strategy: We generate ONE set of long-lived certificates at suite setup
   * to make CertificateManager load them. Then for each property test iteration,
   * we spy on crypto.X509Certificate to return a controlled validTo date.
   * This avoids the cost of generating new RSA key pairs per iteration.
   */

  let tmpDir: string;
  let certPaths: { caCertPath: string; serverCertPath: string; serverKeyPath: string };
  let sharedPubKeyDer: Buffer;
  let sharedPrivKeyObj: crypto.KeyObject;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cert-expiry-prop-'));
    certPaths = generateLongLivedCerts(tmpDir);
    // Pre-generate a single key pair and cache derived objects for fast cert creation
    const keyPair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    sharedPubKeyDer = crypto.createPublicKey(keyPair.publicKey).export({ type: 'spki', format: 'der' });
    sharedPrivKeyObj = crypto.createPrivateKey(keyPair.privateKey);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Creates a CertificateManager with real certs loaded, then directly
   * replaces the internal cert buffer with one that has the desired expiry.
   * The manager is created fresh per iteration to avoid stale state, but
   * cert generation is fast since we pre-cached the key pair.
   */
  function setupManagerAndMockExpiry(daysFromNow: number): CertificateManager {
    const config: TLSConfig = {
      enabled: true,
      postgres: {
        caPath: certPaths.caCertPath,
        certPath: certPaths.serverCertPath,
        keyPath: certPaths.serverKeyPath,
      },
      minio: {},
      redis: {},
      rejectUnauthorized: true,
      watchIntervalMs: 30000,
      expiryWarningDays: EXPIRY_WARNING_DAYS,
      expiryCriticalDays: EXPIRY_CRITICAL_DAYS,
    };

    // Create manager — this loads real certs
    const manager = new CertificateManager(config);

    // Generate a cert with the desired expiry and replace the loaded cert buffer.
    const now = new Date();
    const targetExpiry = new Date(now.getTime());
    // Add exactly daysFromNow days worth of milliseconds, plus 12 hours
    // to ensure Math.floor gives us exactly daysFromNow
    targetExpiry.setTime(now.getTime() + daysFromNow * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000);

    const notBefore = new Date();
    notBefore.setFullYear(notBefore.getFullYear() - 1);

    // Create a cert PEM with the controlled notAfter
    const certPem = createCertWithExactDates(notBefore, targetExpiry);

    // Directly set the internal cert buffer (access private field for testing)
    (manager as any).postgresCerts = {
      ...(manager as any).postgresCerts,
      cert: Buffer.from(certPem),
    };

    return manager;
  }

  /**
   * Creates a self-signed certificate with exact notBefore/notAfter dates.
   * Uses pre-cached key objects so only the signing step runs per iteration.
   */
  function createCertWithExactDates(notBefore: Date, notAfter: Date): string {
    const tbsCert = buildTBSCertificate({
      serialNumber: crypto.randomBytes(16).toString('hex'),
      issuer: 'CN=Test CA',
      subject: 'CN=localhost',
      notBefore,
      notAfter,
      publicKeyDer: sharedPubKeyDer,
      isCA: false,
    });

    const sign = crypto.createSign('SHA256');
    sign.update(tbsCert);
    const signature = sign.sign(sharedPrivKeyObj);

    const certDer = buildFullCertificate(tbsCert, signature);
    const certBase64 = certDer.toString('base64');
    const lines = certBase64.match(/.{1,64}/g) || [];
    return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----\n`;
  }

  describe('Certificates with more than 30 days remaining produce no notification (Req 7.4, 7.5)', () => {
    it('for any daysUntilExpiry > 30, no warning or critical is logged', () => {
      fc.assert(
        fc.property(noAlertDaysArb, (daysFromNow) => {
          vi.clearAllMocks();

          const manager = setupManagerAndMockExpiry(daysFromNow);
          manager.checkCertificateExpiry();

          // No warning should have been logged
          expect(mockLogger.warn).not.toHaveBeenCalled();
          // No critical alert should have been logged (via logger.error with CRITICAL)
          const criticalCalls = mockLogger.error.mock.calls.filter(
            (call: any[]) =>
              typeof call[0] === 'string' && call[0].includes('CRITICAL'),
          );
          expect(criticalCalls.length).toBe(0);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('Certificates expiring within 30 days but more than 7 days produce warning (Req 7.4)', () => {
    it('for any 7 < daysUntilExpiry <= 30, a warning is logged (not critical)', () => {
      fc.assert(
        fc.property(warningDaysArb, (daysFromNow) => {
          vi.clearAllMocks();

          const manager = setupManagerAndMockExpiry(daysFromNow);
          manager.checkCertificateExpiry();

          // Warning SHOULD have been logged
          expect(mockLogger.warn).toHaveBeenCalled();
          const warnCall = mockLogger.warn.mock.calls[0];
          expect(warnCall[0]).toContain('WARNING');
          expect(warnCall[0]).toContain('expires in');

          // Critical should NOT have been logged
          const criticalCalls = mockLogger.error.mock.calls.filter(
            (call: any[]) =>
              typeof call[0] === 'string' && call[0].includes('CRITICAL'),
          );
          expect(criticalCalls.length).toBe(0);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('Certificates expiring within 7 days or fewer produce critical alert (Req 7.5)', () => {
    it('for any daysUntilExpiry <= 7, a critical alert is logged', () => {
      fc.assert(
        fc.property(criticalDaysArb, (daysFromNow) => {
          vi.clearAllMocks();

          const manager = setupManagerAndMockExpiry(daysFromNow);
          manager.checkCertificateExpiry();

          // Critical alert is logged via logger.error with severity: 'critical'
          const criticalErrorCalls = mockLogger.error.mock.calls.filter(
            (call: any[]) =>
              typeof call[0] === 'string' &&
              call[0].includes('CRITICAL') &&
              call[0].includes('expires in'),
          );
          expect(criticalErrorCalls.length).toBeGreaterThan(0);

          // Verify severity metadata
          const metadata = criticalErrorCalls[0][1];
          expect(metadata).toHaveProperty('severity', 'critical');

          // Warning should NOT have been called (critical takes precedence)
          expect(mockLogger.warn).not.toHaveBeenCalled();
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('Boundary conditions at threshold values', () => {
    it('exactly 7 days produces critical (not warning)', () => {
      vi.clearAllMocks();

      const manager = setupManagerAndMockExpiry(7);
      manager.checkCertificateExpiry();

      const criticalCalls = mockLogger.error.mock.calls.filter(
        (call: any[]) =>
          typeof call[0] === 'string' && call[0].includes('CRITICAL'),
      );
      expect(criticalCalls.length).toBeGreaterThan(0);
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('exactly 31 days produces no notification', () => {
      vi.clearAllMocks();

      const manager = setupManagerAndMockExpiry(31);
      manager.checkCertificateExpiry();

      expect(mockLogger.warn).not.toHaveBeenCalled();
      const criticalCalls = mockLogger.error.mock.calls.filter(
        (call: any[]) =>
          typeof call[0] === 'string' && call[0].includes('CRITICAL'),
      );
      expect(criticalCalls.length).toBe(0);
    });

    it('exactly 30 days produces warning (not critical)', () => {
      vi.clearAllMocks();

      const manager = setupManagerAndMockExpiry(30);
      manager.checkCertificateExpiry();

      expect(mockLogger.warn).toHaveBeenCalled();
      const criticalCalls = mockLogger.error.mock.calls.filter(
        (call: any[]) =>
          typeof call[0] === 'string' && call[0].includes('CRITICAL'),
      );
      expect(criticalCalls.length).toBe(0);
    });
  });
});
