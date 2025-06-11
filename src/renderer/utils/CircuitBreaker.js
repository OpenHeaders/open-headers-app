const { createLogger } = require('../utils/logger');
const log = createLogger('CircuitBreaker');
const timeManager = require('../services/TimeManager');

/**
 * Circuit Breaker states
 */
const CircuitState = {
  CLOSED: 'CLOSED',       // Normal operation
  OPEN: 'OPEN',          // Failing, reject all requests
  HALF_OPEN: 'HALF_OPEN' // Testing if service recovered
};

/**
 * Circuit Breaker implementation to prevent cascading failures
 */
class CircuitBreaker {
  constructor(options = {}) {
    this.name = options.name || 'unnamed';
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000; // 1 minute
    this.halfOpenMaxAttempts = options.halfOpenMaxAttempts || 3;
    
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenAttempts = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    
    // Metrics
    this.metrics = {
      totalRequests: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      circuitOpenCount: 0,
      lastStateChange: timeManager.now()
    };
  }

  /**
   * Execute a function with circuit breaker protection
   * @param {Function} fn Function to execute
   * @returns {Promise<any>} Result of the function
   */
  async execute(fn) {
    this.metrics.totalRequests++;
    
    // Check if we should attempt the request
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

  /**
   * Check if we can attempt a request
   */
  canAttempt() {
    const now = timeManager.now();
    
    switch (this.state) {
      case CircuitState.CLOSED:
        return true;
        
      case CircuitState.OPEN:
        // Check if we should transition to half-open
        if (now >= this.nextAttemptTime) {
          this.transitionTo(CircuitState.HALF_OPEN);
          return true;
        }
        return false;
        
      case CircuitState.HALF_OPEN:
        // Allow limited attempts in half-open state
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
        // Reset failure count on success
        this.failureCount = 0;
        break;
        
      case CircuitState.HALF_OPEN:
        // Transition back to closed after successful attempt
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
    this.lastFailureTime = timeManager.now();
    
    switch (this.state) {
      case CircuitState.CLOSED:
        // Check if we've hit the failure threshold
        if (this.failureCount >= this.failureThreshold) {
          this.transitionTo(CircuitState.OPEN);
        }
        break;
        
      case CircuitState.HALF_OPEN:
        // Failed in half-open, go back to open
        this.halfOpenAttempts++;
        if (this.halfOpenAttempts >= this.halfOpenMaxAttempts) {
          this.transitionTo(CircuitState.OPEN);
        }
        break;
    }
  }

  /**
   * Transition to a new state
   */
  transitionTo(newState) {
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
        break;
        
      case CircuitState.OPEN:
        this.metrics.circuitOpenCount++;
        this.nextAttemptTime = timeManager.now() + this.resetTimeout;
        break;
        
      case CircuitState.HALF_OPEN:
        this.halfOpenAttempts = 0;
        break;
    }
  }

  /**
   * Get current state and metrics
   */
  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      nextAttemptTime: this.nextAttemptTime,
      metrics: { ...this.metrics }
    };
  }

  /**
   * Manually reset the circuit breaker
   */
  reset() {
    log.info(`Manually resetting circuit breaker ${this.name}`);
    this.transitionTo(CircuitState.CLOSED);
  }

  /**
   * Check if circuit is open
   */
  isOpen() {
    return this.state === CircuitState.OPEN;
  }

  /**
   * Check if circuit is closed
   */
  isClosed() {
    return this.state === CircuitState.CLOSED;
  }
}

/**
 * Circuit Breaker Manager for managing multiple circuit breakers
 */
class CircuitBreakerManager {
  constructor() {
    this.breakers = new Map();
  }

  /**
   * Get or create a circuit breaker
   */
  getBreaker(name, options = {}) {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker({ name, ...options }));
    }
    return this.breakers.get(name);
  }

  /**
   * Execute with circuit breaker protection
   */
  async execute(name, fn, options = {}) {
    const breaker = this.getBreaker(name, options);
    return breaker.execute(fn);
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

  /**
   * Reset specific circuit breaker
   */
  reset(name) {
    const breaker = this.breakers.get(name);
    if (breaker) {
      breaker.reset();
    }
  }

  /**
   * Reset all circuit breakers
   */
  resetAll() {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Check if any circuit is open
   */
  hasOpenCircuits() {
    for (const breaker of this.breakers.values()) {
      if (breaker.isOpen()) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get open circuit names
   */
  getOpenCircuits() {
    const openCircuits = [];
    for (const [name, breaker] of this.breakers) {
      if (breaker.isOpen()) {
        openCircuits.push(name);
      }
    }
    return openCircuits;
  }
}

// Export singleton instance
const circuitBreakerManager = new CircuitBreakerManager();

module.exports = {
  CircuitBreaker,
  CircuitBreakerManager,
  circuitBreakerManager,
  CircuitState
};