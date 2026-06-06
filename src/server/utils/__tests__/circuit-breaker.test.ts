import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CircuitBreaker,
  CircuitState,
  CircuitOpenError,
  calculateBackoff,
} from '../circuit-breaker';

describe('CircuitBreaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('starts in CLOSED state', () => {
      const cb = new CircuitBreaker({ serviceName: 'minio' });
      expect(cb.getState()).toBe(CircuitState.CLOSED);
    });

    it('has zero failures and successes initially', () => {
      const cb = new CircuitBreaker({ serviceName: 'minio' });
      const stats = cb.getStats();
      expect(stats.consecutiveFailures).toBe(0);
      expect(stats.totalFailures).toBe(0);
      expect(stats.totalSuccesses).toBe(0);
      expect(stats.lastFailureTime).toBeNull();
      expect(stats.lastSuccessTime).toBeNull();
    });
  });

  describe('CLOSED state', () => {
    it('passes through successful operations', async () => {
      const cb = new CircuitBreaker({ serviceName: 'minio' });
      const result = await cb.execute(() => Promise.resolve('ok'));
      expect(result).toBe('ok');
      expect(cb.getStats().totalSuccesses).toBe(1);
    });

    it('passes through errors without opening (below threshold)', async () => {
      const cb = new CircuitBreaker({ serviceName: 'minio', failureThreshold: 5 });

      for (let i = 0; i < 4; i++) {
        await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
      }

      expect(cb.getState()).toBe(CircuitState.CLOSED);
      expect(cb.getStats().consecutiveFailures).toBe(4);
    });

    it('resets consecutive failure count on success', async () => {
      const cb = new CircuitBreaker({ serviceName: 'minio', failureThreshold: 5 });

      // 3 failures
      for (let i = 0; i < 3; i++) {
        await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      }
      expect(cb.getStats().consecutiveFailures).toBe(3);

      // 1 success resets the count
      await cb.execute(() => Promise.resolve('ok'));
      expect(cb.getStats().consecutiveFailures).toBe(0);
      expect(cb.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('CLOSED → OPEN transition', () => {
    it('opens after failureThreshold (5) consecutive failures', async () => {
      const cb = new CircuitBreaker({ serviceName: 'minio', failureThreshold: 5 });

      for (let i = 0; i < 5; i++) {
        await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
      }

      expect(cb.getState()).toBe(CircuitState.OPEN);
    });

    it('opens with custom threshold', async () => {
      const cb = new CircuitBreaker({ serviceName: 'redis', failureThreshold: 3 });

      for (let i = 0; i < 3; i++) {
        await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      }

      expect(cb.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('OPEN state', () => {
    it('immediately throws CircuitOpenError when open', async () => {
      const cb = new CircuitBreaker({ serviceName: 'minio', failureThreshold: 5 });

      // Trip the breaker
      for (let i = 0; i < 5; i++) {
        await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      }

      // Now should throw CircuitOpenError without calling the function
      const fn = vi.fn(() => Promise.resolve('should not run'));
      await expect(cb.execute(fn)).rejects.toThrow(CircuitOpenError);
      expect(fn).not.toHaveBeenCalled();
    });

    it('CircuitOpenError has statusCode 503', async () => {
      const cb = new CircuitBreaker({ serviceName: 'minio', failureThreshold: 5 });

      for (let i = 0; i < 5; i++) {
        await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      }

      try {
        await cb.execute(() => Promise.resolve('x'));
      } catch (err) {
        expect(err).toBeInstanceOf(CircuitOpenError);
        expect((err as CircuitOpenError).statusCode).toBe(503);
        expect((err as CircuitOpenError).serviceName).toBe('minio');
      }
    });

    it('includes service name in error message', async () => {
      const cb = new CircuitBreaker({ serviceName: 'redis', failureThreshold: 5 });

      for (let i = 0; i < 5; i++) {
        await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      }

      await expect(cb.execute(() => Promise.resolve())).rejects.toThrow(/redis/);
    });
  });

  describe('OPEN → HALF_OPEN transition', () => {
    it('transitions to HALF_OPEN after resetTimeout (60s)', async () => {
      const cb = new CircuitBreaker({
        serviceName: 'minio',
        failureThreshold: 5,
        resetTimeout: 60_000,
      });

      // Trip the breaker
      for (let i = 0; i < 5; i++) {
        await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      }
      expect(cb.getState()).toBe(CircuitState.OPEN);

      // Advance time past the reset timeout
      vi.advanceTimersByTime(60_000);

      // getState should now report HALF_OPEN
      expect(cb.getState()).toBe(CircuitState.HALF_OPEN);
    });

    it('does NOT transition to HALF_OPEN before resetTimeout', async () => {
      const cb = new CircuitBreaker({
        serviceName: 'minio',
        failureThreshold: 5,
        resetTimeout: 60_000,
      });

      for (let i = 0; i < 5; i++) {
        await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      }

      vi.advanceTimersByTime(59_999);
      expect(cb.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('HALF_OPEN state', () => {
    it('allows one probe request through in HALF_OPEN', async () => {
      const cb = new CircuitBreaker({
        serviceName: 'minio',
        failureThreshold: 5,
        resetTimeout: 60_000,
      });

      // Trip the breaker
      for (let i = 0; i < 5; i++) {
        await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      }

      // Wait for timeout
      vi.advanceTimersByTime(60_000);

      // Probe succeeds → circuit closes
      const result = await cb.execute(() => Promise.resolve('recovered'));
      expect(result).toBe('recovered');
      expect(cb.getState()).toBe(CircuitState.CLOSED);
    });

    it('HALF_OPEN → CLOSED on successful probe', async () => {
      const cb = new CircuitBreaker({
        serviceName: 'redis',
        failureThreshold: 5,
        resetTimeout: 60_000,
      });

      for (let i = 0; i < 5; i++) {
        await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      }

      vi.advanceTimersByTime(60_000);
      await cb.execute(() => Promise.resolve('ok'));

      expect(cb.getState()).toBe(CircuitState.CLOSED);
      expect(cb.getStats().consecutiveFailures).toBe(0);
    });

    it('HALF_OPEN → OPEN on failed probe (resets timeout)', async () => {
      const cb = new CircuitBreaker({
        serviceName: 'minio',
        failureThreshold: 5,
        resetTimeout: 60_000,
      });

      // Trip the breaker
      for (let i = 0; i < 5; i++) {
        await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      }

      // Wait for timeout and fail the probe
      vi.advanceTimersByTime(60_000);
      await expect(cb.execute(() => Promise.reject(new Error('still down')))).rejects.toThrow(
        'still down'
      );

      // Should be OPEN again
      expect(cb.getState()).toBe(CircuitState.OPEN);

      // Must wait another 60s for next probe
      vi.advanceTimersByTime(59_999);
      expect(cb.getState()).toBe(CircuitState.OPEN);

      vi.advanceTimersByTime(1);
      expect(cb.getState()).toBe(CircuitState.HALF_OPEN);
    });
  });

  describe('reset()', () => {
    it('manually resets the circuit to CLOSED', async () => {
      const cb = new CircuitBreaker({ serviceName: 'minio', failureThreshold: 5 });

      for (let i = 0; i < 5; i++) {
        await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      }
      expect(cb.getState()).toBe(CircuitState.OPEN);

      cb.reset();
      expect(cb.getState()).toBe(CircuitState.CLOSED);
      expect(cb.getStats().consecutiveFailures).toBe(0);
    });

    it('allows operations again after reset', async () => {
      const cb = new CircuitBreaker({ serviceName: 'minio', failureThreshold: 5 });

      for (let i = 0; i < 5; i++) {
        await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      }

      cb.reset();
      const result = await cb.execute(() => Promise.resolve('working'));
      expect(result).toBe('working');
    });
  });

  describe('default options', () => {
    it('uses failureThreshold=5 by default', async () => {
      const cb = new CircuitBreaker({ serviceName: 'minio' });

      for (let i = 0; i < 4; i++) {
        await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      }
      expect(cb.getState()).toBe(CircuitState.CLOSED);

      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      expect(cb.getState()).toBe(CircuitState.OPEN);
    });

    it('uses resetTimeout=60000 by default', async () => {
      const cb = new CircuitBreaker({ serviceName: 'minio' });

      for (let i = 0; i < 5; i++) {
        await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      }

      vi.advanceTimersByTime(59_999);
      expect(cb.getState()).toBe(CircuitState.OPEN);

      vi.advanceTimersByTime(1);
      expect(cb.getState()).toBe(CircuitState.HALF_OPEN);
    });

    it('uses serviceName="unknown" by default', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 1 });

      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();

      try {
        await cb.execute(() => Promise.resolve());
      } catch (err) {
        expect((err as CircuitOpenError).serviceName).toBe('unknown');
      }
    });
  });
});

describe('calculateBackoff', () => {
  it('returns baseDelay for attempt 0', () => {
    expect(calculateBackoff(0)).toBe(1000);
  });

  it('doubles for each subsequent attempt', () => {
    expect(calculateBackoff(0)).toBe(1000);
    expect(calculateBackoff(1)).toBe(2000);
    expect(calculateBackoff(2)).toBe(4000);
    expect(calculateBackoff(3)).toBe(8000);
    expect(calculateBackoff(4)).toBe(16000);
  });

  it('caps at maxDelay (30s default)', () => {
    expect(calculateBackoff(5)).toBe(30_000); // 32000 → capped to 30000
    expect(calculateBackoff(10)).toBe(30_000);
    expect(calculateBackoff(100)).toBe(30_000);
  });

  it('accepts custom baseDelay', () => {
    expect(calculateBackoff(0, { baseDelay: 500 })).toBe(500);
    expect(calculateBackoff(1, { baseDelay: 500 })).toBe(1000);
  });

  it('accepts custom maxDelay', () => {
    expect(calculateBackoff(10, { maxDelay: 10_000 })).toBe(10_000);
  });

  it('accepts custom multiplier', () => {
    expect(calculateBackoff(0, { multiplier: 3 })).toBe(1000);
    expect(calculateBackoff(1, { multiplier: 3 })).toBe(3000);
    expect(calculateBackoff(2, { multiplier: 3 })).toBe(9000);
  });
});
