const { createLogger } = require('./logger');
const timeManager = require('../../services/TimeManager');

const log = createLogger('AdaptiveCircuitBreaker');

const CircuitState = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN'
};

/**
 * Adaptive Circuit Breaker with exponential backoff
 */
class AdaptiveCircuitBreaker {
  constructor(options = {}) {
    this.name = options.name || 'unnamed';
    this.failureThreshold = options.failureThreshold || 5;
    this.halfOpenMaxAttempts = options.halfOpenMaxAttempts || 3;
    
    this.baseTimeout = options.baseTimeout || 30000;
    this.maxTimeout = options.maxTimeout || 3600000;
    this.backoffMultiplier = options.backoffMultiplier || 2;
    this.timeoutJitter = options.timeoutJitter || 0.1;
    
    this.resetTimeout = this.baseTimeout;
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenAttempts = 0;
    this.nextAttemptTime = null;
    
    this.consecutiveOpenings = 0;
    this.lastSuccessTime = timeManager.now();
    this.totalFailuresInCycle = 0;
    this.manualBypassActive = false;
    this.metrics = {
      totalRequests: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      circuitOpenCount: 0,
      lastStateChange: timeManager.now(),
      consecutiveOpenings: 0,
      currentTimeout: this.baseTimeout,
      manualBypasses: 0,
      timeoutHistory: []
    };
  }
  
  /**
   * Execute a function with circuit breaker protection
   */
  async execute(fn, options = {}) {
    const { bypassIfOpen = false, reason = 'auto' } = options;
    
    this.metrics.totalRequests++;
    
    if (bypassIfOpen && this.state === CircuitState.OPEN && reason === 'manual') {
      log.info(`Manual bypass requested for circuit breaker ${this.name} in OPEN state`);
      return this.executeWithBypass(fn);
    }
    
    if (!this.canAttempt()) {
      this.metrics.totalFailures++;
      log.warn(`Circuit breaker ${this.name} is OPEN, rejecting request`);
      throw new Error(`Circuit breaker ${this.name} is OPEN`);
    }
    
    try {
      log.debug(`Circuit breaker ${this.name} executing function (state: ${this.state})`);
      const result = await fn();
      this.onSuccess();
      log.debug(`Circuit breaker ${this.name} execution successful`);
      return result;
    } catch (error) {
      log.error(`Circuit breaker ${this.name} execution failed: ${error.message}`);
      this.onFailure();
      throw error;
    }
  }
  
  /**
   * Execute function with manual bypass
   */
  async executeWithBypass(fn) {
    this.metrics.manualBypasses++;
    this.manualBypassActive = true;
    
    try {
      log.info(`Executing manual bypass for ${this.name}`);
      const result = await fn();
      
      log.info(`Manual bypass succeeded for ${this.name}, resetting circuit`);
      this.reset();
      this.manualBypassActive = false;
      
      return result;
    } catch (error) {
      log.warn(`Manual bypass failed for ${this.name}: ${error.message}`);
      this.manualBypassActive = false;
      this.metrics.totalFailures++;
      
      throw error;
    }
  }

  /**
   * Check if we can attempt a request
   */
  canAttempt() {
    const now = timeManager.now();
    
    switch (this.state) {
      case CircuitState.CLOSED:
        return true;
        
      case CircuitState.OPEN:
        if (now >= this.nextAttemptTime) {
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

  /**
   * Handle successful request
   */
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

  /**
   * Handle failed request
   */
  onFailure() {
    this.metrics.totalFailures++;
    this.failureCount++;
    this.totalFailuresInCycle++;
    
    log.warn(`Circuit breaker ${this.name} failure recorded: ${this.failureCount}/${this.failureThreshold} (state: ${this.state}), total in cycle: ${this.totalFailuresInCycle}`);
    
    switch (this.state) {
      case CircuitState.CLOSED:
        if (this.failureCount >= this.failureThreshold) {
          log.error(`Circuit breaker ${this.name} failure threshold reached (${this.failureCount}/${this.failureThreshold}), opening circuit`);
          this.transitionTo(CircuitState.OPEN);
        }
        break;
        
      case CircuitState.HALF_OPEN:
        // Immediately transition back to OPEN after first failure
        this.halfOpenAttempts++;
        log.warn(`Circuit breaker ${this.name} failed in HALF_OPEN state, transitioning back to OPEN immediately`);
        this.transitionTo(CircuitState.OPEN, { maintainBackoffLevel: true });
        break;
    }
  }
  
  /**
   * Transition to a new state with exponential backoff
   */
  transitionTo(newState, options = {}) {
    const oldState = this.state;
    this.state = newState;
    this.metrics.lastStateChange = timeManager.now();
    
    log.info(`Circuit breaker ${this.name} transitioned from ${oldState} to ${newState}`);
    
    switch (newState) {
      case CircuitState.CLOSED:
        this.failureCount = 0;
        this.successCount = 0;
        this.halfOpenAttempts = 0;
        this.nextAttemptTime = null;
        this.totalFailuresInCycle = 0;
        
        if (oldState !== CircuitState.CLOSED) {
          const now = timeManager.now();
          const timeSinceLastSuccess = now - this.lastSuccessTime;
          
          // Gradual backoff reduction based on time since last success
          if (timeSinceLastSuccess > 300000 && this.consecutiveOpenings > 0) {
            this.consecutiveOpenings = Math.floor(this.consecutiveOpenings / 2);
            log.info(`Circuit breaker ${this.name} closed after long recovery, reducing consecutive openings to ${this.consecutiveOpenings}`);
          } else if (this.consecutiveOpenings > 0) {
            this.consecutiveOpenings = Math.max(0, this.consecutiveOpenings - 1);
            log.info(`Circuit breaker ${this.name} closed but maintaining backoff state, consecutive openings: ${this.consecutiveOpenings}`);
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
        }
        break;
        
      case CircuitState.OPEN:
        this.metrics.circuitOpenCount++;
        
        if (!options.maintainBackoffLevel) {
          this.consecutiveOpenings++;
        }
        
        // Calculate exponential backoff based on failure cycle
        const backoffLevel = Math.floor((this.totalFailuresInCycle - 1) / this.failureThreshold);
        const baseBackoff = Math.min(
          this.baseTimeout * Math.pow(this.backoffMultiplier, backoffLevel),
          this.maxTimeout
        );
        
        // Add jitter to prevent thundering herd
        const jitter = baseBackoff * this.timeoutJitter * (Math.random() - 0.5);
        this.resetTimeout = Math.round(baseBackoff + jitter);
        
        this.nextAttemptTime = timeManager.now() + this.resetTimeout;
        
        this.metrics.consecutiveOpenings = this.consecutiveOpenings;
        this.metrics.currentTimeout = this.resetTimeout;
        this.metrics.timeoutHistory.push({
          timestamp: timeManager.now(),
          timeout: this.resetTimeout,
          opening: this.consecutiveOpenings
        });
        
        if (this.metrics.timeoutHistory.length > 10) {
          this.metrics.timeoutHistory.shift();
        }
        
        log.info(`Circuit breaker ${this.name} opening (${this.totalFailuresInCycle} total failures), timeout: ${this.resetTimeout}ms`);
        break;
        
      case CircuitState.HALF_OPEN:
        this.halfOpenAttempts = 0;
        break;
    }
  }
  
  /**
   * Get status including backoff information
   */
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
          Math.max(0, this.nextAttemptTime - timeManager.now()) : 0,
        timeUntilNextAttemptMs: this.nextAttemptTime ? 
          Math.max(0, this.nextAttemptTime - timeManager.now()) : 0
      },
      lastSuccessTime: this.lastSuccessTime,
      manualBypassActive: this.manualBypassActive
    };
  }
  
  /**
   * Manually reset the circuit breaker
   */
  reset() {
    log.info(`Manually resetting circuit breaker ${this.name}`);
    this.totalFailuresInCycle = 0; // Reset cycle counter on manual reset
    this.transitionTo(CircuitState.CLOSED);
  }

  /**
   * Check if circuit is open
   */
  isOpen() {
    return this.state === CircuitState.OPEN;
  }
  
  /**
   * Check if circuit breaker should allow manual bypass
   */
  canManualBypass() {
    return this.state === CircuitState.OPEN && !this.manualBypassActive;
  }
  
  /**
   * Get human-readable time until next attempt
   */
  getTimeUntilNextAttempt() {
    if (this.state !== CircuitState.OPEN || !this.nextAttemptTime) {
      return null;
    }
    
    const msRemaining = Math.max(0, this.nextAttemptTime - timeManager.now());
    
    if (msRemaining < 60000) {
      return `${Math.ceil(msRemaining / 1000)}s`;
    } else if (msRemaining < 3600000) {
      return `${Math.ceil(msRemaining / 60000)}m`;
    } else {
      return `${(msRemaining / 3600000).toFixed(1)}h`;
    }
  }
}

/**
 * Circuit Breaker Manager
 */
class AdaptiveCircuitBreakerManager {
  constructor() {
    this.breakers = new Map();
    this.defaultOptions = {
      failureThreshold: 3,
      baseTimeout: 30000,
      maxTimeout: 3600000,
      backoffMultiplier: 2
    };
  }
  
  getBreaker(name, options = {}) {
    if (!this.breakers.has(name)) {
      const breakerOptions = { ...this.defaultOptions, ...options, name };
      this.breakers.set(name, new AdaptiveCircuitBreaker(breakerOptions));
    }
    return this.breakers.get(name);
  }
  
  async execute(name, fn, options = {}) {
    const breaker = this.getBreaker(name, options);
    return breaker.execute(fn, options);
  }
  
  /**
   * Reset specific circuit breaker
   */
  reset(name) {
    const breaker = this.breakers.get(name);
    if (breaker) {
      breaker.reset();
      log.info(`Circuit breaker ${name} manually reset`);
    }
  }
  
  /**
   * Get all circuit breakers status
   */
  getAllStatus() {
    const status = {};
    for (const [name, breaker] of this.breakers) {
      status[name] = breaker.getStatus();
    }
    return status;
  }
}

const adaptiveCircuitBreakerManager = new AdaptiveCircuitBreakerManager();

module.exports = {
  AdaptiveCircuitBreaker,
  AdaptiveCircuitBreakerManager,
  adaptiveCircuitBreakerManager,
  CircuitState
};