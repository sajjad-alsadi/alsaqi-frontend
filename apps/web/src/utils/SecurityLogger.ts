// ==================== SecurityLogger.ts ====================

import { redactContext } from './logger';

/**
 * Apply the log allowlist/redaction policy to caller-supplied security-event
 * details before they are forwarded to the Backend (Req 10.1, 10.4). Object
 * details are reduced to allowlisted keys; non-object details (primitives) carry
 * no allowlistable fields and are passed through unchanged.
 */
function redactDetailsForTransmission(details: unknown): unknown {
  if (details !== null && typeof details === 'object' && !Array.isArray(details)) {
    return redactContext(details as Record<string, unknown>);
  }
  return details;
}

/**
 * Resolve the current route path with the query string stripped (Req 10.2,
 * 10.3) so query-string tokens in `window.location.href` are never forwarded.
 */
function getRoutePath(): string {
  try {
    if (typeof window !== 'undefined' && window.location) {
      return window.location.pathname;
    }
  } catch {
    // location unavailable — fall through to a safe default.
  }
  return '/';
}

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
    public onAlert?: ((eventType: string, details: any) => void) | undefined;

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
            ...details,
            message: details.message,
            stack: details.stack,
            name: details.name
        } : details;

        const entry = {
            timestamp: new Date().toISOString(),
            type: eventType,
            severity,
            // Allowlist/redact caller-supplied details before they are buffered for
            // transmission so tokens and unvetted context are never forwarded (Req 10.1, 10.4).
            details: redactDetailsForTransmission(processedDetails),
            sessionId: this.getSessionId(),
            userAgent: navigator.userAgent,
            // Forward only the path (no query string) so query-string tokens in
            // window.location.href are never transmitted (Req 10.2, 10.3).
            url: getRoutePath(),
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
        } catch {
            return crypto.randomUUID();
        }
    }
}

// استخدام:
export const securityLogger = new SecurityLogger({
    endpoint: '/api/security/events',
    flushInterval: 3000
});
