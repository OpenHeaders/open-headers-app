// Re-export shared types and classes

import timeManager from '@/renderer/services/TimeManager';
import { AdaptiveCircuitBreaker, AdaptiveCircuitBreakerManager, CircuitState } from '@/shared/AdaptiveCircuitBreaker';

export type { BreakerStatus, BreakerStatusMap } from '@/shared/AdaptiveCircuitBreaker';
export { AdaptiveCircuitBreaker, AdaptiveCircuitBreakerManager, CircuitState };

// Renderer singleton — uses renderer's TimeManager for time
const adaptiveCircuitBreakerManager = new AdaptiveCircuitBreakerManager({
  nowFn: () => timeManager.now(),
});

export { adaptiveCircuitBreakerManager };
