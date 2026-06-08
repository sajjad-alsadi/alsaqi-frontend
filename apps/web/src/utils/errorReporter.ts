export interface ErrorReport {
  message: string;
  stack?: string;
  componentStack?: string;
  appVersion: string;
  sessionId: string;
  userAgent: string;
  routePath: string;
  timestamp: string;
  type: 'boundary' | 'uncaught' | 'unhandled-rejection';
}

class ErrorReporter {
  private endpoint: string;
  private sessionId: string;

  constructor() {
    this.endpoint = import.meta.env.VITE_ERROR_REPORT_URL || '/api/system-errors';
    this.sessionId = this.getOrCreateSessionId();
  }

  report(error: Partial<ErrorReport>): void {
    const payload: ErrorReport = {
      message: error.message || 'Unknown error',
      stack: error.stack,
      componentStack: error.componentStack,
      appVersion: import.meta.env.VITE_APP_VERSION || 'unknown',
      sessionId: this.sessionId,
      userAgent: navigator.userAgent,
      routePath: window.location.pathname,
      timestamp: new Date().toISOString(),
      type: error.type || 'uncaught',
    };

    // Fire-and-forget — don't let reporting errors cascade
    fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {}); // Silently ignore reporting failures
  }

  private getOrCreateSessionId(): string {
    const key = 'alsaqi_error_session';
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(key, id);
    }
    return id;
  }
}

export const errorReporter = new ErrorReporter();
