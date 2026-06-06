import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CertificateManager } from '../certificate-manager.js';
import type { TLSConfig } from '../../config/tls.config.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

/**
 * Helper to generate self-signed CA and server cert using Node.js crypto module.
 * No external tools (openssl) required.
 */
function generateTestCertificates(tmpDir: string) {
  // Generate CA key pair
  const caKeyPair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  // Self-signed CA cert
  const caCertPem = generateSelfSignedCert('Test CA', caKeyPair, 365);

  // Generate server key pair
  const serverKeyPair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  // Generate server cert signed by CA
  const serverCertPem = generateSignedCert(
    'localhost',
    serverKeyPair,
    caKeyPair.privateKey,
    caCertPem,
    365,
  );

  const caCertPath = path.join(tmpDir, 'ca.crt');
  const caKeyPath = path.join(tmpDir, 'ca.key');
  const serverCertPath = path.join(tmpDir, 'server.crt');
  const serverKeyPath = path.join(tmpDir, 'server.key');

  fs.writeFileSync(caCertPath, caCertPem);
  fs.writeFileSync(caKeyPath, caKeyPair.privateKey);
  fs.writeFileSync(serverCertPath, serverCertPem);
  fs.writeFileSync(serverKeyPath, serverKeyPair.privateKey);

  return { caCertPath, caKeyPath, serverCertPath, serverKeyPath };
}

/**
 * Generate a self-signed X.509 certificate using Node.js crypto.
 */
function generateSelfSignedCert(
  cn: string,
  keyPair: { publicKey: string; privateKey: string },
  days: number,
): string {
  const cert = createX509Cert({
    subject: `CN=${cn}`,
    issuer: `CN=${cn}`,
    publicKey: keyPair.publicKey,
    signingKey: keyPair.privateKey,
    days,
    isCA: true,
    serialNumber: randomSerialNumber(),
  });
  return cert;
}

/**
 * Generate a certificate signed by a CA.
 */
function generateSignedCert(
  cn: string,
  serverKeyPair: { publicKey: string; privateKey: string },
  caPrivateKey: string,
  caCertPem: string,
  days: number,
): string {
  const caCert = new crypto.X509Certificate(caCertPem);
  const cert = createX509Cert({
    subject: `CN=${cn}`,
    issuer: caCert.subject,
    publicKey: serverKeyPair.publicKey,
    signingKey: caPrivateKey,
    days,
    isCA: false,
    serialNumber: randomSerialNumber(),
  });
  return cert;
}

function randomSerialNumber(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Create an X.509 certificate using the low-level ASN.1 DER encoding.
 * This avoids the need for openssl CLI.
 */
function createX509Cert(params: {
  subject: string;
  issuer: string;
  publicKey: string;
  signingKey: string;
  days: number;
  isCA: boolean;
  serialNumber: string;
}): string {
  // Use Node.js 19+ crypto.X509Certificate if available, otherwise forge a cert
  // For tests, we'll use a simplified approach with Node's built-in createSign

  // Build the TBS (To-Be-Signed) certificate structure
  const notBefore = new Date();
  const notAfter = new Date();
  notAfter.setDate(notAfter.getDate() + params.days);

  // Parse the public key
  const pubKeyObj = crypto.createPublicKey(params.publicKey);
  const privKeyObj = crypto.createPrivateKey(params.signingKey);

  // We'll use a direct DER construction approach
  const tbsCert = buildTBSCertificate({
    serialNumber: params.serialNumber,
    issuer: params.issuer,
    subject: params.subject,
    notBefore,
    notAfter,
    publicKeyDer: pubKeyObj.export({ type: 'spki', format: 'der' }),
    isCA: params.isCA,
  });

  // Sign the TBS certificate
  const sign = crypto.createSign('SHA256');
  sign.update(tbsCert);
  const signature = sign.sign(privKeyObj);

  // Build the full certificate DER
  const certDer = buildFullCertificate(tbsCert, signature);

  // Convert to PEM
  const certBase64 = certDer.toString('base64');
  const lines = certBase64.match(/.{1,64}/g) || [];
  return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----\n`;
}

// ASN.1 DER encoding helpers
function encodeLength(length: number): Buffer {
  if (length < 0x80) {
    return Buffer.from([length]);
  } else if (length < 0x100) {
    return Buffer.from([0x81, length]);
  } else if (length < 0x10000) {
    return Buffer.from([0x82, (length >> 8) & 0xff, length & 0xff]);
  } else {
    return Buffer.from([0x83, (length >> 16) & 0xff, (length >> 8) & 0xff, length & 0xff]);
  }
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
  // If high bit is set, prepend a 0x00 byte
  let v = value;
  if (v[0] & 0x80) {
    v = Buffer.concat([Buffer.from([0x00]), v]);
  }
  return Buffer.concat([Buffer.from([0x02]), encodeLength(v.length), v]);
}

function encodeOID(oid: string): Buffer {
  const parts = oid.split('.').map(Number);
  const bytes: number[] = [];
  bytes.push(parts[0] * 40 + parts[1]);
  for (let i = 2; i < parts.length; i++) {
    let val = parts[i];
    if (val < 128) {
      bytes.push(val);
    } else {
      const encoded: number[] = [];
      encoded.push(val & 0x7f);
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
  // Prepend unused bits count (0)
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
  return Buffer.concat([
    Buffer.from([0xa0 | tag]),
    encodeLength(content.length),
    content,
  ]);
}

function encodeName(dn: string): Buffer {
  // Parse simple "CN=value" format
  const match = dn.match(/CN=(.+)/);
  const cn = match ? match[1] : dn;

  // OID for CN = 2.5.4.3
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
  // Version: v3 (2)
  const version = encodeExplicit(0, encodeInteger(Buffer.from([0x02])));

  // Serial number
  const serialBuf = Buffer.from(params.serialNumber, 'hex');
  const serial = encodeInteger(serialBuf);

  // Signature algorithm: SHA256 with RSA (1.2.840.113549.1.1.11)
  const sigAlg = encodeSequence(
    encodeOID('1.2.840.113549.1.1.11'),
    Buffer.from([0x05, 0x00]), // NULL
  );

  // Issuer
  const issuer = encodeName(params.issuer);

  // Validity
  const validity = encodeSequence(
    encodeUTCTime(params.notBefore),
    encodeUTCTime(params.notAfter),
  );

  // Subject
  const subject = encodeName(params.subject);

  // Subject Public Key Info (already DER encoded from export)
  const spki = params.publicKeyDer;

  // Extensions (v3)
  const extensions: Buffer[] = [];

  if (params.isCA) {
    // Basic Constraints: CA=TRUE
    const basicConstraintsOid = encodeOID('2.5.29.19');
    const basicConstraintsValue = encodeSequence(
      Buffer.from([0x01, 0x01, 0xff]), // BOOLEAN TRUE
    );
    const basicConstraintsExtValue = Buffer.concat([
      Buffer.from([0x04]),
      encodeLength(basicConstraintsValue.length),
      basicConstraintsValue,
    ]);
    const critical = Buffer.from([0x01, 0x01, 0xff]); // BOOLEAN TRUE
    extensions.push(encodeSequence(basicConstraintsOid, critical, basicConstraintsExtValue));
  }

  let tbsItems = [version, serial, sigAlg, issuer, validity, subject, spki];

  if (extensions.length > 0) {
    const extsSeq = encodeSequence(...extensions);
    const extsExplicit = encodeExplicit(3, extsSeq);
    tbsItems.push(extsExplicit);
  }

  return encodeSequence(...tbsItems);
}

function buildFullCertificate(tbsCert: Buffer, signature: Buffer): Buffer {
  // Signature algorithm: SHA256 with RSA
  const sigAlg = encodeSequence(
    encodeOID('1.2.840.113549.1.1.11'),
    Buffer.from([0x05, 0x00]), // NULL
  );

  const sigBitString = encodeBitString(signature);

  return encodeSequence(tbsCert, sigAlg, sigBitString);
}

describe('CertificateManager', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cert-manager-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /**
   * Helper to generate certificates with a specific expiry (days from now).
   * Used for expiry detection tests.
   */
  function generateCertsWithExpiry(dir: string, days: number) {
    const caKeyPair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const caCertPem = generateSelfSignedCert('Test CA', caKeyPair, 365);

    const serverKeyPair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const serverCertPem = generateSignedCert(
      'localhost',
      serverKeyPair,
      caKeyPair.privateKey,
      caCertPem,
      days,
    );

    const caCertPath = path.join(dir, `ca-expiry-${days}.crt`);
    const serverCertPath = path.join(dir, `server-expiry-${days}.crt`);
    const serverKeyPath = path.join(dir, `server-expiry-${days}.key`);

    fs.writeFileSync(caCertPath, caCertPem);
    fs.writeFileSync(serverCertPath, serverCertPem);
    fs.writeFileSync(serverKeyPath, serverKeyPair.privateKey);

    return { caCertPath, serverCertPath, serverKeyPath };
  }

  describe('constructor and system CA fallback', () => {
    it('should return rejectUnauthorized config when no custom certs are configured', () => {
      const config: TLSConfig = {
        enabled: true,
        postgres: {},
        minio: {},
        redis: {},
        rejectUnauthorized: true,
        watchIntervalMs: 30000,
        expiryWarningDays: 30,
        expiryCriticalDays: 7,
      };

      const manager = new CertificateManager(config);

      const pgConfig = manager.getPostgresSSLConfig();
      expect(pgConfig).toEqual({ rejectUnauthorized: true });
      expect(pgConfig.ca).toBeUndefined();
      expect(pgConfig.cert).toBeUndefined();
      expect(pgConfig.key).toBeUndefined();
    });

    it('should fall back to system CA for MinIO when no custom certs configured', () => {
      const config: TLSConfig = {
        enabled: true,
        postgres: {},
        minio: {},
        redis: {},
        rejectUnauthorized: true,
        watchIntervalMs: 30000,
        expiryWarningDays: 30,
        expiryCriticalDays: 7,
      };

      const manager = new CertificateManager(config);

      const minioConfig = manager.getMinioSSLConfig();
      expect(minioConfig).toEqual({ secure: true });
      expect(minioConfig.ca).toBeUndefined();
    });

    it('should fall back to system CA for Redis when no custom certs configured', () => {
      const config: TLSConfig = {
        enabled: true,
        postgres: {},
        minio: {},
        redis: {},
        rejectUnauthorized: true,
        watchIntervalMs: 30000,
        expiryWarningDays: 30,
        expiryCriticalDays: 7,
      };

      const manager = new CertificateManager(config);

      const redisConfig = manager.getRedisSSLConfig();
      expect(redisConfig).toEqual({ tls: { rejectUnauthorized: true } });
    });

    it('should set secure: false for MinIO when TLS is disabled and no custom certs', () => {
      const config: TLSConfig = {
        enabled: false,
        postgres: {},
        minio: {},
        redis: {},
        rejectUnauthorized: true,
        watchIntervalMs: 30000,
        expiryWarningDays: 30,
        expiryCriticalDays: 7,
      };

      const manager = new CertificateManager(config);
      expect(manager.getMinioSSLConfig().secure).toBe(false);
    });
  });

  describe('certificate loading with valid certs', () => {
    it('should load and validate certificates for PostgreSQL', () => {
      const certs = generateTestCertificates(tmpDir);

      const config: TLSConfig = {
        enabled: true,
        postgres: {
          caPath: certs.caCertPath,
          certPath: certs.serverCertPath,
          keyPath: certs.serverKeyPath,
        },
        minio: {},
        redis: {},
        rejectUnauthorized: true,
        watchIntervalMs: 30000,
        expiryWarningDays: 30,
        expiryCriticalDays: 7,
      };

      const manager = new CertificateManager(config);
      const pgConfig = manager.getPostgresSSLConfig();

      expect(pgConfig.rejectUnauthorized).toBe(true);
      expect(pgConfig.ca).toBeInstanceOf(Buffer);
      expect(pgConfig.cert).toBeInstanceOf(Buffer);
      expect(pgConfig.key).toBeInstanceOf(Buffer);
    });

    it('should load certificates for MinIO and set secure: true', () => {
      const certs = generateTestCertificates(tmpDir);

      const config: TLSConfig = {
        enabled: true,
        postgres: {},
        minio: {
          caPath: certs.caCertPath,
          certPath: certs.serverCertPath,
          keyPath: certs.serverKeyPath,
        },
        redis: {},
        rejectUnauthorized: true,
        watchIntervalMs: 30000,
        expiryWarningDays: 30,
        expiryCriticalDays: 7,
      };

      const manager = new CertificateManager(config);
      const minioConfig = manager.getMinioSSLConfig();

      expect(minioConfig.secure).toBe(true);
      expect(minioConfig.ca).toBeInstanceOf(Buffer);
      expect(minioConfig.cert).toBeInstanceOf(Buffer);
      expect(minioConfig.key).toBeInstanceOf(Buffer);
    });

    it('should load certificates for Redis', () => {
      const certs = generateTestCertificates(tmpDir);

      const config: TLSConfig = {
        enabled: true,
        postgres: {},
        minio: {},
        redis: {
          caPath: certs.caCertPath,
          certPath: certs.serverCertPath,
          keyPath: certs.serverKeyPath,
        },
        rejectUnauthorized: true,
        watchIntervalMs: 30000,
        expiryWarningDays: 30,
        expiryCriticalDays: 7,
      };

      const manager = new CertificateManager(config);
      const redisConfig = manager.getRedisSSLConfig();

      expect(redisConfig.tls.rejectUnauthorized).toBe(true);
      expect(redisConfig.tls.ca).toBeInstanceOf(Buffer);
      expect(redisConfig.tls.cert).toBeInstanceOf(Buffer);
      expect(redisConfig.tls.key).toBeInstanceOf(Buffer);
    });
  });

  describe('certificate chain validation', () => {
    it('should reject a cert not signed by the provided CA', () => {
      // Generate two independent CA/cert pairs
      const certs1 = generateTestCertificates(tmpDir);
      const tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'cert-manager-test2-'));
      const certs2 = generateTestCertificates(tmpDir2);

      const config: TLSConfig = {
        enabled: true,
        postgres: {
          caPath: certs1.caCertPath, // CA from first set
          certPath: certs2.serverCertPath, // Cert from second set (not signed by first CA)
          keyPath: certs2.serverKeyPath,
        },
        minio: {},
        redis: {},
        rejectUnauthorized: true,
        watchIntervalMs: 30000,
        expiryWarningDays: 30,
        expiryCriticalDays: 7,
      };

      const manager = new CertificateManager(config);
      const pgConfig = manager.getPostgresSSLConfig();

      // Should fall back since chain validation failed
      expect(pgConfig.ca).toBeUndefined();
      expect(pgConfig.cert).toBeUndefined();
      expect(pgConfig.key).toBeUndefined();
      expect(pgConfig.rejectUnauthorized).toBe(true);

      fs.rmSync(tmpDir2, { recursive: true, force: true });
    });

    it('should validate a proper CA → cert chain', () => {
      const certs = generateTestCertificates(tmpDir);

      const ca = fs.readFileSync(certs.caCertPath);
      const cert = fs.readFileSync(certs.serverCertPath);

      const config: TLSConfig = {
        enabled: true,
        postgres: {},
        minio: {},
        redis: {},
        rejectUnauthorized: true,
        watchIntervalMs: 30000,
        expiryWarningDays: 30,
        expiryCriticalDays: 7,
      };

      const manager = new CertificateManager(config);
      expect(manager.validateCertificateChain(ca, cert)).toBe(true);
    });

    it('should return false for invalid PEM data', () => {
      const config: TLSConfig = {
        enabled: true,
        postgres: {},
        minio: {},
        redis: {},
        rejectUnauthorized: true,
        watchIntervalMs: 30000,
        expiryWarningDays: 30,
        expiryCriticalDays: 7,
      };

      const manager = new CertificateManager(config);
      const invalidData = Buffer.from('not a valid certificate');
      const validCa = Buffer.from('also not valid');
      expect(manager.validateCertificateChain(validCa, invalidData)).toBe(false);
    });
  });

  describe('missing certificate files', () => {
    it('should fall back to system CA when CA file does not exist', () => {
      const config: TLSConfig = {
        enabled: true,
        postgres: {
          caPath: '/nonexistent/path/ca.crt',
          certPath: '/nonexistent/path/cert.crt',
          keyPath: '/nonexistent/path/key.pem',
        },
        minio: {},
        redis: {},
        rejectUnauthorized: true,
        watchIntervalMs: 30000,
        expiryWarningDays: 30,
        expiryCriticalDays: 7,
      };

      const manager = new CertificateManager(config);
      const pgConfig = manager.getPostgresSSLConfig();

      expect(pgConfig.ca).toBeUndefined();
      expect(pgConfig.cert).toBeUndefined();
      expect(pgConfig.rejectUnauthorized).toBe(true);
    });
  });

  describe('reloadCertificates', () => {
    it('should reload certificates from disk when files change', async () => {
      const certs = generateTestCertificates(tmpDir);

      const config: TLSConfig = {
        enabled: true,
        postgres: {
          caPath: certs.caCertPath,
          certPath: certs.serverCertPath,
          keyPath: certs.serverKeyPath,
        },
        minio: {},
        redis: {},
        rejectUnauthorized: true,
        watchIntervalMs: 30000,
        expiryWarningDays: 30,
        expiryCriticalDays: 7,
      };

      const manager = new CertificateManager(config);

      // Verify initial load
      const initialConfig = manager.getPostgresSSLConfig();
      expect(initialConfig.ca).toBeInstanceOf(Buffer);

      // Reload should succeed without error
      await manager.reloadCertificates();
      const reloadedConfig = manager.getPostgresSSLConfig();
      expect(reloadedConfig.ca).toBeInstanceOf(Buffer);
    });

    it('should retain old certificate if new one fails validation', async () => {
      const certs = generateTestCertificates(tmpDir);

      const config: TLSConfig = {
        enabled: true,
        postgres: {
          caPath: certs.caCertPath,
          certPath: certs.serverCertPath,
          keyPath: certs.serverKeyPath,
        },
        minio: {},
        redis: {},
        rejectUnauthorized: true,
        watchIntervalMs: 30000,
        expiryWarningDays: 30,
        expiryCriticalDays: 7,
      };

      const manager = new CertificateManager(config);

      // Verify initial load
      const initialCa = manager.getPostgresSSLConfig().ca;
      expect(initialCa).toBeInstanceOf(Buffer);

      // Corrupt the cert file (write invalid PEM)
      fs.writeFileSync(certs.serverCertPath, '-----BEGIN CERTIFICATE-----\ninvalid\n-----END CERTIFICATE-----\n');

      // Reload — validation will fail, should retain old certs
      await manager.reloadCertificates();
      const afterReload = manager.getPostgresSSLConfig();
      expect(afterReload.ca).toBeInstanceOf(Buffer);
      expect(afterReload.ca).toEqual(initialCa);
    });
  });

  describe('startWatching and stopWatching', () => {
    it('should start and stop file watchers without error', () => {
      const certs = generateTestCertificates(tmpDir);

      const config: TLSConfig = {
        enabled: true,
        postgres: {
          caPath: certs.caCertPath,
          certPath: certs.serverCertPath,
          keyPath: certs.serverKeyPath,
        },
        minio: {},
        redis: {},
        rejectUnauthorized: true,
        watchIntervalMs: 30000,
        expiryWarningDays: 30,
        expiryCriticalDays: 7,
      };

      const manager = new CertificateManager(config);

      // Should not throw
      expect(() => manager.startWatching()).not.toThrow();
      expect(() => manager.stopWatching()).not.toThrow();
    });

    it('should not fail when starting watchers with no configured paths', () => {
      const config: TLSConfig = {
        enabled: true,
        postgres: {},
        minio: {},
        redis: {},
        rejectUnauthorized: true,
        watchIntervalMs: 30000,
        expiryWarningDays: 30,
        expiryCriticalDays: 7,
      };

      const manager = new CertificateManager(config);
      expect(() => manager.startWatching()).not.toThrow();
      expect(() => manager.stopWatching()).not.toThrow();
    });
  });

  describe('partial certificate configuration', () => {
    it('should load only CA without cert and key', () => {
      const certs = generateTestCertificates(tmpDir);

      const config: TLSConfig = {
        enabled: true,
        postgres: {
          caPath: certs.caCertPath,
        },
        minio: {},
        redis: {},
        rejectUnauthorized: true,
        watchIntervalMs: 30000,
        expiryWarningDays: 30,
        expiryCriticalDays: 7,
      };

      const manager = new CertificateManager(config);
      const pgConfig = manager.getPostgresSSLConfig();

      // CA only, no chain validation needed (no cert to check against)
      expect(pgConfig.ca).toBeInstanceOf(Buffer);
      expect(pgConfig.cert).toBeUndefined();
      expect(pgConfig.key).toBeUndefined();
    });
  });

  describe('certificate expiry detection', () => {
    it('should log a warning when certificate expires within 30 days but more than 7 days', async () => {
      const { default: loggerModule } = await import('../../utils/logger.js');
      const warnSpy = vi.spyOn(loggerModule, 'warn');

      // Generate cert expiring in 15 days
      const certs = generateCertsWithExpiry(tmpDir, 15);

      const config: TLSConfig = {
        enabled: true,
        postgres: {
          caPath: certs.caCertPath,
          certPath: certs.serverCertPath,
          keyPath: certs.serverKeyPath,
        },
        minio: {},
        redis: {},
        rejectUnauthorized: true,
        watchIntervalMs: 30000,
        expiryWarningDays: 30,
        expiryCriticalDays: 7,
      };

      const manager = new CertificateManager(config);
      manager.checkCertificateExpiry();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('WARNING: Certificate for'),
        expect.objectContaining({
          service: 'postgres',
          daysUntilExpiry: expect.any(Number),
        }),
      );

      // Verify it's in the warning zone (8-30 days)
      const callArgs = warnSpy.mock.calls[0];
      const metadata = callArgs[1] as { daysUntilExpiry: number };
      expect(metadata.daysUntilExpiry).toBeGreaterThan(7);
      expect(metadata.daysUntilExpiry).toBeLessThanOrEqual(30);

      warnSpy.mockRestore();
    });

    it('should log a critical alert when certificate expires within 7 days', async () => {
      const { default: loggerModule } = await import('../../utils/logger.js');
      const errorSpy = vi.spyOn(loggerModule, 'error');

      // Generate cert expiring in 5 days
      const certs = generateCertsWithExpiry(tmpDir, 5);

      const config: TLSConfig = {
        enabled: true,
        postgres: {
          caPath: certs.caCertPath,
          certPath: certs.serverCertPath,
          keyPath: certs.serverKeyPath,
        },
        minio: {},
        redis: {},
        rejectUnauthorized: true,
        watchIntervalMs: 30000,
        expiryWarningDays: 30,
        expiryCriticalDays: 7,
      };

      const manager = new CertificateManager(config);
      manager.checkCertificateExpiry();

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('CRITICAL: Certificate for'),
        expect.objectContaining({
          service: 'postgres',
          daysUntilExpiry: expect.any(Number),
          severity: 'critical',
        }),
      );

      // Verify it's in the critical zone (<=7 days)
      const critCall = errorSpy.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('CRITICAL'),
      );
      expect(critCall).toBeDefined();
      const metadata = critCall![1] as { daysUntilExpiry: number };
      expect(metadata.daysUntilExpiry).toBeLessThanOrEqual(7);

      errorSpy.mockRestore();
    });

    it('should not log any expiry notification when certificate expires in more than 30 days', async () => {
      const { default: loggerModule } = await import('../../utils/logger.js');
      const warnSpy = vi.spyOn(loggerModule, 'warn');
      const errorSpy = vi.spyOn(loggerModule, 'error');

      // Generate cert expiring in 60 days
      const certs = generateCertsWithExpiry(tmpDir, 60);

      const config: TLSConfig = {
        enabled: true,
        postgres: {
          caPath: certs.caCertPath,
          certPath: certs.serverCertPath,
          keyPath: certs.serverKeyPath,
        },
        minio: {},
        redis: {},
        rejectUnauthorized: true,
        watchIntervalMs: 30000,
        expiryWarningDays: 30,
        expiryCriticalDays: 7,
      };

      const manager = new CertificateManager(config);
      manager.checkCertificateExpiry();

      // No warnings or critical alerts expected
      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('WARNING: Certificate for'),
        expect.anything(),
      );
      expect(errorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('CRITICAL: Certificate for'),
        expect.anything(),
      );

      warnSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('should not produce expiry notifications when no certs are loaded', async () => {
      const { default: loggerModule } = await import('../../utils/logger.js');
      const warnSpy = vi.spyOn(loggerModule, 'warn');
      const errorSpy = vi.spyOn(loggerModule, 'error');

      const config: TLSConfig = {
        enabled: true,
        postgres: {},
        minio: {},
        redis: {},
        rejectUnauthorized: true,
        watchIntervalMs: 30000,
        expiryWarningDays: 30,
        expiryCriticalDays: 7,
      };

      const manager = new CertificateManager(config);
      manager.checkCertificateExpiry();

      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('WARNING: Certificate for'),
        expect.anything(),
      );
      expect(errorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('CRITICAL: Certificate for'),
        expect.anything(),
      );

      warnSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('should check multiple services and log appropriate alerts for each', async () => {
      const { default: loggerModule } = await import('../../utils/logger.js');
      const warnSpy = vi.spyOn(loggerModule, 'warn');
      const errorSpy = vi.spyOn(loggerModule, 'error');

      // Postgres: expiring in 15 days (warning zone)
      const postgresCerts = generateCertsWithExpiry(tmpDir, 15);
      // Create a separate subdir for minio certs
      const minioDir = path.join(tmpDir, 'minio');
      fs.mkdirSync(minioDir);
      // Minio: expiring in 3 days (critical zone)
      const minioCerts = generateCertsWithExpiry(minioDir, 3);

      const config: TLSConfig = {
        enabled: true,
        postgres: {
          caPath: postgresCerts.caCertPath,
          certPath: postgresCerts.serverCertPath,
          keyPath: postgresCerts.serverKeyPath,
        },
        minio: {
          caPath: minioCerts.caCertPath,
          certPath: minioCerts.serverCertPath,
          keyPath: minioCerts.serverKeyPath,
        },
        redis: {},
        rejectUnauthorized: true,
        watchIntervalMs: 30000,
        expiryWarningDays: 30,
        expiryCriticalDays: 7,
      };

      const manager = new CertificateManager(config);
      manager.checkCertificateExpiry();

      // Should have a warning for postgres
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('WARNING: Certificate for'),
        expect.objectContaining({ service: 'postgres' }),
      );

      // Should have a critical for minio
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('CRITICAL: Certificate for'),
        expect.objectContaining({ service: 'minio', severity: 'critical' }),
      );

      warnSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });

  describe('startExpiryChecks and stopExpiryChecks', () => {
    it('should start and stop expiry checks without errors', () => {
      const config: TLSConfig = {
        enabled: true,
        postgres: {},
        minio: {},
        redis: {},
        rejectUnauthorized: true,
        watchIntervalMs: 30000,
        expiryWarningDays: 30,
        expiryCriticalDays: 7,
      };

      const manager = new CertificateManager(config);

      expect(() => manager.startExpiryChecks()).not.toThrow();
      expect(() => manager.stopExpiryChecks()).not.toThrow();
    });

    it('should run an initial check immediately on startExpiryChecks', async () => {
      const { default: loggerModule } = await import('../../utils/logger.js');
      const warnSpy = vi.spyOn(loggerModule, 'warn');

      // Generate cert expiring in 20 days (warning zone)
      const certs = generateCertsWithExpiry(tmpDir, 20);

      const config: TLSConfig = {
        enabled: true,
        postgres: {
          caPath: certs.caCertPath,
          certPath: certs.serverCertPath,
          keyPath: certs.serverKeyPath,
        },
        minio: {},
        redis: {},
        rejectUnauthorized: true,
        watchIntervalMs: 30000,
        expiryWarningDays: 30,
        expiryCriticalDays: 7,
      };

      const manager = new CertificateManager(config);
      manager.startExpiryChecks();

      // Should have produced a warning immediately
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('WARNING: Certificate for'),
        expect.objectContaining({ service: 'postgres' }),
      );

      manager.stopExpiryChecks();
      warnSpy.mockRestore();
    });

    it('should stop gracefully when called multiple times', () => {
      const config: TLSConfig = {
        enabled: true,
        postgres: {},
        minio: {},
        redis: {},
        rejectUnauthorized: true,
        watchIntervalMs: 30000,
        expiryWarningDays: 30,
        expiryCriticalDays: 7,
      };

      const manager = new CertificateManager(config);

      // Should not throw when stopping without starting
      expect(() => manager.stopExpiryChecks()).not.toThrow();

      // Start and stop twice
      manager.startExpiryChecks();
      expect(() => manager.stopExpiryChecks()).not.toThrow();
      expect(() => manager.stopExpiryChecks()).not.toThrow();
    });
  });
});
