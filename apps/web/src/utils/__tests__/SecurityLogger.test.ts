// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SecurityLogger } from '../SecurityLogger';

describe('SecurityLogger', () => {
  let logger: SecurityLogger;

  beforeEach(() => {
    vi.useFakeTimers();
    // Reset the singleton guard so we can create fresh instances
    (window as any).__securityLoggerInitialized = false;

    // Mock sessionStorage
    const sessionStorageMock: Record<string, string> = {};
    Object.defineProperty(window, 'sessionStorage', {
      value: {
        getItem: vi.fn((key: string) => sessionStorageMock[key] || null),
        setItem: vi.fn((key: string, value: string) => {
          sessionStorageMock[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
          delete sessionStorageMock[key];
        }),
        clear: vi.fn(),
      },
      writable: true,
    });

    // Mock crypto.randomUUID
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('mock-uuid-1234' as `${string}-${string}-${string}-${string}-${string}`);

    // Mock fetch
    global.fetch = vi.fn().mockResolvedValue({ ok: true });

    logger = new SecurityLogger({
      endpoint: '/api/test/log',
      flushInterval: 5000,
      maxBufferSize: 100,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('تسجيل أحداث الأمان مع الطابع الزمني والنوع والتفاصيل', () => {
    it('should log an event with timestamp, type, and details', async () => {
      const now = new Date('2024-01-15T10:30:00.000Z');
      vi.setSystemTime(now);

      logger.log('login_attempt', { username: 'admin', ip: '192.168.1.1' });

      // Flush to capture the buffered events
      await logger.flush();

      expect(fetch).toHaveBeenCalledTimes(1);
      const callArgs = (fetch as any).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.events).toHaveLength(1);
      const event = body.events[0];

      // Verify timestamp is present and correct
      expect(event.timestamp).toBe('2024-01-15T10:30:00.000Z');
      // Verify event type
      expect(event.type).toBe('login_attempt');
      // Verify details
      expect(event.details).toEqual({ username: 'admin', ip: '192.168.1.1' });
    });

    it('should include severity in the logged event', async () => {
      logger.log('suspicious_activity', { action: 'brute_force' }, 'warn');

      await logger.flush();

      const body = JSON.parse((fetch as any).mock.calls[0][1].body);
      const event = body.events[0];

      expect(event.severity).toBe('warn');
    });

    it('should include sessionId, userAgent, url, and referrer in the event', async () => {
      logger.log('page_access', { page: '/admin' });

      await logger.flush();

      const body = JSON.parse((fetch as any).mock.calls[0][1].body);
      const event = body.events[0];

      expect(event.sessionId).toBeDefined();
      expect(event.userAgent).toBeDefined();
      expect(event.url).toBeDefined();
      expect(event.referrer).toBeDefined();
    });

    it('should buffer multiple events and send them in a batch', async () => {
      logger.log('event_1', { detail: 'first' });
      logger.log('event_2', { detail: 'second' });
      logger.log('event_3', { detail: 'third' });

      await logger.flush();

      const body = JSON.parse((fetch as any).mock.calls[0][1].body);
      expect(body.events).toHaveLength(3);
      expect(body.events[0].type).toBe('event_1');
      expect(body.events[1].type).toBe('event_2');
      expect(body.events[2].type).toBe('event_3');
    });

    it('should not call fetch when buffer is empty', async () => {
      await logger.flush();

      expect(fetch).not.toHaveBeenCalled();
    });

    it('should handle Error objects in details by serializing them', async () => {
      const error = new Error('Something went wrong');
      error.stack = 'Error: Something went wrong\n    at test.ts:1:1';

      logger.log('error_occurred', error);

      await logger.flush();

      const body = JSON.parse((fetch as any).mock.calls[0][1].body);
      const event = body.events[0];

      expect(event.details.message).toBe('Something went wrong');
      expect(event.details.name).toBe('Error');
      expect(event.details.stack).toContain('Something went wrong');
    });

    it('should auto-flush when buffer reaches maxBufferSize', async () => {
      const smallLogger = new SecurityLogger({
        endpoint: '/api/test/log',
        maxBufferSize: 3,
      });

      smallLogger.log('event_1', {});
      smallLogger.log('event_2', {});
      // This third event should trigger auto-flush
      smallLogger.log('event_3', {});

      // Allow the flush promise (microtask) to resolve
      await vi.advanceTimersByTimeAsync(0);

      expect(fetch).toHaveBeenCalled();
    });
  });

  describe('أنواع الأحداث المختلفة', () => {
    it('should log info events with severity "info"', async () => {
      logger.info('user_login', { userId: '123' });

      await logger.flush();

      const body = JSON.parse((fetch as any).mock.calls[0][1].body);
      const event = body.events[0];

      expect(event.type).toBe('user_login');
      expect(event.severity).toBe('info');
      expect(event.details).toEqual({ userId: '123' });
    });

    it('should log warn events with severity "warn"', async () => {
      logger.warn('failed_login', { attempts: 3 });

      await logger.flush();

      const body = JSON.parse((fetch as any).mock.calls[0][1].body);
      const event = body.events[0];

      expect(event.type).toBe('failed_login');
      expect(event.severity).toBe('warn');
      expect(event.details).toEqual({ attempts: 3 });
    });

    it('should log error events with severity "error"', async () => {
      logger.error('token_expired', { tokenId: 'abc' });

      await logger.flush();

      const body = JSON.parse((fetch as any).mock.calls[0][1].body);
      const event = body.events[0];

      expect(event.type).toBe('token_expired');
      expect(event.severity).toBe('error');
      expect(event.details).toEqual({ tokenId: 'abc' });
    });

    it('should log alert events with severity "alert" and flush immediately', async () => {
      logger.alert('account_compromised', { userId: '456', reason: 'multiple_failed_attempts' });

      // Alert calls flush() synchronously, allow the fetch promise to resolve
      await vi.advanceTimersByTimeAsync(0);

      expect(fetch).toHaveBeenCalled();
      const body = JSON.parse((fetch as any).mock.calls[0][1].body);
      const event = body.events[0];

      expect(event.type).toBe('account_compromised');
      expect(event.severity).toBe('alert');
      expect(event.details).toEqual({ userId: '456', reason: 'multiple_failed_attempts' });
    });

    it('should call onAlert callback when alert is triggered', async () => {
      const onAlert = vi.fn();
      const alertLogger = new SecurityLogger({
        endpoint: '/api/test/log',
        onAlert,
      });

      alertLogger.alert('xss_detected', { payload: '<script>alert(1)</script>' });

      expect(onAlert).toHaveBeenCalledWith('xss_detected', { payload: '<script>alert(1)</script>' });
    });

    it('should default details to empty object for convenience methods', async () => {
      logger.info('simple_event');
      logger.warn('simple_warning');
      logger.error('simple_error');

      await logger.flush();

      const body = JSON.parse((fetch as any).mock.calls[0][1].body);

      expect(body.events[0].details).toEqual({});
      expect(body.events[1].details).toEqual({});
      expect(body.events[2].details).toEqual({});
    });

    it('should re-buffer events when flush fails', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      logger.log('important_event', { data: 'critical' });

      await logger.flush();

      // The event should be re-buffered after failure
      // Flush again with successful fetch
      (global.fetch as any).mockResolvedValueOnce({ ok: true });
      await logger.flush();

      expect(fetch).toHaveBeenCalledTimes(2);
      const body = JSON.parse((fetch as any).mock.calls[1][1].body);
      expect(body.events[0].type).toBe('important_event');
    });
  });
});
