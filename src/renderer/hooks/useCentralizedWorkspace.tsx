import { useState, useEffect, useMemo } from 'react';
import { getCentralizedWorkspaceService, type WorkspaceServiceState } from '../services/CentralizedWorkspaceService';
import { useCentralizedEnvironments } from './useCentralizedEnvironments';

// Re-export hooks from workspace module
export { useWorkspaces, useSources, useHeaderRules, useProxyRules } from './workspace';

/**
 * Main hook for accessing all workspace functionality
 */
export function useCentralizedWorkspace() {
  const service = useMemo(() => getCentralizedWorkspaceService(), []);
  const [state, setState] = useState(service.getState());

  useEffect(() => {
    // Hydrate from main process on first mount
    if (!service.getState().initialized) {
      service.initialize().catch(e => {
        console.error('Failed to initialize workspace service:', e);
      });
    }

    const unsubscribe = service.subscribe((newState: WorkspaceServiceState) => {
      setState(newState);
    });
    return () => { unsubscribe(); };
  }, [service]);

  return {
    ...state,
    service,
    isReady: state.initialized && !state.loading
  };
}

/**
 * Hook for environment management - delegates to CentralizedEnvironmentService
 */
export function useEnvironments() {
  // Directly use the centralized environments hook
  return useCentralizedEnvironments();
}
