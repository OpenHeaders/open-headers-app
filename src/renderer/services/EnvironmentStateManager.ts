/**
 * EnvironmentStateManager - Global singleton for persisting environment state
 * This ensures environment variables are never lost during component remounts or race conditions
 */

const { createLogger } = require('../utils/error-handling/logger');
const log = createLogger('EnvironmentStateManager');

class EnvironmentStateManager {
  constructor() {
    this.environments = {};
    this.activeEnvironment = 'Personal';
    this.workspaceStates = {}; // Track state per workspace
    this.initialized = false;
    log.info('EnvironmentStateManager initialized');
  }

  /**
   * Initialize state for a workspace
   */
  initWorkspace(workspaceId) {
    if (!this.workspaceStates[workspaceId]) {
      this.workspaceStates[workspaceId] = {
        environments: { Personal: {} },
        activeEnvironment: 'Personal',
        loaded: false
      };
      log.debug(`Initialized state for workspace: ${workspaceId}`);
    }
  }

  /**
   * Get environments for a workspace
   */
  getEnvironments(workspaceId) {
    this.initWorkspace(workspaceId);
    return this.workspaceStates[workspaceId].environments;
  }

  /**
   * Set environments for a workspace
   */
  setEnvironments(workspaceId, environments) {
    this.initWorkspace(workspaceId);
    
    // Validate environments before setting
    if (!environments || typeof environments !== 'object') {
      log.error('Invalid environments data:', environments);
      return false;
    }

    // Check if we're trying to clear existing data
    const currentEnvs = this.workspaceStates[workspaceId].environments;
    const hasCurrentData = Object.keys(currentEnvs).some(envName => 
      currentEnvs[envName] && Object.keys(currentEnvs[envName]).length > 0
    );
    
    const hasOnlyEmptyPersonal = Object.keys(environments).length === 1 && 
                                 environments.Personal && 
                                 Object.keys(environments.Personal).length === 0;
    
    if (hasCurrentData && hasOnlyEmptyPersonal) {
      log.warn(`Blocked attempt to clear environments for workspace ${workspaceId}`);
      return false;
    }

    this.workspaceStates[workspaceId].environments = environments;
    this.workspaceStates[workspaceId].loaded = true;
    log.debug(`Set environments for workspace ${workspaceId}:`, {
      environmentCount: Object.keys(environments).length,
      environmentNames: Object.keys(environments)
    });
    
    return true;
  }

  /**
   * Get active environment for a workspace
   */
  getActiveEnvironment(workspaceId) {
    this.initWorkspace(workspaceId);
    return this.workspaceStates[workspaceId].activeEnvironment;
  }

  /**
   * Set active environment for a workspace
   */
  setActiveEnvironment(workspaceId, environmentName) {
    this.initWorkspace(workspaceId);
    this.workspaceStates[workspaceId].activeEnvironment = environmentName;
    log.debug(`Set active environment for workspace ${workspaceId}: ${environmentName}`);
  }

  /**
   * Check if a workspace has been loaded
   */
  isWorkspaceLoaded(workspaceId) {
    return this.workspaceStates[workspaceId]?.loaded || false;
  }

  /**
   * Get last known good state for recovery
   */
  getLastGoodState(workspaceId) {
    this.initWorkspace(workspaceId);
    const state = this.workspaceStates[workspaceId];
    if (state.environments && Object.keys(state.environments).length > 0) {
      return {
        environments: state.environments,
        activeEnvironment: state.activeEnvironment
      };
    }
    return null;
  }

  /**
   * Clear state for a workspace (use with caution)
   */
  clearWorkspace(workspaceId) {
    if (this.workspaceStates[workspaceId]) {
      delete this.workspaceStates[workspaceId];
      log.info(`Cleared state for workspace: ${workspaceId}`);
    }
  }

  /**
   * Get all workspace states (for debugging)
   */
  getAllStates() {
    return this.workspaceStates;
  }
}

// Create singleton instance
const environmentStateManager = new EnvironmentStateManager();

// Freeze the instance to prevent modification
Object.freeze(environmentStateManager);

module.exports = environmentStateManager;