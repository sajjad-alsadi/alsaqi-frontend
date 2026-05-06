// ==================== SecureStorage.ts ====================

import { CryptoUtils } from './CryptoUtils';

export class SecureStorage {
  private prefix: string;
  private encryptionKey: CryptoKey | null = null;
  private hmacKey: CryptoKey | null = null;
  private tamperDetection: Map<string, number>;
  private ready: Promise<void>;

  constructor(prefix: string = 'myApp') {
      this.prefix = prefix;
      this.tamperDetection = new Map();
      this.ready = this.initKeys();
      this.initProtection();
  }

  private async initKeys() {
      // في الإنتاج: يفضل جلب المفتاح الملح من الخادم
      // fetch('/api/security/init').then(r => r.json())...
      const baseKey = import.meta.env.VITE_STORAGE_SECRET || (typeof navigator !== 'undefined' ? navigator.userAgent : 'fallback-secret');
      
      this.encryptionKey = await CryptoUtils.importKey(baseKey);
      this.hmacKey = await CryptoUtils.importHMACKey(baseKey);
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

  private initProtection() {
      // حماية التخزين الأصلي (نفس المنطق لكن مع دعم الوعود)
      const original = {
          getItem: Storage.prototype.getItem,
          setItem: Storage.prototype.setItem,
          removeItem: Storage.prototype.removeItem
      };

      const self = this;
      
      // ملاحظة: لا يمكن تغيير getItem لتكون async فعلياً لأنها خاصية موروثة تعتمد عليها المتصفحات
      // لكن يمكننا كشف التلاعب عند الاستدعاء
      Storage.prototype.getItem = function(key: string) {
          const value = original.getItem.call(this, key);
          
          if (key && key.startsWith(self.prefix + '_')) {
              const storedHash = original.getItem.call(this, key + '_hash');
              if (storedHash && value) {
                  // نتحقق بشكل غير متزامن في الخلفية لعدم تعطيل الـ UI
                  self.hash(value).then(h => {
                      if (h !== storedHash) {
                          console.error(`[Security] Tampering detected on key: ${key}`);
                          self.onTamperDetected(key, 'hash_mismatch');
                      }
                  });
              }
          }
          
          return value;
      };

      Storage.prototype.removeItem = function(key: string) {
          if (key && key.startsWith(self.prefix + '_') && !key.endsWith('_hash')) {
              const protectedKeys = ['user_token', 'session_data', 'config'];
              const baseKey = key.replace(self.prefix + '_', '');
              
              if (protectedKeys.includes(baseKey)) {
                  console.warn(`[Security] Blocked unauthorized removal of: ${key}`);
                  self.onTamperDetected(key, 'removal_blocked');
                  return;
              }
          }
          return original.removeItem.call(this, key);
      };
  }

  private onTamperDetected(key: string, reason: string) {
      this.sendSecurityAlert({
          type: 'storage_tampering',
          key,
          reason,
          timestamp: new Date().toISOString()
      });
      this.clearSession();
  }

  private async sendSecurityAlert(alert: any) {
      try {
          await fetch('/api/security/alert', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(alert)
          });
      } catch (e) {}
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

      const lastAccess = this.tamperDetection.get(fullKey);
      if (lastAccess && Date.now() - lastAccess < 100) {
          console.warn(`[Security] Rapid access detected on: ${key}`);
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
