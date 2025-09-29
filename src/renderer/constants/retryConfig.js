/**
 * Global Retry and Circuit Breaker Configuration
 * 
 * Centralized configuration for all retry timing and circuit breaker behavior
 * throughout the application. This ensures consistent retry behavior and makes
 * it easy to tune the system's resilience patterns.
 * 
 * @module retryConfig
 * @since 3.0.0
 */

/**
 * Pre-circuit breaker retry configuration
 * These settings apply to the first N failures before the circuit breaker opens
 */
export const INITIAL_RETRY_CONFIG = {
    // Number of failures before circuit breaker opens
    failuresBeforeCircuitOpen: 3,
    
    // Base delay for retries before circuit opens (milliseconds)
    baseDelay: 5000, // 5 seconds
    
    // Maximum additional random delay (milliseconds)
    // Actual delay will be: baseDelay + random(0, maxJitter)
    maxJitter: 5000, // up to 5 seconds additional
    
    // Total range: 5-10 seconds per retry
    // This keeps retries within TOTP 30-second windows when possible
};

/**
 * Circuit breaker configuration
 * These settings control the exponential backoff after the circuit opens
 */
export const CIRCUIT_BREAKER_CONFIG = {
    // Number of consecutive failures before opening the circuit
    failureThreshold: INITIAL_RETRY_CONFIG.failuresBeforeCircuitOpen,
    
    // Initial backoff timeout when circuit opens (milliseconds)
    baseTimeout: 30000, // 30 seconds
    
    // Maximum backoff timeout (milliseconds)
    maxTimeout: 3600000, // 1 hour
    
    // Multiplier for exponential backoff
    backoffMultiplier: 2, // doubles each time
    
    // Jitter factor to prevent thundering herd (0.0 - 1.0)
    // Adds randomization: ± (timeout * jitter)
    timeoutJitter: 0.1, // 10% randomization
    
    // Maximum attempts in HALF_OPEN state before returning to OPEN
    halfOpenMaxAttempts: 3
};

/**
 * Special handling for overdue sources
 * When a source misses its scheduled refresh time
 */
export const OVERDUE_RETRY_CONFIG = {
    // Minimum delay when source is overdue but circuit is closed
    minDelay: 5000, // 5 seconds
    
    // Maximum additional random delay for overdue sources
    maxJitter: 5000, // up to 5 seconds additional
    
    // Buffer time to consider a source overdue (milliseconds)
    overdueBuffer: 5000, // 5 seconds
    
    // Special handling for circuit breaker retry timing
    circuitBreakerRetryDelay: {
        base: 1000, // 1 second base
        maxJitter: 2000 // up to 2 seconds additional
    }
};


/**
 * Helper function to calculate retry delay with jitter
 * @param {number} baseDelay - Base delay in milliseconds
 * @param {number} maxJitter - Maximum jitter in milliseconds
 * @returns {number} Calculated delay with jitter
 */
export const calculateDelayWithJitter = (baseDelay, maxJitter) => {
    return baseDelay + Math.floor(Math.random() * maxJitter);
};



/**
 * Format circuit breaker key for a source
 * @param {string} sourceType - Type of source
 * @param {string|number} sourceId - Source identifier
 * @returns {string} Formatted circuit breaker key
 */
export const formatCircuitBreakerKey = (sourceType, sourceId) => {
    return `${sourceType}-${sourceId}`;
};