import { useCallback } from 'react';
import { useCentralizedWorkspace } from '../useCentralizedWorkspace';
import { showMessage } from '../../utils/ui/messageUtil';
import { createLogger } from '../../utils/error-handling/logger';
import type { Workspace, WorkspaceSyncStatus, WorkspaceType } from '../../../types/workspace';
const log = createLogger('useWorkspaces');

interface UseWorkspacesReturn {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  syncStatus: Record<string, WorkspaceSyncStatus>;
  loading: boolean;
  createWorkspace: (workspace: Partial<Workspace> & { id: string; name: string; type: WorkspaceType }) => Promise<Workspace | null>;
  switchWorkspace: (workspaceId: string) => Promise<boolean>;
  deleteWorkspace: (workspaceId: string) => Promise<boolean>;
  updateWorkspace: (workspaceId: string, updates: Partial<Workspace>) => Promise<boolean>;
  syncWorkspace: (workspaceId: string, options?: { silent?: boolean }) => Promise<boolean>;
  cloneWorkspaceToPersonal: (workspaceId: string, newName?: string | null) => Promise<Workspace | null>;
}

/**
 * Hook for workspace management
 */
export function useWorkspaces(): UseWorkspacesReturn {
  const {
    workspaces,
    activeWorkspaceId,
    syncStatus,
    loading,
    service
  } = useCentralizedWorkspace();

  const createWorkspace = useCallback(async (workspace: Partial<Workspace> & { id: string; name: string; type: WorkspaceType }): Promise<Workspace | null> => {
    try {
      // Ensure workspace has an ID
      const workspaceData = {
        ...workspace,
        id: workspace.id || Date.now().toString()
      };

      // Use the service method to create workspace (handles validation, data init, and auto-switch)
      const result = await service.createWorkspace(workspaceData);

      showMessage('success', `Workspace '${workspaceData.name}' created and activated`);
      return result;
    } catch (error: unknown) {
      showMessage('error', error instanceof Error ? error.message : String(error));
      return null;
    }
  }, [service]);

  const switchWorkspace = useCallback(async (workspaceId: string): Promise<boolean> => {
    try {
      log.info(`[useWorkspaces] Starting workspace switch to: ${workspaceId}`);

      // Use the enhanced switchWorkspace method with progress tracking
      await service.switchWorkspace(workspaceId);

      log.info(`[useWorkspaces] Workspace switch completed successfully`);
      return true;
    } catch (error: unknown) {
      log.error(`[useWorkspaces] Workspace switch failed:`, error);
      showMessage('error', `Failed to switch workspace: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }, [service]);

  const deleteWorkspace = useCallback(async (workspaceId: string): Promise<boolean> => {
    if (workspaceId === 'default-personal') {
      showMessage('error', 'Cannot delete default personal workspace');
      return false;
    }

    try {
      // Use the service method to delete workspace
      const result = await service.deleteWorkspace(workspaceId);

      if (result) {
        showMessage('success', 'Workspace deleted');
      }
      return result;
    } catch (error: unknown) {
      showMessage('error', error instanceof Error ? error.message : String(error));
      return false;
    }
  }, [service]);

  const updateWorkspace = useCallback(async (workspaceId: string, updates: Partial<Workspace>): Promise<boolean> => {
    try {
      // Use the service method to update workspace
      const result = await service.updateWorkspace(workspaceId, updates);

      if (result) {
        // If this is the active workspace and it's a git workspace, notify main process
        // to handle auto-sync changes
        const workspace = service.state.workspaces.find(w => w.id === workspaceId);
        if (workspaceId === activeWorkspaceId && workspace?.type === 'git') {
          if (window.electronAPI && window.electronAPI.send) {
            window.electronAPI.send('workspace-updated', {
              workspaceId,
              workspace: { ...workspace, ...updates }
            });
          }
        }

        showMessage('success', 'Workspace updated');
      }
      return result;
    } catch (error: unknown) {
      showMessage('error', error instanceof Error ? error.message : String(error));
      return false;
    }
  }, [service, activeWorkspaceId]);

  const syncWorkspace = useCallback(async (workspaceId: string, options: { silent?: boolean } = {}): Promise<boolean> => {
    try {
      const workspace = workspaces.find(w => w.id === workspaceId);
      if (!workspace) {
        throw new Error('Workspace not found');
      }

      if (workspace.type !== 'git') {
        throw new Error('Only git-based workspaces can be synced');
      }

      // Update sync status - use service.state.syncStatus to avoid stale closure issues
      // when multiple workspaces are syncing concurrently
      service.setState({
        syncStatus: { ...service.state.syncStatus, [workspaceId]: { syncing: true } }
      }, ['syncStatus']);

      // Call electron API to sync
      const result = await window.electronAPI.syncGitWorkspace(workspaceId);

      if (result.success) {
        // Update sync status with last sync time - use service.state.syncStatus
        // to get current state and avoid overwriting other workspaces' sync status
        service.setState({
          syncStatus: {
            ...service.state.syncStatus,
            [workspaceId]: {
              syncing: false,
              lastSync: new Date().toISOString(),
              error: null
            }
          }
        }, ['syncStatus']);

        // Reload workspace data if it was the active one
        if (workspaceId === activeWorkspaceId) {
          await service.loadWorkspaceData(workspaceId);
        }

        // Only show success message if not explicitly disabled
        if (options.silent !== true) {
          showMessage('success', 'Workspace synced successfully');
        }
      } else {
        throw new Error(result.error || 'Sync failed');
      }

      return result.success;
    } catch (error: unknown) {
      // Update sync status with error - use service.state.syncStatus
      // to get current state and avoid overwriting other workspaces' sync status
      service.setState({
        syncStatus: {
          ...service.state.syncStatus,
          [workspaceId]: {
            syncing: false,
            error: error instanceof Error ? error.message : String(error)
          }
        }
      }, ['syncStatus']);

      showMessage('error', `Sync failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }, [service, workspaces, activeWorkspaceId]);

  const cloneWorkspaceToPersonal = useCallback(async (workspaceId: string, newName: string | null = null): Promise<Workspace | null> => {
    try {
      const workspace = workspaces.find(w => w.id === workspaceId);
      if (!workspace) {
        throw new Error('Workspace not found');
      }

      // Create a new personal workspace based on the team workspace
      const clonedWorkspace = {
        ...workspace,
        id: `personal-${Date.now()}`,
        name: newName || `${workspace.name} (Personal Copy)`,
        type: 'personal' as const,
        isPersonal: true,
        isTeam: false,
        gitUrl: undefined,
        createdAt: new Date().toISOString(),
        clonedFrom: workspaceId
      };

      // First, create the workspace without switching to it
      // We'll manually handle the creation to avoid auto-switch
      const newWorkspace = service.workspaceManager.createWorkspace(service.state.workspaces, clonedWorkspace);

      // Add to workspaces list
      const updatedWorkspaces = [...service.state.workspaces, newWorkspace];
      service.setState({ workspaces: updatedWorkspaces }, ['workspaces']);

      // Initialize empty data containers
      await service.initializeWorkspaceData(newWorkspace.id);

      // Save workspaces configuration
      await service.saveWorkspaces();

      // Now copy the data BEFORE switching
      await service.copyWorkspaceData(workspaceId, newWorkspace.id);

      // Now switch to the workspace with all data already in place
      await service.switchWorkspace(newWorkspace.id);

      showMessage('success', `Created personal copy of '${workspace.name}' and switched to it`);
      return newWorkspace;
    } catch (error: unknown) {
      showMessage('error', error instanceof Error ? error.message : String(error));
      return null;
    }
  }, [service, workspaces, activeWorkspaceId]);

  return {
    workspaces,
    activeWorkspaceId,
    syncStatus,
    loading,
    createWorkspace,
    switchWorkspace,
    deleteWorkspace,
    updateWorkspace,
    syncWorkspace,
    cloneWorkspaceToPersonal
  };
}
