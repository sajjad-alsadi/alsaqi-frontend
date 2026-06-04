// ==================== SecurityLogger.ts ====================

export interface SecurityLoggerConfig {
    endpoint?: string;
    flushInterval?: number;
    maxBufferSize?: number;
    onAlert?: (eventType: string, details: any) => void;
}

export class SecurityLogger {
    private endpoint: string;
    private buffer: any[];
    private flushInterval: number;
    private maxBufferSize: number;
    public onAlert?: (eventType: string, details: any) => void;

    constructor(config: SecurityLoggerConfig = {}) {
        this.endpoint = config.endpoint || '/api/security/log';
        this.buffer = [];
        this.flushInterval = config.flushInterval || 5000;
        this.maxBufferSize = config.maxBufferSize || 100;
        this.onAlert = config.onAlert;
        
        // Ensure it runs once
        if (typeof window !== 'undefined' && !(window as any).__securityLoggerInitialized) {
            this.startAutoFlush();
            this.hookConsole();
            (window as any).__securityLoggerInitialized = true;
        }
    }

    private startAutoFlush() {
        setInterval(() => this.flush(), this.flushInterval);
        
        // إرسال قبل إغلاق الصفحة
        window.addEventListener('beforeunload', () => this.flush());
    }

    private hookConsole() {
        // تسجيل الأخطاء غير المعالجة
        window.addEventListener('error', (event) => {
            this.log('javascript_error', {
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                stack: event.error?.stack
            });
        });

        // تسجيل الوعود المرفوضة غير المعالجة
        window.addEventListener('unhandledrejection', (event) => {
            this.log('unhandled_promise', {
                reason: event.reason?.message || event.reason
            });
        });
    }

    log(eventType: string, details: any, severity: 'info' | 'warn' | 'error' | 'alert' = 'info') {
        // التحقق مما إذا كان التفاصيل كائن خطأ وتحويله ليكون قابلاً للتسلسل
        const processedDetails = details instanceof Error ? {
            message: details.message,
            stack: details.stack,
            name: details.name,
            ...details
        } : details;

        const entry = {
            timestamp: new Date().toISOString(),
            type: eventType,
            severity,
            details: processedDetails,
            sessionId: this.getSessionId(),
            userAgent: navigator.userAgent,
            url: window.location.href,
            referrer: document.referrer
        };

        this.buffer.push(entry);

        if (this.buffer.length >= this.maxBufferSize) {
            this.flush();
        }

        // إظهار في console في وضع التصحيح
        if ((window as any).DEBUG_MODE || import.meta.env.DEV) {
            const consoleMethod = severity === 'alert' || severity === 'error' ? 'error' : severity === 'warn' ? 'warn' : 'log';
            console[consoleMethod](`[Security] ${severity.toUpperCase()}: ${eventType}`, details);
        }
    }

    info(eventType: string, details: any = {}) {
        this.log(eventType, details, 'info');
    }

    warn(eventType: string, details: any = {}) {
        this.log(eventType, details, 'warn');
    }

    error(eventType: string, details: any = {}) {
        this.log(eventType, details, 'error');
    }

    alert(eventType: string, details: any) {
        this.log(eventType, details, 'alert');
        
        // إرسال فوري للتنبيهات الخطيرة
        this.flush();
        
        // يمكنك هنا: إظهار تنبيه للمستخدم، تسجيل خروج، إلخ
        if (typeof this.onAlert === 'function') {
            this.onAlert(eventType, details);
        }
    }

    async flush() {
        if (this.buffer.length === 0) return;

        const batch = [...this.buffer];
        this.buffer = [];

        try {
            await fetch(this.endpoint, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-log-batch-id': crypto.randomUUID()
                },
                body: JSON.stringify({ events: batch }),
                keepalive: true // للسماح بالإرسال عند إغلاق الصفحة
            });
        } catch (error) {
            // إعادة المحاولة لاحقاً
            this.buffer.unshift(...batch);
            console.error('Failed to send security logs:', error);
        }
    }

    private getSessionId() {
        try {
            let sessionId = sessionStorage.getItem('security_session_id');
            if (!sessionId) {
                sessionId = crypto.randomUUID();
                sessionStorage.setItem('security_session_id', sessionId);
            }
            return sessionId;
        } catch (e) {
            return crypto.randomUUID();
        }
    }
}

// استخدام:
export const securityLogger = new SecurityLogger({
    endpoint: '/api/security/events',
    flushInterval: 3000
});
