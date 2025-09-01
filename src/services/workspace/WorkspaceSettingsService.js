/**
 * WorkspaceSettingsService - Manages the single workspace settings file
 * 
 * This service manages:
 * - A single workspaces.json file in the app root containing all workspace metadata
 * - Default personal workspace that cannot be deleted
 * - Team workspace references
 */

const path = require('path');
const fs = require('fs').promises;
const { app } = require('electron');
const { createLogger } = require('../../utils/mainLogger');
const atomicWriter = require('../../utils/atomicFileWriter');

const log = createLogger('WorkspaceSettingsService');

class WorkspaceSettingsService {
  constructor() {
    this.settingsPath = path.join(app.getPath('userData'), 'workspaces.json');
    this.workspacesDir = path.join(app.getPath('userData'), 'workspaces');
    this.defaultSettings = {
      version: '3.0.0',
      activeWorkspaceId: 'default-personal',
      workspaces: [
        {
          id: 'default-personal',
          name: 'Personal Workspace',
          type: 'personal',
          description: 'Your default personal workspace',
          isDefault: true,
          createdAt: new Date().toISOString()
        }
      ]
    };
  }

  /**
   * Initialize the workspace settings
   */
  async initialize() {
    try {
      // Ensure workspaces directory exists
      await fs.mkdir(this.workspacesDir, { recursive: true });
      
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
  async createDefaultSettings() {
    try {
      await atomicWriter.writeJson(this.settingsPath, this.defaultSettings, { pretty: true });
      
      // Create default workspace directory
      const defaultWorkspaceDir = path.join(this.workspacesDir, 'default-personal');
      await fs.mkdir(defaultWorkspaceDir, { recursive: true });
      
      // Create default environment file
      const defaultEnvPath = path.join(defaultWorkspaceDir, 'environments.json');
      const defaultEnv = {
        environments: {
          Default: {}
        },
        activeEnvironment: 'Default'
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
  async checkSettingsExist() {
    try {
      await fs.access(this.settingsPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get all workspace settings
   */
  async getSettings() {
    try {
      const settings = await atomicWriter.readJson(this.settingsPath);
      if (settings === null) {
        // File doesn't exist, return defaults
        return this.defaultSettings;
      }
      return settings;
    } catch (error) {
      log.error('Failed to read workspace settings:', error);
      // Return default settings if file is corrupted
      return this.defaultSettings;
    }
  }

  /**
   * Save workspace settings
   */
  async saveSettings(settings) {
    try {
      // Ensure default workspace is never removed
      const hasDefault = settings.workspaces.some(w => w.id === 'default-personal' && w.isDefault);
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
  async addWorkspace(workspace) {
    const settings = await this.getSettings();
    
    // Check if workspace ID already exists
    if (settings.workspaces.some(w => w.id === workspace.id)) {
      throw new Error(`Workspace with ID ${workspace.id} already exists`);
    }
    
    try {
      
      // Add workspace
      const newWorkspace = {
        id: workspace.id,
        name: workspace.name,
        type: workspace.type,
        description: workspace.description,
        isDefault: workspace.isDefault || false,
        createdAt: new Date().toISOString(),
        ...workspace // Keep any additional properties
      };
      settings.workspaces.push(newWorkspace);
      
      // Create workspace directory
      const workspaceDir = path.join(this.workspacesDir, workspace.id);
      await fs.mkdir(workspaceDir, { recursive: true });
      
      // Create default environment file for the workspace
      const envPath = path.join(workspaceDir, 'environments.json');
      const defaultEnv = {
        environments: {
          Default: {}
        },
        activeEnvironment: 'Default'
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
  async removeWorkspace(workspaceId) {
    // Prevent deletion of default workspace
    if (workspaceId === 'default-personal') {
      throw new Error('Cannot delete the default personal workspace');
    }
    
    try {
      const settings = await this.getSettings();
      
      // Remove workspace from settings
      settings.workspaces = settings.workspaces.filter(w => w.id !== workspaceId);
      
      // If active workspace was removed, switch to default
      if (settings.activeWorkspaceId === workspaceId) {
        settings.activeWorkspaceId = 'default-personal';
      }
      
      // Delete workspace directory
      const workspaceDir = path.join(this.workspacesDir, workspaceId);
      try {
        await fs.rm(workspaceDir, { recursive: true, force: true });
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
  getWorkspacePath(workspaceId) {
    return path.join(this.workspacesDir, workspaceId);
  }

  /**
   * Update a workspace
   */
  async updateWorkspace(workspaceId, updates) {
    const settings = await this.getSettings();
    
    // Find and update the workspace
    const workspaceIndex = settings.workspaces.findIndex(w => w.id === workspaceId);
    if (workspaceIndex === -1) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }
    
    try {
      
      settings.workspaces[workspaceIndex] = {
        ...settings.workspaces[workspaceIndex],
        ...updates,
        updatedAt: new Date().toISOString()
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
  async getWorkspaces() {
    try {
      const settings = await this.getSettings();
      return settings.workspaces || [];
    } catch (error) {
      log.error('Failed to get workspaces:', error);
      return [];
    }
  }

  /**
   * Load workspaces data (used by WorkspaceSyncScheduler)
   */
  async loadWorkspacesData() {
    try {
      const settings = await this.getSettings();
      return {
        activeWorkspaceId: settings.activeWorkspaceId,
        workspaces: settings.workspaces,
        syncStatus: settings.syncStatus || {}
      };
    } catch (error) {
      log.error('Failed to load workspaces data:', error);
      return {
        activeWorkspaceId: 'default-personal',
        workspaces: [],
        syncStatus: {}
      };
    }
  }

  /**
   * Update sync status for a workspace
   */
  async updateSyncStatus(workspaceId, status) {
    try {
      const settings = await this.getSettings();
      
      // Initialize syncStatus if it doesn't exist
      if (!settings.syncStatus) {
        settings.syncStatus = {};
      }
      
      // Update or merge the status
      settings.syncStatus[workspaceId] = {
        ...settings.syncStatus[workspaceId],
        ...status
      };
      
      await this.saveSettings(settings);
      
      log.info(`Updated sync status for workspace ${workspaceId}:`, status);
    } catch (error) {
      log.error('Failed to update sync status:', error);
      throw error;
    }
  }
}

module.exports = WorkspaceSettingsService;