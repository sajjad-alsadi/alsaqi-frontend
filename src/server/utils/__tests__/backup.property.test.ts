// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import crypto from 'crypto';

/**
 * Property Test: Backup Encryption Round-Trip Preserves Data (Property 5)
 *
 * Feature: production-readiness-review
 * Property 5: Backup encryption round-trip preserves data
 *
 * **Validates: Requirements 7.2**
 *
 * For any byte sequence, encrypting with AES-256-GCM then decrypting
 * with the same key yields the original data.
 *
 * This tests the core encryption mechanism used by the BackupScheduler
 * (matching the AES-256-GCM pattern from KeyStore and FileEncryptionService).
 */

// ─── AES-256-GCM Encrypt/Decrypt (mirrors project patterns) ─────────────────

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit authentication tag

/**
 * Encrypts a Buffer using AES-256-GCM.
 * Returns a Buffer containing: IV (12 bytes) + AuthTag (16 bytes) + Ciphertext
 */
function encryptBuffer(data: Buffer, key: Buffer): Buffer {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Format: [IV | AuthTag | Ciphertext]
  return Buffer.concat([iv, authTag, encrypted]);
}

/**
 * Decrypts a Buffer produced by encryptBuffer using AES-256-GCM.
 * Extracts IV, AuthTag, and Ciphertext from the combined buffer.
 */
function decryptBuffer(encryptedData: Buffer, key: Buffer): Buffer {
  const iv = encryptedData.subarray(0, IV_LENGTH);
  const authTag = encryptedData.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = encryptedData.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return decrypted;
}

// ─── Custom Arbitraries ──────────────────────────────────────────────────────

/** Generates a random 256-bit (32-byte) encryption key */
const aes256KeyArb = fc
  .uint8Array({ minLength: 32, maxLength: 32 })
  .map((arr) => Buffer.from(arr));

/** Generates random byte sequences of varying lengths (0 to 4096 bytes) */
const byteSequenceArb = fc
  .uint8Array({ minLength: 0, maxLength: 4096 })
  .map((arr) => Buffer.from(arr));

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Property 5: Backup encryption round-trip preserves data', () => {
  it('for any byte sequence, encrypt then decrypt with same key returns original data', () => {
    fc.assert(
      fc.property(byteSequenceArb, aes256KeyArb, (plaintext, key) => {
        const encrypted = encryptBuffer(plaintext, key);
        const decrypted = decryptBuffer(encrypted, key);

        expect(Buffer.compare(decrypted, plaintext)).toBe(0);
      }),
      { numRuns: 100 }
    );
  });

  it('encrypted output is always longer than input (IV + AuthTag overhead)', () => {
    fc.assert(
      fc.property(byteSequenceArb, aes256KeyArb, (plaintext, key) => {
        const encrypted = encryptBuffer(plaintext, key);

        // Encrypted data must include IV (12) + AuthTag (16) + ciphertext (same length as plaintext)
        expect(encrypted.length).toBe(plaintext.length + IV_LENGTH + AUTH_TAG_LENGTH);
      }),
      { numRuns: 100 }
    );
  });

  it('decryption with wrong key throws an authentication error', () => {
    fc.assert(
      fc.property(byteSequenceArb, aes256KeyArb, aes256KeyArb, (plaintext, correctKey, wrongKey) => {
        // Ensure keys are different
        fc.pre(!correctKey.equals(wrongKey));

        const encrypted = encryptBuffer(plaintext, correctKey);

        expect(() => decryptBuffer(encrypted, wrongKey)).toThrow();
      }),
      { numRuns: 100 }
    );
  });

  it('tampered ciphertext causes decryption to fail', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 1, maxLength: 4096 }).map((arr) => Buffer.from(arr)),
        aes256KeyArb,
        fc.integer({ min: 0, max: 255 }),
        (plaintext, key, xorByte) => {
          const encrypted = encryptBuffer(plaintext, key);

          // Tamper with a byte in the ciphertext portion (after IV + AuthTag)
          const tampered = Buffer.from(encrypted);
          const ciphertextOffset = IV_LENGTH + AUTH_TAG_LENGTH;
          if (tampered.length > ciphertextOffset) {
            // XOR a ciphertext byte to corrupt it (ensure it actually changes)
            const originalByte = tampered[ciphertextOffset];
            const newByte = originalByte ^ (xorByte || 1); // Ensure non-zero XOR
            if (newByte !== originalByte) {
              tampered[ciphertextOffset] = newByte;
              expect(() => decryptBuffer(tampered, key)).toThrow();
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
