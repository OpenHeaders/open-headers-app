import { useState, useEffect, useMemo } from 'react';
import { getCentralizedEnvironmentService, CentralizedEnvironmentService } from '../../services/CentralizedEnvironmentService';

export interface EnvironmentVariableEntry {
  value?: string;
  isSecret?: boolean;
  updatedAt?: string;
  [key: string]: unknown;
}

interface EnvironmentCoreState {
  environments: Record<string, Record<string, EnvironmentVariableEntry>>;
  activeEnvironment: string;
  isLoading: boolean;
  isReady: boolean;
  [key: string]: unknown;
}

interface UseEnvironmentCoreReturn extends EnvironmentCoreState {
  service: CentralizedEnvironmentService;
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
    const unsubscribe = service.subscribe((newState: Record<string, unknown>) => {
      setState(newState as EnvironmentCoreState);
    });
    return () => { unsubscribe(); };
  }, [service]);

  return {
    ...state,
    service
  };
}
