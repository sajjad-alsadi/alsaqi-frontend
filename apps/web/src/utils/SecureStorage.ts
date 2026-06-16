// ==================== SecureStorage.ts ====================

import { CryptoUtils } from './CryptoUtils';

export class SecureStorage {
  private prefix: string;
  private encryptionKey: CryptoKey | null = null;
  private hmacKey: CryptoKey | null = null;
  private hmacVerifyKey: CryptoKey | null = null;
  private tamperDetection: Map<string, number>;
  private ready: Promise<void>;

  constructor(prefix: string = 'myApp') {
      this.prefix = prefix;
      this.tamperDetection = new Map();
      this.ready = this.initKeys();
      // NOTE: We intentionally do NOT override Storage.prototype methods.
      // Secure behavior is exposed only through the instance get/set/clearSession
      // methods below. Overriding global Storage primitives breaks legitimate
      // browser behavior and provides no real security (the client is not a
      // trust boundary). The Backend remains the authoritative enforcer.
  }

  private async initKeys() {
      // في الإنتاج: يفضل جلب المفتاح الملح من الخادم
      // fetch('/api/security/init').then(r => r.json())...
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const env = (import.meta as any).env as Record<string, string> | undefined;
      // Derive the key base from a STABLE source: VITE_STORAGE_SECRET + origin.
      // We deliberately exclude navigator.userAgent so a browser update (which
      // changes the user agent) does not invalidate the key and log the user out.
      const origin = typeof window !== 'undefined' ? window.location.origin : 'app';
      const baseKey = env?.['VITE_STORAGE_SECRET']
          ? `${env['VITE_STORAGE_SECRET']}-${origin}`
          : `dev-only-storage-key-${origin}`;

      this.encryptionKey = await CryptoUtils.importKey(baseKey);
      this.hmacKey = await CryptoUtils.importHMACKey(baseKey);
      this.hmacVerifyKey = this.hmacKey;
  }

  private async encrypt(data: string): Promise<string> {
      await this.ready;
      if (!this.encryptionKey) throw new Error('Security not initialized');
      return await CryptoUtils.encrypt(data, this.encryptionKey);
  }

  private async decrypt(data: string): Promise<string | null> {
      await this.ready;
      if (!this.encryptionKey) return null;
      return await CryptoUtils.decrypt(data, this.encryptionKey);
  }

  private async hash(data: string): Promise<string> {
      await this.ready;
      if (!this.hmacKey) return '0';
      return await CryptoUtils.sign(data, this.hmacKey);
  }

  private onTamperDetected(key: string, reason: string) {
      // Report the failure (best-effort) but DO NOT clear the session. A failed
      // HMAC/decrypt check is reported to the caller (get returns null); it must
      // not log the user out or wipe their data.
      this.sendSecurityAlert({
          type: 'storage_tampering',
          key,
          reason,
          timestamp: new Date().toISOString()
      });
  }

  private async sendSecurityAlert(alert: any) {
      try {
          await fetch('/api/security/alert', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(alert)
          });
      } catch {}
  }

  // ========== API عام ==========

  async set(key: string, value: any) {
      await this.ready;
      const fullKey = `${this.prefix}_${key}`;
      const serialized = JSON.stringify(value);
      const encrypted = await this.encrypt(serialized);
      const hash = await this.hash(encrypted);

      localStorage.setItem(fullKey, encrypted);
      localStorage.setItem(fullKey + '_hash', hash);

      this.tamperDetection.set(fullKey, Date.now());
  }

  async get(key: string) {
      await this.ready;
      const fullKey = `${this.prefix}_${key}`;
      const encrypted = localStorage.getItem(fullKey);

      if (!encrypted) return null;

      // Verify HMAC integrity. On failure, report and return null to the caller
      // WITHOUT clearing the session.
      const storedHash = localStorage.getItem(fullKey + '_hash');
      if (storedHash) {
          let valid = false;
          if (this.hmacVerifyKey) {
              valid = await CryptoUtils.verify(encrypted, storedHash, this.hmacVerifyKey);
          }
          if (!valid) {
              this.onTamperDetected(fullKey, 'hash_mismatch');
              return null;
          }
      }

      const decrypted = await this.decrypt(encrypted);
      if (!decrypted) {
          this.onTamperDetected(fullKey, 'decryption_failed');
          return null;
      }

      try {
          return JSON.parse(decrypted);
      } catch {
          this.onTamperDetected(fullKey, 'parse_error');
          return null;
      }
  }

  clearSession() {
      Object.keys(localStorage)
          .filter(k => k.startsWith(this.prefix + '_'))
          .forEach(k => localStorage.removeItem(k));

      sessionStorage.clear();
  }
}

export const secureStore = new SecureStorage('myApp');
