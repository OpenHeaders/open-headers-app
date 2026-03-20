import { useState, useEffect, useMemo } from 'react';
import { getCentralizedEnvironmentService, CentralizedEnvironmentService } from '../../services/CentralizedEnvironmentService';
import type { EnvironmentServiceState } from '../../services/environment/EnvironmentStateManager';
import type { EnvironmentVariable } from '../../../types/environment';

interface UseEnvironmentCoreReturn extends EnvironmentServiceState {
  service: CentralizedEnvironmentService;
}

/**
 * Core hook to access centralized environment service state
 * Used by other environment hooks as a base
 */
export function useEnvironmentCore(): UseEnvironmentCoreReturn {
  const service = useMemo(() => getCentralizedEnvironmentService(), []);
  const [state, setState] = useState<EnvironmentServiceState>(() => service.getState());

  useEffect(() => {
    const unsubscribe = service.subscribe((newState) => {
      setState(newState);
    });
    return () => { unsubscribe(); };
  }, [service]);

  return {
    ...state,
    service
  };
}

