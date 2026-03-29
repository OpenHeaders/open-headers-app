/**
 * IPC handlers for WorkspaceStateService.
 *
 * All workspace state mutations flow through these handlers.
 * The renderer calls ipcRenderer.invoke() and receives results.
 */

import { ipcMain } from 'electron';
import workspaceStateService from '../../../../services/workspace/WorkspaceStateService';
import { errorMessage } from '../../../../types/common';
import type { ProxyRule } from '../../../../types/proxy';
import type { HeaderRule } from '../../../../types/rules';
import type { Source, SourceUpdate } from '../../../../types/source';
import type { Workspace, WorkspaceType } from '../../../../types/workspace';
import mainLogger from '../../../../utils/mainLogger';

const { createLogger } = mainLogger;
const log = createLogger('WorkspaceStateHandlers');

export function registerWorkspaceStateHandlers(): void {
  // ── State access ──────────────────────────────────────────────

  ipcMain.handle('workspace-state:initialize', async () => {
    try {
      if (!workspaceStateService.getState().initialized) {
        await workspaceStateService.initialize();
      }
      return { success: true, state: workspaceStateService.getState() };
    } catch (error) {
      log.error('Initialize failed:', error);
      return { success: false, error: errorMessage(error), state: workspaceStateService.getState() };
    }
  });

  ipcMain.handle('workspace-state:get-state', () => {
    return workspaceStateService.getState();
  });

  // ── Workspace switching ───────────────────────────────────────

  ipcMain.handle('workspace-state:switch-workspace', async (_event, workspaceId: string) => {
    try {
      await workspaceStateService.switchWorkspace(workspaceId);
      return { success: true };
    } catch (error) {
      log.error('Switch workspace failed:', error);
      return { success: false, error: errorMessage(error) };
    }
  });

  // ── Source CRUD ────────────────────────────────────────────────

  ipcMain.handle('workspace-state:add-source', async (_event, sourceData: Source) => {
    try {
      const source = await workspaceStateService.addSource(sourceData);
      return { success: true, source };
    } catch (error) {
      log.error('Add source failed:', error);
      return { success: false, error: errorMessage(error) };
    }
  });

  ipcMain.handle('workspace-state:update-source', async (_event, sourceId: string, updates: SourceUpdate) => {
    try {
      const source = await workspaceStateService.updateSource(sourceId, updates);
      return { success: true, source };
    } catch (error) {
      log.error('Update source failed:', error);
      return { success: false, error: errorMessage(error) };
    }
  });

  ipcMain.handle('workspace-state:remove-source', async (_event, sourceId: string) => {
    try {
      await workspaceStateService.removeSource(sourceId);
      return { success: true };
    } catch (error) {
      log.error('Remove source failed:', error);
      return { success: false, error: errorMessage(error) };
    }
  });

  ipcMain.handle('workspace-state:update-source-content', async (_event, sourceId: string, content: string) => {
    try {
      await workspaceStateService.updateSourceContent(sourceId, content);
      return { success: true };
    } catch (error) {
      log.error('Update source content failed:', error);
      return { success: false, error: errorMessage(error) };
    }
  });

  ipcMain.handle('workspace-state:refresh-source', async (_event, sourceId: string) => {
    try {
      const result = await workspaceStateService.refreshSource(sourceId);
      return { success: result };
    } catch (error) {
      log.error('Refresh source failed:', error);
      return { success: false, error: errorMessage(error) };
    }
  });

  ipcMain.handle('workspace-state:import-sources', async (_event, sources: Source[], replace: boolean) => {
    try {
      await workspaceStateService.importSources(sources, replace);
      return { success: true };
    } catch (error) {
      log.error('Import sources failed:', error);
      return { success: false, error: errorMessage(error) };
    }
  });

  // ── Header Rule CRUD ──────────────────────────────────────────

  ipcMain.handle('workspace-state:add-header-rule', async (_event, ruleData: Partial<HeaderRule>) => {
    try {
      await workspaceStateService.addHeaderRule(ruleData);
      return { success: true };
    } catch (error) {
      log.error('Add header rule failed:', error);
      return { success: false, error: errorMessage(error) };
    }
  });

  ipcMain.handle('workspace-state:update-header-rule', async (_event, ruleId: string, updates: Partial<HeaderRule>) => {
    try {
      await workspaceStateService.updateHeaderRule(ruleId, updates);
      return { success: true };
    } catch (error) {
      log.error('Update header rule failed:', error);
      return { success: false, error: errorMessage(error) };
    }
  });

  ipcMain.handle('workspace-state:remove-header-rule', async (_event, ruleId: string) => {
    try {
      await workspaceStateService.removeHeaderRule(ruleId);
      return { success: true };
    } catch (error) {
      log.error('Remove header rule failed:', error);
      return { success: false, error: errorMessage(error) };
    }
  });

  // ── Proxy Rule CRUD ───────────────────────────────────────────

  ipcMain.handle('workspace-state:add-proxy-rule', async (_event, ruleData: ProxyRule) => {
    try {
      await workspaceStateService.addProxyRule(ruleData);
      return { success: true };
    } catch (error) {
      log.error('Add proxy rule failed:', error);
      return { success: false, error: errorMessage(error) };
    }
  });

  ipcMain.handle('workspace-state:remove-proxy-rule', async (_event, ruleId: string) => {
    try {
      await workspaceStateService.removeProxyRule(ruleId);
      return { success: true };
    } catch (error) {
      log.error('Remove proxy rule failed:', error);
      return { success: false, error: errorMessage(error) };
    }
  });

  // ── Workspace CRUD ────────────────────────────────────────────

  ipcMain.handle(
    'workspace-state:create-workspace',
    async (_event, workspace: Partial<Workspace> & { id: string; name: string; type: WorkspaceType }) => {
      try {
        const created = await workspaceStateService.createWorkspace(workspace);
        return { success: true, workspace: created };
      } catch (error) {
        log.error('Create workspace failed:', error);
        return { success: false, error: errorMessage(error) };
      }
    },
  );

  ipcMain.handle(
    'workspace-state:update-workspace',
    async (_event, workspaceId: string, updates: Partial<Workspace>) => {
      try {
        await workspaceStateService.updateWorkspace(workspaceId, updates);
        return { success: true };
      } catch (error) {
        log.error('Update workspace failed:', error);
        return { success: false, error: errorMessage(error) };
      }
    },
  );

  ipcMain.handle('workspace-state:delete-workspace', async (_event, workspaceId: string) => {
    try {
      await workspaceStateService.deleteWorkspace(workspaceId);
      return { success: true };
    } catch (error) {
      log.error('Delete workspace failed:', error);
      return { success: false, error: errorMessage(error) };
    }
  });

  ipcMain.handle(
    'workspace-state:copy-workspace-data',
    async (_event, sourceWorkspaceId: string, targetWorkspaceId: string) => {
      try {
        await workspaceStateService.copyWorkspaceData(sourceWorkspaceId, targetWorkspaceId);
        return { success: true };
      } catch (error) {
        log.error('Copy workspace data failed:', error);
        return { success: false, error: errorMessage(error) };
      }
    },
  );

  ipcMain.handle('workspace-state:sync-workspace', async (_event, workspaceId: string) => {
    try {
      const result = await workspaceStateService.syncWorkspace(workspaceId);
      return result;
    } catch (error) {
      log.error('Sync workspace failed:', error);
      return { success: false, error: errorMessage(error) };
    }
  });

  // ── Environment CRUD ───────────────────────────────────────────

  ipcMain.handle('workspace-state:get-environment-state', () => {
    return workspaceStateService.getEnvironmentState();
  });

  ipcMain.handle('workspace-state:create-environment', async (_event, name: string) => {
    try {
      await workspaceStateService.createEnvironment(name);
      return { success: true };
    } catch (error) {
      log.error('Create environment failed:', error);
      return { success: false, error: errorMessage(error) };
    }
  });

  ipcMain.handle('workspace-state:delete-environment', async (_event, name: string) => {
    try {
      await workspaceStateService.deleteEnvironment(name);
      return { success: true };
    } catch (error) {
      log.error('Delete environment failed:', error);
      return { success: false, error: errorMessage(error) };
    }
  });

  ipcMain.handle('workspace-state:switch-environment', async (_event, name: string) => {
    try {
      await workspaceStateService.switchEnvironment(name);
      return { success: true };
    } catch (error) {
      log.error('Switch environment failed:', error);
      return { success: false, error: errorMessage(error) };
    }
  });

  ipcMain.handle(
    'workspace-state:set-variable',
    async (_event, name: string, value: string | null, environment: string, isSecret: boolean) => {
      try {
        await workspaceStateService.setVariable(name, value, environment, isSecret);
        return { success: true };
      } catch (error) {
        log.error('Set variable failed:', error);
        return { success: false, error: errorMessage(error) };
      }
    },
  );

  ipcMain.handle(
    'workspace-state:batch-set-variables',
    async (
      _event,
      environment: string,
      variables: Array<{ name: string; value: string | null; isSecret?: boolean }>,
    ) => {
      try {
        await workspaceStateService.batchSetVariables(environment, variables);
        return { success: true };
      } catch (error) {
        log.error('Batch set variables failed:', error);
        return { success: false, error: errorMessage(error) };
      }
    },
  );

  log.info('Workspace state IPC handlers registered');
}
