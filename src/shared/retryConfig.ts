/**
 * Global Retry and Circuit Breaker Configuration — shared between renderer and main process.
 * Centralized configuration for all retry timing and circuit breaker behavior.
 */

/** Pre-circuit breaker retry configuration */
export const INITIAL_RETRY_CONFIG = {
    failuresBeforeCircuitOpen: 3,
    baseDelay: 5000,
    maxJitter: 5000,
};

/** Circuit breaker configuration */
export const CIRCUIT_BREAKER_CONFIG = {
    failureThreshold: INITIAL_RETRY_CONFIG.failuresBeforeCircuitOpen,
    baseTimeout: 30000,
    maxTimeout: 3600000,
    backoffMultiplier: 2,
    timeoutJitter: 0.1,
    halfOpenMaxAttempts: 3
};

/** Special handling for overdue sources */
export const OVERDUE_RETRY_CONFIG = {
    /** Small stagger for healthy overdue sources (e.g., app just restarted).
     *  Keeps multiple sources from firing at the exact same instant. */
    minDelay: 100,
    maxJitter: 400,
    /** How far past the expected refresh time before the overdue checker intervenes */
    overdueBuffer: 5000,
    /** Retry delay when circuit breaker is open (actual error recovery — longer) */
    circuitBreakerRetryDelay: {
        base: 1000,
        maxJitter: 2000
    }
};

/** Calculate retry delay with jitter */
export const calculateDelayWithJitter = (baseDelay: number, maxJitter: number): number => {
    return baseDelay + Math.floor(Math.random() * maxJitter);
};

/** Format circuit breaker key for a source */
export const formatCircuitBreakerKey = (sourceType: string, sourceId: string): string => {
    return `${sourceType}-${sourceId}`;
};
