import { useState, useEffect, useMemo } from 'react';
import { getCentralizedEnvironmentService, CentralizedEnvironmentService } from '../../services/CentralizedEnvironmentService';

export interface EnvironmentVariableEntry {
  value?: string;
  isSecret?: boolean;
  updatedAt?: string;
  // Index sig: downstream services (EnvironmentVariableData, VariableMetadata) require open indexing
  [key: string]: string | boolean | undefined;
}

interface EnvironmentCoreState {
  environments: Record<string, Record<string, EnvironmentVariableEntry>>;
  activeEnvironment: string;
  isLoading: boolean;
  isReady: boolean;
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
    const unsubscribe = service.subscribe((newState) => {
      setState(newState as unknown as EnvironmentCoreState);
    });
    return () => { unsubscribe(); };
  }, [service]);

  return {
    ...state,
    service
  };
}
