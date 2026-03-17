/**
 * EnvironmentStorageManager - Handles loading and saving environment data
 */
const { createLogger } = require('../../utils/error-handling/logger');
const log = createLogger('EnvironmentStorageManager');

class EnvironmentStorageManager {
  constructor(storageAPI) {
    this.storageAPI = storageAPI;
  }

  /**
   * Load workspace configuration to get active workspace
   */
  async loadActiveWorkspaceId() {
    try {
      const workspacesData = await this.storageAPI.loadFromStorage('workspaces.json');
      if (workspacesData) {
        const parsed = JSON.parse(workspacesData);
        const workspaceId = parsed.activeWorkspaceId || 'default-personal';
        return workspaceId;
      }
    } catch (error) {
      log.warn('Failed to load active workspace, using default-personal:', error);
    }
    
    log.debug('No workspaces data found, using default-personal workspace');
    return 'default-personal';
  }

  /**
   * Load environments for a workspace
   */
  async loadEnvironments(workspaceId) {
    try {
      
      const data = await this.storageAPI.loadFromStorage(
        `workspaces/${workspaceId}/environments.json`
      );

      if (data) {
        const parsed = JSON.parse(data);
        
        if (parsed.environments && typeof parsed.environments === 'object') {
          // Validate before returning
          if (Object.keys(parsed.environments).length === 0) {
            log.warn(`Empty environments loaded for workspace ${workspaceId}, using defaults`);
            return {
              environments: { Default: {} },
              activeEnvironment: 'Default'
            };
          }

          log.info(`Loaded ${Object.keys(parsed.environments).length} environments for workspace ${workspaceId}`);
          
          
          return {
            environments: parsed.environments,
            activeEnvironment: parsed.activeEnvironment || 'Default'
          };
        }
      }

      // No data found, return defaults
      log.warn(`No environments found for workspace ${workspaceId}, initializing defaults`);
      return {
        environments: { Default: {} },
        activeEnvironment: 'Default'
      };

    } catch (error) {
      log.error(`Failed to load environments for workspace ${workspaceId}:`, error);
      throw error;
    }
  }

  /**
   * Save environments for a workspace
   */
  async saveEnvironments(workspaceId, environments, activeEnvironment) {
    try {
      const data = {
        environments,
        activeEnvironment
      };

      await this.storageAPI.saveToStorage(
        `workspaces/${workspaceId}/environments.json`,
        JSON.stringify(data)
      );

      log.debug(`Environments saved successfully for workspace ${workspaceId}`);
      return true;
    } catch (error) {
      log.error(`Failed to save environments for workspace ${workspaceId}:`, error);
      throw error;
    }
  }

  /**
   * Initialize default environments for new workspace
   */
  async initializeDefaultEnvironments(workspaceId) {
    const defaults = {
      environments: { Default: {} },
      activeEnvironment: 'Default'
    };

    await this.saveEnvironments(workspaceId, defaults.environments, defaults.activeEnvironment);
    log.info(`Initialized default environments for workspace ${workspaceId}`);
    
    return defaults;
  }
}

module.exports = EnvironmentStorageManager;