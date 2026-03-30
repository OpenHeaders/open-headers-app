import { describe, expect, it } from 'vitest';
import { AdaptiveCircuitBreaker, AdaptiveCircuitBreakerManager, CircuitState } from '@/shared/AdaptiveCircuitBreaker';

describe('AdaptiveCircuitBreaker', () => {
  function makeBreaker(overrides = {}) {
    return new AdaptiveCircuitBreaker({
      name: 'test',
      failureThreshold: 3,
      baseTimeout: 1000,
      maxTimeout: 10000,
      backoffMultiplier: 2,
      nowFn: () => Date.now(),
      ...overrides,
    });
  }

  describe('execute', () => {
    it('passes through successful calls in CLOSED state', async () => {
      const breaker = makeBreaker();
      const result = await breaker.execute(async () => 'ok');
      expect(result).toBe('ok');
      expect(breaker.state).toBe(CircuitState.CLOSED);
    });

    it('records failures and opens after threshold', async () => {
      const breaker = makeBreaker({ failureThreshold: 2 });

      for (let i = 0; i < 2; i++) {
        await breaker
          .execute(async () => {
            throw new Error('fail');
          })
          .catch(() => {});
      }

      expect(breaker.state).toBe(CircuitState.OPEN);
      expect(breaker.isOpen()).toBe(true);
    });

    it('rejects requests when OPEN', async () => {
      const breaker = makeBreaker({ failureThreshold: 1 });
      await breaker
        .execute(async () => {
          throw new Error('fail');
        })
        .catch(() => {});

      await expect(breaker.execute(async () => 'ok')).rejects.toThrow('OPEN');
    });

    it('transitions to HALF_OPEN after timeout expires', async () => {
      let now = 1000;
      const breaker = makeBreaker({ failureThreshold: 1, baseTimeout: 500, nowFn: () => now });

      await breaker
        .execute(async () => {
          throw new Error('fail');
        })
        .catch(() => {});
      expect(breaker.state).toBe(CircuitState.OPEN);

      now = 2000; // advance past timeout
      expect(breaker.canAttempt()).toBe(true);
      expect(breaker.state).toBe(CircuitState.HALF_OPEN);
    });

    it('resets to CLOSED on success in HALF_OPEN', async () => {
      let now = 1000;
      const breaker = makeBreaker({ failureThreshold: 1, baseTimeout: 500, nowFn: () => now });

      await breaker
        .execute(async () => {
          throw new Error('fail');
        })
        .catch(() => {});
      now = 2000;

      const result = await breaker.execute(async () => 'recovered');
      expect(result).toBe('recovered');
      expect(breaker.state).toBe(CircuitState.CLOSED);
    });

    it('returns to OPEN on failure in HALF_OPEN', async () => {
      let now = 1000;
      const breaker = makeBreaker({ failureThreshold: 1, baseTimeout: 500, nowFn: () => now });

      await breaker
        .execute(async () => {
          throw new Error('fail');
        })
        .catch(() => {});
      now = 2000;

      await breaker
        .execute(async () => {
          throw new Error('still broken');
        })
        .catch(() => {});
      expect(breaker.state).toBe(CircuitState.OPEN);
    });
  });

  describe('manual bypass', () => {
    it('allows bypass when OPEN with manual reason', async () => {
      const breaker = makeBreaker({ failureThreshold: 1 });
      await breaker
        .execute(async () => {
          throw new Error('fail');
        })
        .catch(() => {});

      const result = await breaker.execute(async () => 'bypassed', { bypassIfOpen: true, reason: 'manual' });
      expect(result).toBe('bypassed');
      expect(breaker.state).toBe(CircuitState.CLOSED); // reset after successful bypass
    });
  });

  describe('reset', () => {
    it('resets to CLOSED state', async () => {
      const breaker = makeBreaker({ failureThreshold: 1 });
      await breaker
        .execute(async () => {
          throw new Error('fail');
        })
        .catch(() => {});
      expect(breaker.state).toBe(CircuitState.OPEN);

      breaker.reset();
      expect(breaker.state).toBe(CircuitState.CLOSED);
      expect(breaker.isOpen()).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('returns current state info', () => {
      const breaker = makeBreaker();
      const status = breaker.getStatus();
      expect(status.state).toBe(CircuitState.CLOSED);
      expect(status.failureCount).toBe(0);
      expect(status.backoff.timeUntilNextAttemptMs).toBe(0);
    });
  });

  describe('getTimeUntilNextAttempt', () => {
    it('returns null when not OPEN', () => {
      const breaker = makeBreaker();
      expect(breaker.getTimeUntilNextAttempt()).toBeNull();
    });

    it('returns formatted time when OPEN', async () => {
      const breaker = makeBreaker({ failureThreshold: 1, baseTimeout: 5000 });
      await breaker
        .execute(async () => {
          throw new Error('fail');
        })
        .catch(() => {});
      expect(breaker.getTimeUntilNextAttempt()).toMatch(/\d+s/);
    });
  });
});

describe('AdaptiveCircuitBreakerManager', () => {
  it('creates and retrieves breakers by name', () => {
    const manager = new AdaptiveCircuitBreakerManager();
    const b1 = manager.getBreaker('source-1');
    const b2 = manager.getBreaker('source-1');
    expect(b1).toBe(b2); // same instance
  });

  it('creates separate breakers for different names', () => {
    const manager = new AdaptiveCircuitBreakerManager();
    const b1 = manager.getBreaker('source-1');
    const b2 = manager.getBreaker('source-2');
    expect(b1).not.toBe(b2);
  });

  it('resets a specific breaker', async () => {
    const manager = new AdaptiveCircuitBreakerManager({ failureThreshold: 1 });
    const breaker = manager.getBreaker('source-1');
    await breaker
      .execute(async () => {
        throw new Error('fail');
      })
      .catch(() => {});
    expect(breaker.isOpen()).toBe(true);

    manager.reset('source-1');
    expect(breaker.isOpen()).toBe(false);
  });

  it('getAllStatus returns status for all breakers', () => {
    const manager = new AdaptiveCircuitBreakerManager();
    manager.getBreaker('a');
    manager.getBreaker('b');
    const all = manager.getAllStatus();
    expect(Object.keys(all)).toEqual(['a', 'b']);
  });
});
