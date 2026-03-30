import { useEffect, useMemo, useState } from 'react';
import type { EnvironmentServiceState } from '@/renderer/services/CentralizedEnvironmentService';
import {
  type CentralizedEnvironmentService,
  getCentralizedEnvironmentService,
} from '@/renderer/services/CentralizedEnvironmentService';

interface UseEnvironmentCoreReturn extends EnvironmentServiceState {
  service: CentralizedEnvironmentService;
}

/**
 * Core hook to access centralized environment service state.
 *
 * Environment state is now owned by the main process (WorkspaceStateService).
 * The service receives environments + activeEnvironment via workspace:state-patch
 * IPC events automatically — no need for workspace-switch-triggered reloads.
 */
export function useEnvironmentCore(): UseEnvironmentCoreReturn {
  const service = useMemo(() => getCentralizedEnvironmentService(), []);
  const [state, setState] = useState<EnvironmentServiceState>(() => service.getState());

  // Subscribe to environment service state changes
  useEffect(() => {
    const unsubscribe = service.subscribe((newState) => {
      setState(newState);
    });
    return () => {
      unsubscribe();
    };
  }, [service]);

  // Initialize environment service on first mount
  useEffect(() => {
    if (!state.isReady && !state.isLoading) {
      service.initialize().catch((e) => {
        console.error('Failed to initialize environment service:', e);
      });
    }
  }, [service, state.isReady, state.isLoading]);

  return {
    ...state,
    service,
  };
}
