import { useCallback } from 'react';
import type { Workspace, WorkspaceSyncStatus, WorkspaceType } from '../../../types/workspace';
import { createLogger } from '../../utils/error-handling/logger';
import { showMessage } from '../../utils/ui/messageUtil';
import { useCentralizedWorkspace } from '../useCentralizedWorkspace';

const log = createLogger('useWorkspaces');

interface UseWorkspacesReturn {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  syncStatus: Record<string, WorkspaceSyncStatus>;
  loading: boolean;
  createWorkspace: (
    workspace: Partial<Workspace> & { id: string; name: string; type: WorkspaceType },
  ) => Promise<Workspace | null>;
  switchWorkspace: (workspaceId: string) => Promise<boolean>;
  deleteWorkspace: (workspaceId: string) => Promise<boolean>;
  updateWorkspace: (workspaceId: string, updates: Partial<Workspace>) => Promise<boolean>;
  syncWorkspace: (workspaceId: string, options?: { silent?: boolean }) => Promise<boolean>;
  cloneWorkspaceToPersonal: (workspaceId: string, newName?: string | null) => Promise<Workspace | null>;
}

/**
 * Hook for workspace management — all mutations go through main process via IPC.
 */
export function useWorkspaces(): UseWorkspacesReturn {
  const { workspaces, activeWorkspaceId, syncStatus, loading, service } = useCentralizedWorkspace();

  const createWorkspace = useCallback(
    async (
      workspace: Partial<Workspace> & { id: string; name: string; type: WorkspaceType },
    ): Promise<Workspace | null> => {
      try {
        const workspaceData = {
          ...workspace,
          id: workspace.id || Date.now().toString(),
        };

        const result = await service.createWorkspace(workspaceData);
        showMessage('success', `Workspace '${workspaceData.name}' created and activated`);
        return result;
      } catch (error: unknown) {
        showMessage('error', error instanceof Error ? error.message : String(error));
        return null;
      }
    },
    [service],
  );

  const switchWorkspace = useCallback(
    async (workspaceId: string): Promise<boolean> => {
      try {
        log.info(`[useWorkspaces] Starting workspace switch to: ${workspaceId}`);
        await service.switchWorkspace(workspaceId);
        log.info(`[useWorkspaces] Workspace switch completed successfully`);
        return true;
      } catch (error: unknown) {
        log.error(`[useWorkspaces] Workspace switch failed:`, error);
        showMessage('error', `Failed to switch workspace: ${error instanceof Error ? error.message : String(error)}`);
        return false;
      }
    },
    [service],
  );

  const deleteWorkspace = useCallback(
    async (workspaceId: string): Promise<boolean> => {
      if (workspaceId === 'default-personal') {
        showMessage('error', 'Cannot delete default personal workspace');
        return false;
      }

      try {
        const result = await service.deleteWorkspace(workspaceId);
        if (result) {
          showMessage('success', 'Workspace deleted');
        }
        return result;
      } catch (error: unknown) {
        showMessage('error', error instanceof Error ? error.message : String(error));
        return false;
      }
    },
    [service],
  );

  const updateWorkspace = useCallback(
    async (workspaceId: string, updates: Partial<Workspace>): Promise<boolean> => {
      try {
        const result = await service.updateWorkspace(workspaceId, updates);
        if (result) {
          showMessage('success', 'Workspace updated');
        }
        return result;
      } catch (error: unknown) {
        showMessage('error', error instanceof Error ? error.message : String(error));
        return false;
      }
    },
    [service],
  );

  const syncWorkspace = useCallback(
    async (workspaceId: string, options: { silent?: boolean } = {}): Promise<boolean> => {
      try {
        const workspace = workspaces.find((w) => w.id === workspaceId);
        if (!workspace) throw new Error('Workspace not found');
        if (workspace.type !== 'git') throw new Error('Only git-based workspaces can be synced');

        const result = await service.syncWorkspace(workspaceId);

        if (result) {
          if (options.silent !== true) {
            showMessage('success', 'Workspace synced successfully');
          }
        }

        return result;
      } catch (error: unknown) {
        showMessage('error', `Sync failed: ${error instanceof Error ? error.message : String(error)}`);
        return false;
      }
    },
    [service, workspaces],
  );

  const cloneWorkspaceToPersonal = useCallback(
    async (workspaceId: string, newName: string | null = null): Promise<Workspace | null> => {
      try {
        const workspace = workspaces.find((w) => w.id === workspaceId);
        if (!workspace) throw new Error('Workspace not found');

        // Create a personal copy via main process
        const clonedWorkspace = {
          id: `personal-${Date.now()}`,
          name: newName || `${workspace.name} (Personal Copy)`,
          type: 'personal' as const,
          isPersonal: true,
          isTeam: false,
          createdAt: new Date().toISOString(),
          clonedFrom: workspaceId,
        };

        const result = await service.createWorkspace(clonedWorkspace);

        // Copy data from source workspace
        await service.copyWorkspaceData(workspaceId, result.id);

        // Switch to the new workspace
        await service.switchWorkspace(result.id);

        showMessage('success', `Created personal copy of '${workspace.name}' and switched to it`);
        return result;
      } catch (error: unknown) {
        showMessage('error', error instanceof Error ? error.message : String(error));
        return null;
      }
    },
    [service, workspaces],
  );

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
    cloneWorkspaceToPersonal,
  };
}
