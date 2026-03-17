import { useState, useEffect, useMemo } from 'react';
import { getCentralizedEnvironmentService } from '../../services/CentralizedEnvironmentService';

interface EnvironmentCoreState {
  environments: Record<string, any>;
  activeEnvironment: string;
  isLoading: boolean;
  isReady: boolean;
  [key: string]: any;
}

interface UseEnvironmentCoreReturn extends EnvironmentCoreState {
  service: any;
}

/**
 * Core hook to access centralized environment service state
 * Used by other environment hooks as a base
 */
export function useEnvironmentCore(): UseEnvironmentCoreReturn {
  const service = useMemo(() => getCentralizedEnvironmentService(), []);
  const [state, setState] = useState<EnvironmentCoreState>(() => service.getState() as EnvironmentCoreState);


  // Subscribe to service state changes
  useEffect(() => {
    const unsubscribe = service.subscribe((newState: Record<string, any>) => {
      setState(newState as EnvironmentCoreState);
    });
    return () => { unsubscribe(); };
  }, [service]);

  return {
    ...state,
    service
  };
}
