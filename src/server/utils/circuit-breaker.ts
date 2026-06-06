/**
 * Circuit Breaker implementation for MinIO and Redis connections.
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Rejecting all requests immediately with 503
 * - HALF_OPEN: Allowing one probe request to test recovery
 *
 * Transitions:
 * - CLOSED → OPEN: After `failureThreshold` consecutive failures
 * - OPEN → HALF_OPEN: After `resetTimeout` ms elapsed
 * - HALF_OPEN → CLOSED: If the probe request succeeds
 * - HALF_OPEN → OPEN: If the probe request fails (resets the timeout)
 *
 * Requirements: 9.1, 9.2, 9.6
 */

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export class CircuitOpenError extends Error {
  public readonly statusCode = 503;
  public readonly serviceName: string;

  constructor(serviceName: string) {
    super(`Service "${serviceName}" is temporarily unavailable (circuit open)`);
    this.name = 'CircuitOpenError';
    this.serviceName = serviceName;
    Error.captureStackTrace(this, this.constructor);
  }
}

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening the circuit. Default: 5 */
  failureThreshold?: number;
  /** Time in ms before attempting a half-open probe. Default: 60000 (60s) */
  resetTimeout?: number;
  /** Name of the service (for error messages and logging). Default: 'unknown' */
  serviceName?: string;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  consecutiveFailures: number;
  totalFailures: number;
  totalSuccesses: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private consecutiveFailures = 0;
  private totalFailures = 0;
  private totalSuccesses = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private openedAt: number | null = null;

  private readonly failureThreshold: number;
  private readonly resetTimeout: number;
  private readonly serviceName: string;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeout = options.resetTimeout ?? 60_000;
    this.serviceName = options.serviceName ?? 'unknown';
  }

  /**
   * Execute an async operation through the circuit breaker.
   * - If CLOSED: execute normally, track success/failure
   * - If OPEN: reject immediately with CircuitOpenError (or transition to HALF_OPEN if timeout elapsed)
   * - If HALF_OPEN: allow one probe request, then transition based on result
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.state = CircuitState.HALF_OPEN;
      } else {
        throw new CircuitOpenError(this.serviceName);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /** Get current circuit breaker statistics */
  getStats(): CircuitBreakerStats {
    return {
      state: this.getState(),
      consecutiveFailures: this.consecutiveFailures,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
    };
  }

  /** Get the current effective state (accounts for timeout-based transitions) */
  getState(): CircuitState {
    if (this.state === CircuitState.OPEN && this.shouldAttemptReset()) {
      return CircuitState.HALF_OPEN;
    }
    return this.state;
  }

  /** Manually reset the circuit breaker to CLOSED state */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.consecutiveFailures = 0;
    this.openedAt = null;
  }

  private onSuccess(): void {
    this.totalSuccesses++;
    this.lastSuccessTime = Date.now();
    this.consecutiveFailures = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.CLOSED;
      this.openedAt = null;
    }
  }

  private onFailure(): void {
    this.totalFailures++;
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      // Probe failed — reopen and reset the timeout
      this.state = CircuitState.OPEN;
      this.openedAt = Date.now();
    } else if (
      this.state === CircuitState.CLOSED &&
      this.consecutiveFailures >= this.failureThreshold
    ) {
      this.state = CircuitState.OPEN;
      this.openedAt = Date.now();
    }
  }

  private shouldAttemptReset(): boolean {
    if (this.openedAt === null) return false;
    return Date.now() - this.openedAt >= this.resetTimeout;
  }
}

/**
 * Exponential backoff calculator for worker pause/resume.
 * Workers use this when the circuit breaker is open to wait
 * with increasing delays before retrying.
 *
 * Requirement 9.1: Exponential backoff starting at 1s, doubling up to 30s max.
 */
export interface BackoffOptions {
  /** Initial delay in ms. Default: 1000 (1s) */
  baseDelay?: number;
  /** Maximum delay in ms. Default: 30000 (30s) */
  maxDelay?: number;
  /** Multiplier per attempt. Default: 2 */
  multiplier?: number;
}

export function calculateBackoff(attempt: number, options: BackoffOptions = {}): number {
  const baseDelay = options.baseDelay ?? 1000;
  const maxDelay = options.maxDelay ?? 30_000;
  const multiplier = options.multiplier ?? 2;

  const delay = baseDelay * Math.pow(multiplier, attempt);
  return Math.min(delay, maxDelay);
}

/**
 * Utility to sleep with exponential backoff.
 * Used by workers when MinIO/Redis is down.
 */
export function sleepWithBackoff(attempt: number, options?: BackoffOptions): Promise<void> {
  const delay = calculateBackoff(attempt, options);
  return new Promise((resolve) => setTimeout(resolve, delay));
}
