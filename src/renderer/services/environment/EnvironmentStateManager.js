/**
 * EnvironmentStateManager - Manages environment state and listeners
 */
const BaseStateManager = require('../workspace/BaseStateManager');
const { createLogger } = require('../../utils/error-handling/logger');
const log = createLogger('EnvironmentStateManager');

class EnvironmentStateManager extends BaseStateManager {
  constructor() {
    super('EnvironmentStateManager');
    
    // Initialize environment-specific state
    this.state = {
      currentWorkspaceId: 'default-personal',
      environments: { Default: {} },
      activeEnvironment: 'Default',
      isLoading: false,
      isReady: false,
      error: null
    };
    
    this.initPromise = null;
    this.loadPromises = new Map(); // Track load promises per workspace
    this.hasLoadedInitialData = false; // Track if we've loaded data at least once
  }

  /**
   * Override setState to log environment-specific details
   */
  setState(updates) {
    const prevState = { ...this.state };
    super.setState(updates);
    
  }

  /**
   * Get current state (immutable copy)
   */
  getState() {
    return {
      ...this.state,
      environments: { ...this.state.environments }
    };
  }

  /**
   * Check if service is ready
   */
  isReady() {
    return this.state.isReady && !this.state.isLoading;
  }

  /**
   * Wait for service to be ready
   */
  async waitForReady(timeout = 5000) {
    const startTime = Date.now();

    while (!this.state.isReady) {
      if (Date.now() - startTime > timeout) {
        throw new Error('Timeout waiting for environment service to be ready');
      }

      // If not loading and not ready, trigger initialization
      if (!this.state.isLoading && !this.initPromise) {
        log.warn('Service not ready and not loading, initialization may be needed');
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return true;
  }

  /**
   * Track initialization promise
   */
  setInitPromise(promise) {
    this.initPromise = promise;
  }

  /**
   * Get initialization promise
   */
  getInitPromise() {
    return this.initPromise;
  }

  /**
   * Track load promise for workspace
   */
  setLoadPromise(workspaceId, promise) {
    this.loadPromises.set(workspaceId, promise);
  }

  /**
   * Get load promise for workspace
   */
  getLoadPromise(workspaceId) {
    return this.loadPromises.get(workspaceId);
  }

  /**
   * Clear load promise for workspace
   */
  clearLoadPromise(workspaceId) {
    this.loadPromises.delete(workspaceId);
  }

  /**
   * Check if workspace is being loaded
   */
  isLoadingWorkspace(workspaceId) {
    return this.loadPromises.has(workspaceId);
  }

  /**
   * Mark that initial data has been loaded
   */
  markInitialDataLoaded() {
    this.hasLoadedInitialData = true;
  }

  /**
   * Check if initial data has been loaded
   */
  hasInitialData() {
    return this.hasLoadedInitialData;
  }
}

module.exports = EnvironmentStateManager;