// ==================== CryptoUtils.ts ====================

export class CryptoUtils {
    private static ALGORITHM = 'AES-GCM';
    private static KEY_LENGTH = 256;
    private static IV_LENGTH = 12; // 12 bytes for GCM is standard

    /**
     * يحوّل مفتاح نصي إلى CryptoKey للتشفير
     */
    static async importKey(rawKey: string): Promise<CryptoKey> {
        const encoder = new TextEncoder();
        const keyData = encoder.encode(rawKey.padEnd(32, '0').slice(0, 32));
        
        return crypto.subtle.importKey(
            'raw',
            keyData,
            { name: this.ALGORITHM },
            false,
            ['encrypt', 'decrypt']
        );
    }

    /**
     * يحوّل مفتاح نصي إلى CryptoKey للتوقيع (HMAC)
     */
    static async importHMACKey(rawKey: string): Promise<CryptoKey> {
        const encoder = new TextEncoder();
        const keyData = encoder.encode(rawKey);
        
        return crypto.subtle.importKey(
            'raw',
            keyData,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign', 'verify']
        );
    }

    /**
     * تشفير باستخدام AES-GCM
     */
    static async encrypt(data: string, key: CryptoKey): Promise<string> {
        const encoder = new TextEncoder();
        const iv = crypto.getRandomValues(new Uint8Array(this.IV_LENGTH));
        const encodedData = encoder.encode(data);

        const encrypted = await crypto.subtle.encrypt(
            { name: this.ALGORITHM, iv },
            key,
            encodedData
        );

        // تجميع الـ IV مع البيانات المشفرة لسهولة فك التشفير لاحقاً
        const combined = new Uint8Array(iv.length + encrypted.byteLength);
        combined.set(iv);
        combined.set(new Uint8Array(encrypted), iv.length);

        return btoa(String.fromCharCode(...combined));
    }

    /**
     * فك التشفير باستخدام AES-GCM
     */
    static async decrypt(base64Data: string, key: CryptoKey): Promise<string | null> {
        try {
            const combined = new Uint8Array(
                atob(base64Data).split('').map(c => c.charCodeAt(0))
            );
            
            const iv = combined.slice(0, this.IV_LENGTH);
            const data = combined.slice(this.IV_LENGTH);

            const decrypted = await crypto.subtle.decrypt(
                { name: this.ALGORITHM, iv },
                key,
                data
            );

            return new TextDecoder().decode(decrypted);
        } catch (e) {
            console.error('[Crypto] Decryption failed', e);
            return null;
        }
    }

    /**
     * توقيع HMAC-SHA256
     */
    static async sign(data: string, key: CryptoKey): Promise<string> {
        const encoder = new TextEncoder();
        const signature = await crypto.subtle.sign(
            'HMAC',
            key,
            encoder.encode(data)
        );
        return btoa(String.fromCharCode(...new Uint8Array(signature)));
    }

    /**
     * التحقق من توقيع HMAC-SHA256
     */
    static async verify(data: string, signature: string, key: CryptoKey): Promise<boolean> {
        const encoder = new TextEncoder();
        const signatureData = new Uint8Array(
            atob(signature).split('').map(c => c.charCodeAt(0))
        );
        
        return crypto.subtle.verify(
            'HMAC',
            key,
            signatureData,
            encoder.encode(data)
        );
    }

    /**
     * SHA-256 Hashing
     */
    static async hash(data: string): Promise<string> {
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
}
