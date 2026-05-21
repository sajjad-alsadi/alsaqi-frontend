// @vitest-environment jsdom
/**
 * اختبارات خصائص CryptoUtils - التشفير/فك التشفير round-trip
 *
 * **Validates: Requirements 18.1**
 *
 * الخاصية 5: لأي بيانات نصية، عند تشفيرها بواسطة CryptoUtils.encrypt
 * ثم فك تشفيرها بواسطة CryptoUtils.decrypt، يجب استعادة البيانات الأصلية بالكامل.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { CryptoUtils } from '../CryptoUtils';

describe('CryptoUtils - Property 5: التشفير/فك التشفير round-trip', () => {
  /**
   * **Validates: Requirements 18.1**
   * لأي بيانات نصية، encrypt ثم decrypt يعيد الأصل
   */
  it('encrypt then decrypt returns the original data for any string', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 0, maxLength: 500 }),
        async (plaintext) => {
          const key = await CryptoUtils.importKey('test-encryption-key-32chars!!');
          const encrypted = await CryptoUtils.encrypt(plaintext, key);
          const decrypted = await CryptoUtils.decrypt(encrypted, key);

          expect(decrypted).toBe(plaintext);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 18.1**
   * بيانات مختلفة تنتج نصوص مشفرة مختلفة
   */
  it('different inputs produce different ciphertext', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.string({ minLength: 1, maxLength: 200 }),
        async (data1, data2) => {
          fc.pre(data1 !== data2);

          const key = await CryptoUtils.importKey('test-encryption-key-32chars!!');
          const encrypted1 = await CryptoUtils.encrypt(data1, key);
          const encrypted2 = await CryptoUtils.encrypt(data2, key);

          expect(encrypted1).not.toBe(encrypted2);
        }
      ),
      { numRuns: 100 }
    );
  });
});
