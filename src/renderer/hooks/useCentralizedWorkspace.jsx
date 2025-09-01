import { useState, useEffect, useMemo } from 'react';
import { getCentralizedWorkspaceService } from '../services/CentralizedWorkspaceService';
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
    return service.subscribe((newState) => {
      setState(newState);
      
      // Remove per-hook logging to avoid spam
      // Logging should be done in the service itself
    });
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