/**
 * Adaptive Circuit Breaker — shared between renderer and main process.
 * Pure JS with parameterized time function (no renderer TimeManager dependency).
 */

type NowFn = () => number;

interface CircuitBreakerOptions {
  name?: string;
  failureThreshold?: number;
  halfOpenMaxAttempts?: number;
  baseTimeout?: number;
  maxTimeout?: number;
  backoffMultiplier?: number;
  timeoutJitter?: number;
  nowFn?: NowFn;
}

const CircuitState = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN'
};

class AdaptiveCircuitBreaker {
  name: string;
  failureThreshold: number;
  halfOpenMaxAttempts: number;
  baseTimeout: number;
  maxTimeout: number;
  backoffMultiplier: number;
  timeoutJitter: number;
  resetTimeout: number;
  state: string;
  failureCount: number;
  successCount: number;
  halfOpenAttempts: number;
  nextAttemptTime: number | null;
  consecutiveOpenings: number;
  lastSuccessTime: number;
  totalFailuresInCycle: number;
  manualBypassActive: boolean;
  private _now: NowFn;
  metrics: {
    totalRequests: number;
    totalFailures: number;
    totalSuccesses: number;
    circuitOpenCount: number;
    lastStateChange: number;
    consecutiveOpenings: number;
    currentTimeout: number;
    manualBypasses: number;
    timeoutHistory: Array<{ timestamp: number; timeout: number; opening: number }>;
  };

  constructor(options: CircuitBreakerOptions = {}) {
    this.name = options.name || 'unnamed';
    this.failureThreshold = options.failureThreshold || 5;
    this.halfOpenMaxAttempts = options.halfOpenMaxAttempts || 3;
    this.baseTimeout = options.baseTimeout || 30000;
    this.maxTimeout = options.maxTimeout || 3600000;
    this.backoffMultiplier = options.backoffMultiplier || 2;
    this.timeoutJitter = options.timeoutJitter || 0.1;
    this._now = options.nowFn || Date.now;

    this.resetTimeout = this.baseTimeout;
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenAttempts = 0;
    this.nextAttemptTime = null;
    this.consecutiveOpenings = 0;
    this.lastSuccessTime = this._now();
    this.totalFailuresInCycle = 0;
    this.manualBypassActive = false;
    this.metrics = {
      totalRequests: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      circuitOpenCount: 0,
      lastStateChange: this._now(),
      consecutiveOpenings: 0,
      currentTimeout: this.baseTimeout,
      manualBypasses: 0,
      timeoutHistory: []
    };
  }

  async execute<T>(fn: () => Promise<T>, options: { bypassIfOpen?: boolean; reason?: string } = {}): Promise<T> {
    const { bypassIfOpen = false, reason = 'auto' } = options;
    this.metrics.totalRequests++;

    if (bypassIfOpen && this.state === CircuitState.OPEN && reason === 'manual') {
      return this.executeWithBypass(fn);
    }

    if (!this.canAttempt()) {
      this.metrics.totalFailures++;
      throw new Error(`Circuit breaker ${this.name} is OPEN`);
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

  async executeWithBypass<T>(fn: () => Promise<T>): Promise<T> {
    this.metrics.manualBypasses++;
    this.manualBypassActive = true;

    try {
      const result = await fn();
      this.reset();
      this.manualBypassActive = false;
      return result;
    } catch (error) {
      this.manualBypassActive = false;
      this.metrics.totalFailures++;
      throw error;
    }
  }

  canAttempt() {
    const now = this._now();
    switch (this.state) {
      case CircuitState.CLOSED:
        return true;
      case CircuitState.OPEN:
        if (this.nextAttemptTime !== null && now >= this.nextAttemptTime) {
          this.transitionTo(CircuitState.HALF_OPEN);
          return true;
        }
        return false;
      case CircuitState.HALF_OPEN:
        return this.halfOpenAttempts < this.halfOpenMaxAttempts;
      default:
        return false;
    }
  }

  onSuccess() {
    this.metrics.totalSuccesses++;
    this.successCount++;
    switch (this.state) {
      case CircuitState.CLOSED:
        this.failureCount = 0;
        this.totalFailuresInCycle = 0;
        break;
      case CircuitState.HALF_OPEN:
        this.transitionTo(CircuitState.CLOSED);
        break;
    }
  }

  onFailure() {
    this.metrics.totalFailures++;
    this.failureCount++;
    this.totalFailuresInCycle++;

    switch (this.state) {
      case CircuitState.CLOSED:
        if (this.failureCount >= this.failureThreshold) {
          this.transitionTo(CircuitState.OPEN);
        }
        break;
      case CircuitState.HALF_OPEN:
        this.halfOpenAttempts++;
        this.transitionTo(CircuitState.OPEN, { maintainBackoffLevel: true });
        break;
    }
  }

  transitionTo(newState: string, options: { maintainBackoffLevel?: boolean } = {}) {
    this.state = newState;
    this.metrics.lastStateChange = this._now();

    switch (newState) {
      case CircuitState.CLOSED: {
        this.failureCount = 0;
        this.successCount = 0;
        this.halfOpenAttempts = 0;
        this.nextAttemptTime = null;
        this.totalFailuresInCycle = 0;

        const now = this._now();
        const timeSinceLastSuccess = now - this.lastSuccessTime;

        if (timeSinceLastSuccess > 300000 && this.consecutiveOpenings > 0) {
          this.consecutiveOpenings = Math.floor(this.consecutiveOpenings / 2);
        } else if (this.consecutiveOpenings > 0) {
          this.consecutiveOpenings = Math.max(0, this.consecutiveOpenings - 1);
        }

        this.lastSuccessTime = now;

        if (this.consecutiveOpenings === 0) {
          this.resetTimeout = this.baseTimeout;
        } else {
          this.resetTimeout = Math.min(
            this.baseTimeout * Math.pow(this.backoffMultiplier, this.consecutiveOpenings),
            this.maxTimeout
          );
        }

        this.metrics.consecutiveOpenings = this.consecutiveOpenings;
        this.metrics.currentTimeout = this.resetTimeout;
        break;
      }

      case CircuitState.OPEN: {
        this.metrics.circuitOpenCount++;
        if (!options.maintainBackoffLevel) {
          this.consecutiveOpenings++;
        }

        const backoffLevel = Math.floor((this.totalFailuresInCycle - 1) / this.failureThreshold);
        const baseBackoff = Math.min(
          this.baseTimeout * Math.pow(this.backoffMultiplier, backoffLevel),
          this.maxTimeout
        );

        const jitter = baseBackoff * this.timeoutJitter * (Math.random() - 0.5);
        this.resetTimeout = Math.round(baseBackoff + jitter);
        this.nextAttemptTime = this._now() + this.resetTimeout;

        this.metrics.consecutiveOpenings = this.consecutiveOpenings;
        this.metrics.currentTimeout = this.resetTimeout;
        this.metrics.timeoutHistory.push({
          timestamp: this._now(),
          timeout: this.resetTimeout,
          opening: this.consecutiveOpenings
        });

        if (this.metrics.timeoutHistory.length > 10) {
          this.metrics.timeoutHistory.shift();
        }
        break;
      }

      case CircuitState.HALF_OPEN:
        this.halfOpenAttempts = 0;
        break;
    }
  }

  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      totalFailuresInCycle: this.totalFailuresInCycle,
      successCount: this.successCount,
      nextAttemptTime: this.nextAttemptTime,
      metrics: { ...this.metrics },
      backoff: {
        consecutiveOpenings: this.consecutiveOpenings,
        currentTimeout: this.resetTimeout,
        baseTimeout: this.baseTimeout,
        maxTimeout: this.maxTimeout,
        multiplier: this.backoffMultiplier,
        timeUntilNextAttempt: this.nextAttemptTime ?
          Math.max(0, this.nextAttemptTime - this._now()) : 0,
        timeUntilNextAttemptMs: this.nextAttemptTime ?
          Math.max(0, this.nextAttemptTime - this._now()) : 0
      },
      lastSuccessTime: this.lastSuccessTime,
      manualBypassActive: this.manualBypassActive
    };
  }

  reset() {
    this.totalFailuresInCycle = 0;
    this.transitionTo(CircuitState.CLOSED);
  }

  isOpen() {
    return this.state === CircuitState.OPEN;
  }

  canManualBypass() {
    return this.state === CircuitState.OPEN && !this.manualBypassActive;
  }

  getTimeUntilNextAttempt() {
    if (this.state !== CircuitState.OPEN || !this.nextAttemptTime) {
      return null;
    }
    const msRemaining = Math.max(0, this.nextAttemptTime - this._now());
    if (msRemaining < 60000) {
      return `${Math.ceil(msRemaining / 1000)}s`;
    } else if (msRemaining < 3600000) {
      return `${Math.ceil(msRemaining / 60000)}m`;
    } else {
      return `${(msRemaining / 3600000).toFixed(1)}h`;
    }
  }
}

class AdaptiveCircuitBreakerManager {
  breakers: Map<string, AdaptiveCircuitBreaker>;
  defaultOptions: CircuitBreakerOptions;

  constructor(defaultOptions: CircuitBreakerOptions = {}) {
    this.breakers = new Map();
    this.defaultOptions = {
      failureThreshold: 3,
      baseTimeout: 30000,
      maxTimeout: 3600000,
      backoffMultiplier: 2,
      ...defaultOptions
    };
  }

  getBreaker(name: string, options: CircuitBreakerOptions = {}) {
    if (!this.breakers.has(name)) {
      const breakerOptions = { ...this.defaultOptions, ...options, name };
      this.breakers.set(name, new AdaptiveCircuitBreaker(breakerOptions));
    }
    return this.breakers.get(name)!;
  }

  async execute<T>(name: string, fn: () => Promise<T>, options: { bypassIfOpen?: boolean; reason?: string } = {}): Promise<T> {
    const breaker = this.getBreaker(name);
    return breaker.execute(fn, options);
  }

  reset(name: string) {
    const breaker = this.breakers.get(name);
    if (breaker) {
      breaker.reset();
    }
  }

  getAllStatus() {
    const status: Record<string, ReturnType<AdaptiveCircuitBreaker['getStatus']>> = {};
    for (const [name, breaker] of this.breakers) {
      status[name] = breaker.getStatus();
    }
    return status;
  }
}

type BreakerStatus = ReturnType<AdaptiveCircuitBreaker['getStatus']>;
type BreakerStatusMap = ReturnType<AdaptiveCircuitBreakerManager['getAllStatus']>;

export {
  AdaptiveCircuitBreaker,
  AdaptiveCircuitBreakerManager,
  CircuitState
};
export type { BreakerStatus, BreakerStatusMap, CircuitBreakerOptions };
