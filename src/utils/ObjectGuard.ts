// ==================== ObjectGuard.ts ====================

export class ObjectGuard {
    private protectedObjects: Set<string>;
    private initialized = false;

    constructor() {
        this.protectedObjects = new Set();
        
        if (typeof window !== 'undefined' && !(window as any).__objectGuardInitialized) {
            this.protectGlobals();
            (window as any).__objectGuardInitialized = true;
            this.initialized = true;
        }
    }

    private protectGlobals() {
        // حماية JSON من التلاعب
        this.freezeMethod(JSON, 'parse');
        this.freezeMethod(JSON, 'stringify');

        // حماية console (منع إعادة تعريفها)
        try {
            Object.defineProperty(window, 'console', {
                value: console,
                writable: false,
                configurable: false
            });
        } catch (e) {
            // Ignore if already locked
        }

        // حماية Math.random (منع التنبؤ)
        try {
            const originalRandom = Math.random;
            Object.defineProperty(Math, 'random', {
                value: originalRandom,
                writable: false,
                configurable: false
            });
        } catch (e) {
            // Ignore
        }

        // حماية Web Crypto API
        if (window.crypto && window.crypto.subtle) {
            this.freezeMethod(crypto.subtle, 'encrypt');
            this.freezeMethod(crypto.subtle, 'decrypt');
            this.freezeMethod(crypto.subtle, 'sign');
            this.freezeMethod(crypto.subtle, 'verify');
        }

        // كشف محاولات التلاعب
        this.setupTamperDetection();
    }

    private freezeMethod(obj: any, methodName: string) {
        if (!obj) return;
        const descriptor = Object.getOwnPropertyDescriptor(obj, methodName);
        if (!descriptor) return;

        const original = descriptor.value;
        const objName = obj.constructor ? obj.constructor.name : 'UnknownObj';
        
        try {
            Object.defineProperty(obj, methodName, {
                ...descriptor,
                writable: false,
                configurable: false,
                value: function(...args: any[]) {
                    // تسجيل الاستخدام غير العادي
                    if ((window as any).DEBUG_MODE) {
                        console.log(`[Security] ${methodName} called on ${objName}`, args);
                    }
                    return original.apply(this, args);
                }
            });

            this.protectedObjects.add(`${objName}.${methodName}`);
        } catch (e) {
            // Ignore
        }
    }

    private setupTamperDetection() {
        // مراقبة Object.defineProperty
        const originalDefineProperty = Object.defineProperty;
        const self = this;

        try {
            Object.defineProperty = function<T>(obj: T, prop: PropertyKey, descriptor: PropertyDescriptor): T {
                // كشف محاولات إعادة تعريف الكائنات المحمية
                if (obj === JSON || obj === Math || obj === console || obj === window.crypto || (window.crypto && obj === window.crypto.subtle)) {
                    console.error(`[Security] Blocked tampering with: ${String(prop)}`);
                    self.alertTampering('global_object', { object: (obj as any).constructor ? (obj as any).constructor.name : 'Unknown', property: String(prop) });
                    throw new Error('Object modification blocked');
                }

                return originalDefineProperty.call(this, obj, prop, descriptor);
            };

            // إخفاء التغيير (لكنه لا يزال قابلاً للكشف)
            Object.defineProperty(Object, 'defineProperty', {
                writable: false,
                configurable: false
            });
        } catch (e) {
            // Some environments preventing messing with Object.defineProperty
        }
    }

    private alertTampering(type: string, details: any) {
        try {
            fetch('/api/security/tampering', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, details, timestamp: new Date().toISOString() })
            }).catch(() => {});
        } catch (e) {
             // Ignore error
        }
    }

    // حماية كائنات مخصصة
    protect(obj: any, methods: string[] = []) {
        if (!obj) return;
        
        if (methods.length === 0) {
            // تجميد الكائن بالكامل
            Object.freeze(obj);
            return;
        }

        methods.forEach(method => this.freezeMethod(obj, method));
    }
}

// يمكن تهيئة وتصدير نسخة افتراضية تعمل عند الحاجة
export const initObjectGuard = () => {
    return new ObjectGuard();
};
