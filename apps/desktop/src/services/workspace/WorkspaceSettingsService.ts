/**
 * WorkspaceSettingsService - Manages the single workspace settings file
 *
 * This service manages:
 * - A single workspaces.json file in the app root containing all workspace metadata
 * - Default personal workspace that cannot be deleted
 * - Team workspace references
 */

import electron from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import atomicWriter from '../../utils/atomicFileWriter';
import mainLogger from '../../utils/mainLogger';

const { app } = electron;
const { createLogger } = mainLogger;
const log = createLogger('WorkspaceSettingsService');

import { DATA_FORMAT_VERSION } from '../../config/version';
import type { Workspace, WorkspaceSyncStatus } from '../../types/workspace';

interface WorkspaceSettings {
  version: string;
  activeWorkspaceId: string;
  workspaces: Workspace[];
  syncStatus?: Record<string, WorkspaceSyncStatus>;
}

interface WorkspacesData {
  activeWorkspaceId: string;
  workspaces: Workspace[];
  syncStatus: Record<string, WorkspaceSyncStatus>;
}

class WorkspaceSettingsService {
  settingsPath: string;
  workspacesDir: string;
  defaultSettings: WorkspaceSettings;

  constructor() {
    let userDataPath: string;
    try {
      userDataPath = app.getPath('userData');
    } catch (error) {
      userDataPath = '';
    }
    this.settingsPath = path.join(userDataPath, 'workspaces.json');
    this.workspacesDir = path.join(userDataPath, 'workspaces');
    this.defaultSettings = {
      version: DATA_FORMAT_VERSION,
      activeWorkspaceId: 'default-personal',
      workspaces: [
        {
          id: 'default-personal',
          name: 'Personal Workspace',
          type: 'personal',
          description: 'Your default personal workspace',
          isDefault: true,
          createdAt: new Date().toISOString(),
        },
      ],
    };
  }

  /**
   * Initialize the workspace settings
   */
  async initialize(): Promise<void> {
    try {
      // Ensure workspaces directory exists
      await fs.promises.mkdir(this.workspacesDir, { recursive: true });

      // Check if settings file exists
      const exists = await this.checkSettingsExist();
      if (!exists) {
        // Settings file doesn't exist, create default
        await this.createDefaultSettings();
      }

      log.info('WorkspaceSettingsService initialized');
    } catch (error) {
      log.error('Failed to initialize WorkspaceSettingsService:', error);
      throw error;
    }
  }

  /**
   * Create default settings file
   */
  async createDefaultSettings(): Promise<void> {
    try {
      await atomicWriter.writeJson(this.settingsPath, this.defaultSettings, { pretty: true });

      // Create default workspace directory
      const defaultWorkspaceDir = path.join(this.workspacesDir, 'default-personal');
      await fs.promises.mkdir(defaultWorkspaceDir, { recursive: true });

      // Create default environment file
      const defaultEnvPath = path.join(defaultWorkspaceDir, 'environments.json');
      const defaultEnv = {
        environments: {
          Default: {},
        },
        activeEnvironment: 'Default',
      };
      await atomicWriter.writeJson(defaultEnvPath, defaultEnv, { pretty: true });

      log.info('Created default workspace settings');
    } catch (error) {
      log.error('Failed to create default settings:', error);
      throw error;
    }
  }

  /**
   * Check if settings file exists
   */
  async checkSettingsExist(): Promise<boolean> {
    try {
      await fs.promises.access(this.settingsPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get all workspace settings
   */
  async getSettings(): Promise<WorkspaceSettings> {
    try {
      const raw = await atomicWriter.readJson(this.settingsPath);
      if (raw === null || typeof raw !== 'object') {
        return this.defaultSettings;
      }
      const settings: Partial<WorkspaceSettings> = raw as Partial<WorkspaceSettings>;
      return {
        version: settings.version ?? this.defaultSettings.version,
        activeWorkspaceId: settings.activeWorkspaceId ?? this.defaultSettings.activeWorkspaceId,
        workspaces: settings.workspaces ?? this.defaultSettings.workspaces,
        syncStatus: settings.syncStatus,
      };
    } catch (error) {
      log.error('Failed to read workspace settings:', error);
      return this.defaultSettings;
    }
  }

  /**
   * Save workspace settings
   */
  async saveSettings(settings: WorkspaceSettings): Promise<void> {
    try {
      // Ensure default workspace is never removed
      const hasDefault = settings.workspaces.some((w) => w.id === 'default-personal' && w.isDefault);
      if (!hasDefault) {
        settings.workspaces.unshift(this.defaultSettings.workspaces[0]);
      }

      await atomicWriter.writeJson(this.settingsPath, settings, { pretty: true });

      log.info('Workspace settings saved');
    } catch (error) {
      log.error('Failed to save workspace settings:', error);
      throw error;
    }
  }

  /**
   * Add a new workspace
   */
  async addWorkspace(workspace: Workspace): Promise<Workspace> {
    const settings = await this.getSettings();

    // Check if workspace ID already exists
    if (settings.workspaces.some((w) => w.id === workspace.id)) {
      throw new Error(`Workspace with ID ${workspace.id} already exists`);
    }

    try {
      // Add workspace
      const newWorkspace: Workspace = {
        ...workspace, // Keep any additional properties
        isDefault: workspace.isDefault ?? false,
        createdAt: new Date().toISOString(),
      };
      settings.workspaces.push(newWorkspace);

      // Create workspace directory
      const workspaceDir = path.join(this.workspacesDir, workspace.id);
      await fs.promises.mkdir(workspaceDir, { recursive: true });

      // Create default environment file for the workspace
      const envPath = path.join(workspaceDir, 'environments.json');
      const defaultEnv = {
        environments: {
          Default: {},
        },
        activeEnvironment: 'Default',
      };
      await atomicWriter.writeJson(envPath, defaultEnv, { pretty: true });

      await this.saveSettings(settings);

      log.info(`Added workspace: ${workspace.id}`);
      return workspace;
    } catch (error) {
      log.error('Failed to add workspace:', error);
      throw error;
    }
  }

  /**
   * Remove a workspace
   */
  async removeWorkspace(workspaceId: string): Promise<void> {
    // Prevent deletion of default workspace
    if (workspaceId === 'default-personal') {
      throw new Error('Cannot delete the default personal workspace');
    }

    try {
      const settings = await this.getSettings();

      // Remove workspace from settings
      settings.workspaces = settings.workspaces.filter((w) => w.id !== workspaceId);

      // If active workspace was removed, switch to default
      if (settings.activeWorkspaceId === workspaceId) {
        settings.activeWorkspaceId = 'default-personal';
      }

      // Delete workspace directory
      const workspaceDir = path.join(this.workspacesDir, workspaceId);
      try {
        await fs.promises.rm(workspaceDir, { recursive: true, force: true });
      } catch (error) {
        log.warn(`Failed to delete workspace directory: ${workspaceDir}`, error);
      }

      await this.saveSettings(settings);

      log.info(`Removed workspace: ${workspaceId}`);
    } catch (error) {
      log.error('Failed to remove workspace:', error);
      throw error;
    }
  }

  /**
   * Get workspace directory path
   */
  getWorkspacePath(workspaceId: string): string {
    return path.join(this.workspacesDir, workspaceId);
  }

  /**
   * Update a workspace
   */
  async updateWorkspace(workspaceId: string, updates: Partial<Workspace>): Promise<Workspace> {
    const settings = await this.getSettings();

    // Find and update the workspace
    const workspaceIndex = settings.workspaces.findIndex((w) => w.id === workspaceId);
    if (workspaceIndex === -1) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    try {
      settings.workspaces[workspaceIndex] = {
        ...settings.workspaces[workspaceIndex],
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      await this.saveSettings(settings);

      log.info(`Updated workspace: ${workspaceId}`);
      return settings.workspaces[workspaceIndex];
    } catch (error) {
      log.error('Failed to update workspace:', error);
      throw error;
    }
  }

  /**
   * Get all workspaces
   */
  async getWorkspaces(): Promise<Workspace[]> {
    try {
      const settings = await this.getSettings();
      return settings.workspaces ?? [];
    } catch (error) {
      log.error('Failed to get workspaces:', error);
      return [];
    }
  }

  /**
   * Load workspaces data (used by WorkspaceSyncScheduler)
   */
  async loadWorkspacesData(): Promise<WorkspacesData> {
    try {
      const settings = await this.getSettings();
      return {
        activeWorkspaceId: settings.activeWorkspaceId,
        workspaces: settings.workspaces,
        syncStatus: settings.syncStatus ?? {},
      };
    } catch (error) {
      log.error('Failed to load workspaces data:', error);
      return {
        activeWorkspaceId: 'default-personal',
        workspaces: [],
        syncStatus: {},
      };
    }
  }

  /**
   * Update sync status for a workspace
   */
  async updateSyncStatus(workspaceId: string, status: WorkspaceSyncStatus): Promise<void> {
    try {
      const settings = await this.getSettings();

      // Initialize syncStatus if it doesn't exist
      if (!settings.syncStatus) {
        settings.syncStatus = {};
      }

      // Update or merge the status
      settings.syncStatus[workspaceId] = {
        ...settings.syncStatus[workspaceId],
        ...status,
      };

      await this.saveSettings(settings);

      log.info(`Updated sync status for workspace ${workspaceId}:`, status);
    } catch (error) {
      log.error('Failed to update sync status:', error);
      throw error;
    }
  }
}

export type { Workspace, WorkspaceSyncStatus } from '../../types/workspace';
export type { WorkspaceSettings, WorkspacesData };
export { WorkspaceSettingsService };
export default WorkspaceSettingsService;
