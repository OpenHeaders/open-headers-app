import { useState, useEffect, useMemo, useRef } from 'react';
import { getCentralizedEnvironmentService, CentralizedEnvironmentService } from '../../services/CentralizedEnvironmentService';
import { useCentralizedWorkspace } from '../useCentralizedWorkspace';
import type { EnvironmentServiceState } from '../../services/environment/EnvironmentStateManager';

interface UseEnvironmentCoreReturn extends EnvironmentServiceState {
  service: CentralizedEnvironmentService;
}

/**
 * Core hook to access centralized environment service state.
 *
 * Also wires workspace-switch → environment-reload: when activeWorkspaceId
 * changes (from WorkspaceStateService via IPC patches), this hook calls
 * service.handleWorkspaceChange() to load the new workspace's environments.
 *
 * This replaces the old window event pattern and avoids circular dependencies
 * between CentralizedEnvironmentService and CentralizedWorkspaceService.
 */
export function useEnvironmentCore(): UseEnvironmentCoreReturn {
  const service = useMemo(() => getCentralizedEnvironmentService(), []);
  const [state, setState] = useState<EnvironmentServiceState>(() => service.getState());
  const { activeWorkspaceId } = useCentralizedWorkspace();
  const prevWorkspaceIdRef = useRef<string | null>(null);

  // Subscribe to environment service state changes
  useEffect(() => {
    const unsubscribe = service.subscribe((newState) => {
      setState(newState);
    });
    return () => { unsubscribe(); };
  }, [service]);

  // Initialize environment service on first mount, reload on workspace switch
  useEffect(() => {
    if (prevWorkspaceIdRef.current === null) {
      // First mount — initialize with current workspace
      service.initialize(activeWorkspaceId).catch(e => {
        console.error('Failed to initialize environment service:', e);
      });
    } else if (activeWorkspaceId !== prevWorkspaceIdRef.current) {
      // Workspace switched — reload environments
      service.handleWorkspaceChange(activeWorkspaceId).catch(e => {
        console.error('Failed to reload environments after workspace switch:', e);
      });
    }
    prevWorkspaceIdRef.current = activeWorkspaceId;
  }, [activeWorkspaceId, service]);

  return {
    ...state,
    service
  };
}
