/**
 * WorkspaceManager - Handles workspace CRUD operations and switching
 */
import { createLogger } from '../../utils/error-handling/logger';
import { DATA_FORMAT_VERSION } from '../../../config/version';
import type { Workspace, WorkspaceMetadata, WorkspaceSyncStatus } from '../../../types/workspace';
const log = createLogger('WorkspaceManager');

interface StorageAPI {
  loadFromStorage: (filename: string) => Promise<string | null>;
  saveToStorage: (filename: string, content: string) => Promise<void>;
  deleteDirectory: (dirPath: string) => Promise<{ success: boolean; error?: string }>;
}

export interface WorkspacesConfig {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  syncStatus: Record<string, WorkspaceSyncStatus>;
}

class WorkspaceManager {
  storageAPI: StorageAPI;

  constructor(storageAPI: StorageAPI) {
    this.storageAPI = storageAPI;
  }

  /**
   * Load workspaces configuration
   */
  async loadWorkspaces(): Promise<WorkspacesConfig> {
    try {
      const data = await this.storageAPI.loadFromStorage('workspaces.json');
      if (data) {
        const parsed = JSON.parse(data);
        return {
          workspaces: parsed.workspaces || [],
          activeWorkspaceId: parsed.activeWorkspaceId || 'default-personal',
          syncStatus: parsed.syncStatus || {}
        };
      } else {
        // Initialize with default
        const defaultConfig: WorkspacesConfig = {
          workspaces: [{
            id: 'default-personal',
            name: 'Personal Workspace',
            type: 'personal',
            description: 'Your default personal workspace',
            isDefault: true,
            isPersonal: true,
            isTeam: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            metadata: {
              version: DATA_FORMAT_VERSION,
              sourceCount: 0,
              ruleCount: 0,
              proxyRuleCount: 0
            }
          }],
          activeWorkspaceId: 'default-personal',
          syncStatus: {}
        };
        await this.saveWorkspaces(defaultConfig);
        return defaultConfig;
      }
    } catch (error) {
      log.error('Failed to load workspaces:', error);
      throw error;
    }
  }

  /**
   * Save workspaces configuration
   */
  async saveWorkspaces(config: WorkspacesConfig) {
    try {
      await this.storageAPI.saveToStorage('workspaces.json', JSON.stringify({
        workspaces: config.workspaces,
        activeWorkspaceId: config.activeWorkspaceId,
        syncStatus: config.syncStatus
      }));
    } catch (error) {
      log.error('Failed to save workspaces:', error);
      throw error;
    }
  }

  /**
   * Create a new workspace with enhanced validation
   */
  createWorkspace(workspaces: Workspace[], workspace: Partial<Workspace> & { id: string; name: string; type: Workspace['type'] }): Workspace {
    // Validate workspace ID uniqueness
    if (workspaces.some(w => w.id === workspace.id)) {
      throw new Error(`Workspace with ID ${workspace.id} already exists`);
    }

    // Validate required fields
    if (!workspace.name || !workspace.type) {
      throw new Error('Workspace must have name and type');
    }

    // Validate workspace type
    if (!['personal', 'team', 'git'].includes(workspace.type)) {
      throw new Error('Invalid workspace type. Must be personal, team, or git');
    }

    // Validate workspace name length
    if (workspace.name.length < 1 || workspace.name.length > 100) {
      throw new Error('Workspace name must be between 1 and 100 characters');
    }

    // Validate workspace ID format
    if (!/^[a-zA-Z0-9\-_]+$/.test(workspace.id)) {
      throw new Error('Workspace ID can only contain letters, numbers, hyphens, and underscores');
    }

    // For git workspaces, ensure required fields are present
    if (workspace.type === 'git') {
      if (!workspace.gitUrl) {
        throw new Error('Git workspace must have a gitUrl');
      }

      // Validate git URL format
      const gitUrlPattern = /^(https?:\/\/|git@|ssh:\/\/)/;
      if (!gitUrlPattern.test(workspace.gitUrl)) {
        throw new Error('Invalid git URL format');
      }
    }

    const existingMetadata = workspace.metadata || {};
    const newMetadata: WorkspaceMetadata = {
      ...existingMetadata,
      version: DATA_FORMAT_VERSION,
      sourceCount: 0,
      ruleCount: 0,
      proxyRuleCount: 0
    };

    const newWorkspace: Workspace = {
      ...workspace,
      createdAt: workspace.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDefault: workspace.id === 'default-personal',
      isPersonal: workspace.type === 'personal',
      isTeam: workspace.type === 'team' || workspace.type === 'git',
      metadata: newMetadata
    };

    log.info(`Creating workspace: ${newWorkspace.id} (${newWorkspace.type})`);
    return newWorkspace;
  }

  /**
   * Validate workspace exists
   */
  validateWorkspaceExists(workspaces: Workspace[], workspaceId: string): Workspace {
    const workspace = workspaces.find(w => w.id === workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }
    return workspace;
  }

  /**
   * Delete all data files for a workspace
   */
  async deleteWorkspaceData(workspaceId: string) {
    if (workspaceId === 'default-personal') {
      throw new Error('Cannot delete default personal workspace data');
    }

    try {
      await this.storageAPI.deleteDirectory(`workspaces/${workspaceId}`);
      log.info(`Deleted workspace directory: workspaces/${workspaceId}`);
    } catch (error) {
      log.error('Failed to delete workspace data:', error);
      throw error;
    }
  }

  /**
   * Copy all data from one workspace to another
   */
  async copyWorkspaceData(sourceWorkspaceId: string, targetWorkspaceId: string) {
    try {
      const files = ['sources.json', 'rules.json', 'proxy-rules.json', 'environments.json'];

      for (const file of files) {
        try {
          const sourcePath = `workspaces/${sourceWorkspaceId}/${file}`;
          const targetPath = `workspaces/${targetWorkspaceId}/${file}`;
          const data = await this.storageAPI.loadFromStorage(sourcePath);
          if (data) {
            await this.storageAPI.saveToStorage(targetPath, data);
          }
        } catch (error) {
          // Ignore errors for files that don't exist
          log.debug(`Failed to copy ${file}:`, error instanceof Error ? error.message : String(error));
        }
      }

      log.info(`Copied data from workspace ${sourceWorkspaceId} to ${targetWorkspaceId}`);
    } catch (error) {
      log.error('Failed to copy workspace data:', error);
      throw error;
    }
  }
}

export default WorkspaceManager;
