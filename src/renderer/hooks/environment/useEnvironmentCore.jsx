import { useState, useEffect, useMemo } from 'react';
import { getCentralizedEnvironmentService } from '../../services/CentralizedEnvironmentService';

/**
 * Core hook to access centralized environment service state
 * Used by other environment hooks as a base
 */
export function useEnvironmentCore() {
  const service = useMemo(() => getCentralizedEnvironmentService(), []);
  const [state, setState] = useState(service.getState());


  // Subscribe to service state changes
  useEffect(() => {
    return service.subscribe(setState);
  }, [service]);

  return {
    ...state,
    service
  };
}