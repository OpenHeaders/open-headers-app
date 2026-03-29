// Re-export shared types and classes
import { AdaptiveCircuitBreaker, AdaptiveCircuitBreakerManager, CircuitState } from '../../../shared/AdaptiveCircuitBreaker';
import timeManager from '../../services/TimeManager';

export { AdaptiveCircuitBreaker, AdaptiveCircuitBreakerManager, CircuitState };
export type { BreakerStatus, BreakerStatusMap } from '../../../shared/AdaptiveCircuitBreaker';

// Renderer singleton — uses renderer's TimeManager for time
const adaptiveCircuitBreakerManager = new AdaptiveCircuitBreakerManager({
    nowFn: () => timeManager.now()
});

export { adaptiveCircuitBreakerManager };
