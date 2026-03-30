import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the logger before importing the module under test
vi.mock('@/renderer/utils/error-handling/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const { AdaptiveCircuitBreaker, AdaptiveCircuitBreakerManager, CircuitState } = await import(
  '../../../../src/renderer/utils/error-handling/AdaptiveCircuitBreaker'
);

describe('CircuitState enum', () => {
  it('exposes CLOSED, OPEN, HALF_OPEN', () => {
    expect(CircuitState.CLOSED).toBe('CLOSED');
    expect(CircuitState.OPEN).toBe('OPEN');
    expect(CircuitState.HALF_OPEN).toBe('HALF_OPEN');
  });
});

describe('AdaptiveCircuitBreaker', () => {
  let cb: InstanceType<typeof AdaptiveCircuitBreaker>;

  beforeEach(() => {
    cb = new AdaptiveCircuitBreaker({
      name: 'test',
      failureThreshold: 3,
      baseTimeout: 1000,
      maxTimeout: 60000,
      backoffMultiplier: 2,
      timeoutJitter: 0, // disable jitter for deterministic tests
    });
  });

  describe('initial state', () => {
    it('starts in CLOSED state', () => {
      expect(cb.state).toBe(CircuitState.CLOSED);
    });

    it('has zero failure count', () => {
      expect(cb.failureCount).toBe(0);
    });

    it('canAttempt returns true', () => {
      expect(cb.canAttempt()).toBe(true);
    });

    it('isOpen returns false', () => {
      expect(cb.isOpen()).toBe(false);
    });
  });

  describe('success handling', () => {
    it('stays CLOSED on success', async () => {
      await cb.execute(() => Promise.resolve('ok'));
      expect(cb.state).toBe(CircuitState.CLOSED);
    });

    it('resets failure count on success in CLOSED state', () => {
      cb.onFailure();
      cb.onFailure();
      cb.onSuccess();
      expect(cb.failureCount).toBe(0);
    });

    it('tracks total successes in metrics', async () => {
      await cb.execute(() => Promise.resolve('a'));
      await cb.execute(() => Promise.resolve('b'));
      expect(cb.metrics.totalSuccesses).toBe(2);
    });
  });

  describe('failure handling and CLOSED -> OPEN transition', () => {
    it('increments failure count', () => {
      cb.onFailure();
      expect(cb.failureCount).toBe(1);
    });

    it('transitions to OPEN when failure threshold reached', () => {
      for (let i = 0; i < 3; i++) cb.onFailure();
      expect(cb.state).toBe(CircuitState.OPEN);
    });

    it('does not transition to OPEN below threshold', () => {
      cb.onFailure();
      cb.onFailure();
      expect(cb.state).toBe(CircuitState.CLOSED);
    });

    it('sets nextAttemptTime on OPEN', () => {
      for (let i = 0; i < 3; i++) cb.onFailure();
      // nextAttemptTime should be set to a future time
      expect(cb.nextAttemptTime).toBeGreaterThan(Date.now() - 1000);
      expect(cb.nextAttemptTime).not.toBeNull();
    });

    it('increments circuitOpenCount metric', () => {
      for (let i = 0; i < 3; i++) cb.onFailure();
      expect(cb.metrics.circuitOpenCount).toBe(1);
    });
  });

  describe('OPEN state behavior', () => {
    beforeEach(() => {
      for (let i = 0; i < 3; i++) cb.onFailure();
    });

    it('canAttempt returns false before timeout', () => {
      expect(cb.canAttempt()).toBe(false);
    });

    it('isOpen returns true', () => {
      expect(cb.isOpen()).toBe(true);
    });

    it('execute rejects when OPEN', async () => {
      await expect(cb.execute(() => Promise.resolve('x'))).rejects.toThrow('Circuit breaker test is OPEN');
    });
  });

  describe('OPEN -> HALF_OPEN transition', () => {
    it('transitions to HALF_OPEN when nextAttemptTime has passed', () => {
      for (let i = 0; i < 3; i++) cb.onFailure();
      expect(cb.state).toBe(CircuitState.OPEN);

      // Simulate time passing by setting nextAttemptTime to the past
      cb.nextAttemptTime = Date.now() - 1;
      expect(cb.canAttempt()).toBe(true);
      expect(cb.state).toBe(CircuitState.HALF_OPEN);
    });
  });

  describe('HALF_OPEN state', () => {
    beforeEach(() => {
      for (let i = 0; i < 3; i++) cb.onFailure();
      // Force transition to HALF_OPEN by putting nextAttemptTime in the past
      cb.nextAttemptTime = Date.now() - 1;
      cb.canAttempt(); // triggers transition to HALF_OPEN
    });

    it('is in HALF_OPEN state', () => {
      expect(cb.state).toBe(CircuitState.HALF_OPEN);
    });

    it('transitions to CLOSED on success', () => {
      cb.onSuccess();
      expect(cb.state).toBe(CircuitState.CLOSED);
    });

    it('transitions back to OPEN on failure', () => {
      cb.onFailure();
      expect(cb.state).toBe(CircuitState.OPEN);
    });

    it('resets halfOpenAttempts when entering HALF_OPEN', () => {
      expect(cb.halfOpenAttempts).toBe(0);
    });

    it('limits attempts based on halfOpenMaxAttempts', () => {
      const cb2 = new AdaptiveCircuitBreaker({
        name: 'ho-test',
        failureThreshold: 1,
        halfOpenMaxAttempts: 2,
        baseTimeout: 100,
        timeoutJitter: 0,
      });
      cb2.onFailure(); // -> OPEN
      cb2.nextAttemptTime = Date.now() - 1;
      cb2.canAttempt(); // -> HALF_OPEN, attempts = 0
      // Simulate 2 attempts bringing us to max
      cb2.halfOpenAttempts = 2;
      expect(cb2.canAttempt()).toBe(false);
    });
  });

  describe('execute method', () => {
    it('returns the result of the function', async () => {
      const result = await cb.execute(() => Promise.resolve(42));
      expect(result).toBe(42);
    });

    it('rethrows errors from the function', async () => {
      await expect(cb.execute(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    });

    it('calls onSuccess on successful execution', async () => {
      const spy = vi.spyOn(cb, 'onSuccess');
      await cb.execute(() => Promise.resolve('ok'));
      expect(spy).toHaveBeenCalledOnce();
    });

    it('calls onFailure on failed execution', async () => {
      const spy = vi.spyOn(cb, 'onFailure');
      await cb.execute(() => Promise.reject(new Error('err'))).catch(() => {});
      expect(spy).toHaveBeenCalledOnce();
    });

    it('counts total requests', async () => {
      await cb.execute(() => Promise.resolve(1));
      await cb.execute(() => Promise.reject(new Error('e'))).catch(() => {});
      expect(cb.metrics.totalRequests).toBe(2);
    });
  });

  describe('manual bypass', () => {
    beforeEach(() => {
      for (let i = 0; i < 3; i++) cb.onFailure();
    });

    it('canManualBypass returns true when OPEN and no active bypass', () => {
      expect(cb.canManualBypass()).toBe(true);
    });

    it('canManualBypass returns false when not OPEN', () => {
      const freshCb = new AdaptiveCircuitBreaker({ name: 'fresh' });
      expect(freshCb.canManualBypass()).toBe(false);
    });

    it('bypasses OPEN circuit when reason is manual', async () => {
      const result = await cb.execute(() => Promise.resolve('bypassed'), {
        bypassIfOpen: true,
        reason: 'manual',
      });
      expect(result).toBe('bypassed');
      // After successful bypass, circuit resets to CLOSED
      expect(cb.state).toBe(CircuitState.CLOSED);
    });

    it('increments manualBypasses metric', async () => {
      await cb.execute(() => Promise.resolve('x'), {
        bypassIfOpen: true,
        reason: 'manual',
      });
      expect(cb.metrics.manualBypasses).toBe(1);
    });

    it('stays OPEN if bypass fails', async () => {
      await expect(
        cb.execute(() => Promise.reject(new Error('bypass fail')), {
          bypassIfOpen: true,
          reason: 'manual',
        }),
      ).rejects.toThrow('bypass fail');
      expect(cb.state).toBe(CircuitState.OPEN);
    });
  });

  describe('reset', () => {
    it('resets to CLOSED state', () => {
      for (let i = 0; i < 3; i++) cb.onFailure();
      expect(cb.state).toBe(CircuitState.OPEN);
      cb.reset();
      expect(cb.state).toBe(CircuitState.CLOSED);
    });

    it('resets failure count', () => {
      cb.onFailure();
      cb.onFailure();
      cb.reset();
      expect(cb.failureCount).toBe(0);
    });

    it('clears totalFailuresInCycle', () => {
      for (let i = 0; i < 3; i++) cb.onFailure();
      cb.reset();
      expect(cb.totalFailuresInCycle).toBe(0);
    });
  });

  describe('getStatus', () => {
    it('returns comprehensive status object', () => {
      const status = cb.getStatus();
      expect(status.name).toBe('test');
      expect(status.state).toBe(CircuitState.CLOSED);
      expect(status).toHaveProperty('failureCount');
      expect(status).toHaveProperty('metrics');
      expect(status).toHaveProperty('backoff');
      expect(status.backoff).toHaveProperty('consecutiveOpenings');
      expect(status.backoff).toHaveProperty('currentTimeout');
    });
  });

  describe('getTimeUntilNextAttempt', () => {
    it('returns null when not OPEN', () => {
      expect(cb.getTimeUntilNextAttempt()).toBeNull();
    });

    it('returns formatted time string when OPEN with future nextAttemptTime', () => {
      for (let i = 0; i < 3; i++) cb.onFailure();
      const result = cb.getTimeUntilNextAttempt();
      // Should return a string like "1s" or "5s"
      expect(result).toMatch(/^\d+s$/);
    });

    it('returns null when OPEN but nextAttemptTime is null', () => {
      cb.state = CircuitState.OPEN;
      cb.nextAttemptTime = null;
      expect(cb.getTimeUntilNextAttempt()).toBeNull();
    });
  });

  describe('transitionTo', () => {
    it('records state change timestamp in metrics', () => {
      const before = Date.now();
      cb.transitionTo(CircuitState.OPEN);
      expect(cb.metrics.lastStateChange).toBeGreaterThanOrEqual(before);
    });

    it('CLOSED transition resets counters', () => {
      cb.failureCount = 5;
      cb.successCount = 10;
      cb.halfOpenAttempts = 3;
      cb.totalFailuresInCycle = 7;
      cb.transitionTo(CircuitState.CLOSED);
      expect(cb.failureCount).toBe(0);
      expect(cb.successCount).toBe(0);
      expect(cb.halfOpenAttempts).toBe(0);
      expect(cb.nextAttemptTime).toBeNull();
      expect(cb.totalFailuresInCycle).toBe(0);
    });

    it('OPEN transition records timeout history', () => {
      cb.totalFailuresInCycle = 3;
      cb.transitionTo(CircuitState.OPEN);
      expect(cb.metrics.timeoutHistory.length).toBeGreaterThan(0);
      expect(cb.metrics.timeoutHistory[0]).toHaveProperty('timeout');
      expect(cb.metrics.timeoutHistory[0]).toHaveProperty('timestamp');
    });

    it('OPEN transition limits timeout history to 10 entries', () => {
      for (let i = 0; i < 12; i++) {
        cb.totalFailuresInCycle = 3;
        cb.transitionTo(CircuitState.OPEN);
      }
      expect(cb.metrics.timeoutHistory.length).toBeLessThanOrEqual(10);
    });

    it('HALF_OPEN transition resets halfOpenAttempts', () => {
      cb.halfOpenAttempts = 5;
      cb.transitionTo(CircuitState.HALF_OPEN);
      expect(cb.halfOpenAttempts).toBe(0);
    });
  });

  describe('exponential backoff', () => {
    it('tracks consecutive openings', () => {
      for (let i = 0; i < 3; i++) cb.onFailure();
      expect(cb.consecutiveOpenings).toBe(1);
    });

    it('maintainBackoffLevel option prevents incrementing consecutiveOpenings', () => {
      cb.consecutiveOpenings = 2;
      cb.totalFailuresInCycle = 3;
      cb.transitionTo(CircuitState.OPEN, { maintainBackoffLevel: true });
      expect(cb.consecutiveOpenings).toBe(2);
    });

    it('calculates timeout with backoff (higher backoff level yields larger timeout)', () => {
      // First cycle: backoffLevel = Math.floor((3-1)/3) = 0 => baseBackoff = 1000
      cb.totalFailuresInCycle = 3;
      cb.transitionTo(CircuitState.OPEN);
      const firstTimeout = cb.resetTimeout;

      // Second cycle: backoffLevel = Math.floor((6-1)/3) = 1 => baseBackoff = 2000
      cb.totalFailuresInCycle = 6;
      cb.transitionTo(CircuitState.OPEN);
      const secondTimeout = cb.resetTimeout;

      // Second timeout should be roughly 2x the first (with jitter variance)
      // Allow 20% tolerance due to jitter
      expect(secondTimeout).toBeGreaterThan(firstTimeout);
      expect(secondTimeout / firstTimeout).toBeGreaterThan(1.5);
      expect(secondTimeout / firstTimeout).toBeLessThan(2.5);
    });

    it('respects maxTimeout (within jitter tolerance)', () => {
      cb.totalFailuresInCycle = 100; // Very high backoff level
      cb.transitionTo(CircuitState.OPEN);
      // Jitter can add up to 5% (timeoutJitter defaults to 0.1, so 0.1 * 0.5 = 5%)
      const maxWithJitter = cb.maxTimeout * 1.05;
      expect(cb.resetTimeout).toBeLessThanOrEqual(maxWithJitter);
      // Should still be close to maxTimeout (within jitter range)
      expect(cb.resetTimeout).toBeGreaterThan(cb.maxTimeout * 0.9);
    });
  });
});

describe('AdaptiveCircuitBreakerManager', () => {
  let manager: InstanceType<typeof AdaptiveCircuitBreakerManager>;

  beforeEach(() => {
    manager = new AdaptiveCircuitBreakerManager();
  });

  it('creates and retrieves breakers by name', () => {
    const b1 = manager.getBreaker('svc-a');
    const b2 = manager.getBreaker('svc-a');
    expect(b1).toBe(b2);
  });

  it('creates separate breakers for different names', () => {
    const b1 = manager.getBreaker('svc-a');
    const b2 = manager.getBreaker('svc-b');
    expect(b1).not.toBe(b2);
  });

  it('executes through a named breaker', async () => {
    const result = await manager.execute('test', () => Promise.resolve(99));
    expect(result).toBe(99);
  });

  it('resets a specific breaker', async () => {
    const breaker = manager.getBreaker('svc', { failureThreshold: 1 })!;
    breaker.onFailure();
    expect(breaker.state).toBe(CircuitState.OPEN);

    manager.reset('svc');
    expect(breaker.state).toBe(CircuitState.CLOSED);
  });

  it('reset is no-op for unknown breaker name', () => {
    expect(() => manager.reset('unknown')).not.toThrow();
  });

  it('getAllStatus returns status for all breakers', () => {
    manager.getBreaker('a');
    manager.getBreaker('b');
    const status = manager.getAllStatus();
    expect(Object.keys(status)).toEqual(['a', 'b']);
    expect(status.a.state).toBe(CircuitState.CLOSED);
  });
});
