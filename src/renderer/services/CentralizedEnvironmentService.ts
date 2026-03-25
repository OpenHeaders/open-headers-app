/**
 * CentralizedEnvironmentService - Refactored to use modular components
 * 
 * This service ensures:
 * - Environments are always loaded before use
 * - No race conditions during workspace switches
 * - Consistent state across all components
 * - Proper initialization sequencing
 */

import { createLogger } from '../utils/error-handling/logger';
import {
  EnvironmentStateManager,
  EnvironmentStorageManager,
  EnvironmentVariableManager,
  TemplateResolver,
  EnvironmentEventManager
} from './environment';
import type { EnvironmentServiceState } from './environment/EnvironmentStateManager';
import type { EnvironmentMap } from '../../types/environment';

const log = createLogger('CentralizedEnvironmentService');

class CentralizedEnvironmentService {
  stateManager: InstanceType<typeof EnvironmentStateManager>;
  storageManager: InstanceType<typeof EnvironmentStorageManager>;
  variableManager: InstanceType<typeof EnvironmentVariableManager>;
  templateResolver: InstanceType<typeof TemplateResolver>;
  eventManager: InstanceType<typeof EnvironmentEventManager>;

  constructor() {
    // Initialize managers
    this.stateManager = new EnvironmentStateManager();
    this.storageManager = new EnvironmentStorageManager(window.electronAPI);
    this.variableManager = new EnvironmentVariableManager();
    this.templateResolver = new TemplateResolver();
    this.eventManager = new EnvironmentEventManager();

    // Setup listeners (environment structure changes from IPC)
    this.setupWorkspaceListener();

    log.info('CentralizedEnvironmentService initialized');
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: (state: EnvironmentServiceState, changedKeys: string[]) => void) {
    return this.stateManager.subscribe(listener);
  }

  /**
   * Get current state
   */
  getState() {
    return this.stateManager.getState();
  }

  /**
   * Initialize service
   */
  async initialize(workspaceId: string | null = null) {
    const initPromise = this.stateManager.getInitPromise();
    if (initPromise) {
      return initPromise;
    }

    // If no workspace ID provided, try to get it from storage
    if (!workspaceId) {
      workspaceId = await this.storageManager.loadActiveWorkspaceId();
    }

    const promise = this._doInitialize(workspaceId);
    this.stateManager.setInitPromise(promise);
    return promise;
  }

  async _doInitialize(workspaceId: string | null) {
    try {
      log.info(`Initializing CentralizedEnvironmentService for workspace: ${workspaceId}`);
      this.stateManager.setState({ isLoading: true, error: null });
      
      // Load workspace environments
      await this.loadWorkspaceEnvironments(workspaceId);
      
      this.stateManager.setState({ isReady: true, isLoading: false });
      
      const state = this.stateManager.getState();
      log.info('Service initialized successfully with state:', {
        workspaceId: state.currentWorkspaceId,
        environments: Object.keys(state.environments),
        activeEnvironment: state.activeEnvironment,
        variableCount: Object.keys(this.getAllVariables()).length
      });
      
      return true;
    } catch (error) {
      log.error('Initialization failed:', error);
      this.stateManager.setState({ 
        isReady: false, 
        isLoading: false, 
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Load environments for a workspace (with deduplication)
   */
  async loadWorkspaceEnvironments(workspaceId: string | null) {
    // Check if we're already loading this workspace
    const wsId = workspaceId ?? '';
    if (this.stateManager.isLoadingWorkspace(wsId)) {
      log.debug(`Already loading workspace ${workspaceId}, reusing promise`);
      return this.stateManager.getLoadPromise(wsId);
    }

    // Create new load promise
    const loadPromise = this._doLoadWorkspace(workspaceId);
    this.stateManager.setLoadPromise(wsId, loadPromise);

    try {
      return await loadPromise;
    } finally {
      // Clean up promise after completion
      this.stateManager.clearLoadPromise(wsId);
    }
  }

  async _doLoadWorkspace(workspaceId: string | null) {
    try {
      const data = await this.storageManager.loadEnvironments(workspaceId ?? '');

      this.stateManager.setState({
        currentWorkspaceId: workspaceId ?? 'default-personal',
        environments: data.environments,
        activeEnvironment: data.activeEnvironment
      });

      this.stateManager.markInitialDataLoaded();

      // Only save if we created fresh defaults (no file existed or was empty)
      if (data.isNewlyCreated) {
        await this.saveEnvironments();
      }

      return true;
    } catch (error) {
      log.error(`Failed to load workspace ${workspaceId}:`, error);
      throw error;
    }
  }

  /**
   * Setup listener for environment structure changes from IPC
   */
  setupWorkspaceListener() {
    this.eventManager.setupEnvironmentStructureListener(async (data: { workspaceId: string }) => {
      const currentState = this.stateManager.getState();
      if (currentState.currentWorkspaceId === data.workspaceId) {
        log.info(`[CentralizedEnvironmentService] Environment structure changed for current workspace, reloading`);
        await this.loadWorkspaceEnvironments(data.workspaceId);
        this.stateManager.setState({ isReady: true });
      }
    });
  }

  /**
   * Handle workspace change
   */
  async handleWorkspaceChange(workspaceId: string) {
    const state = this.stateManager.getState();
    if (state.currentWorkspaceId === workspaceId && state.isReady) {
      log.debug(`Already in workspace ${workspaceId} and ready`);
      return;
    }

    try {
      this.stateManager.setState({ isLoading: true, error: null, isReady: false });
      
      // Save current workspace before switching
      if (state.isReady && state.currentWorkspaceId) {
        await this.saveEnvironments();
      }

      // Load new workspace
      await this.loadWorkspaceEnvironments(workspaceId);
      
      this.stateManager.setState({ isReady: true, isLoading: false });
      
      // Dispatch environment loaded event
      const newState = this.stateManager.getState();
      this.eventManager.dispatchEnvironmentsLoaded(
        workspaceId,
        newState.environments,
        newState.activeEnvironment
      );

    } catch (error) {
      log.error('Failed to handle workspace change:', error);
      this.stateManager.setState({ 
        isLoading: false, 
        isReady: true, // Mark as ready even on error to prevent blocking
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Save current environments
   */
  async saveEnvironments() {
    try {
      const state = this.stateManager.getState();
      await this.storageManager.saveEnvironments(
        state.currentWorkspaceId,
        state.environments,
        state.activeEnvironment
      );
      return true;
    } catch (error) {
      log.error('Failed to save environments:', error);
      throw error;
    }
  }

  /**
   * Wait for service to be ready
   */
  async waitForReady(timeout = 5000) {
    return this.stateManager.waitForReady(timeout);
  }

  /**
   * Get all variables for current environment
   */
  getAllVariables() {
    const state = this.stateManager.getState();
    
    // If not ready and haven't loaded initial data, try to force load
    if (!state.isReady && !this.stateManager.hasInitialData() && !state.isLoading) {
      log.warn('getAllVariables called before service is ready, triggering initialization');
      this.initialize().catch(err => log.error('Failed to initialize on getAllVariables:', err));
    }

    return this.variableManager.getAllVariables(state.environments as Parameters<typeof this.variableManager.getAllVariables>[0], state.activeEnvironment);
  }

  /**
   * Resolve template with variables
   */
  resolveTemplate(template: string) {
    const variables = this.getAllVariables();
    const result = this.templateResolver.resolveTemplate(template, variables, {
      logMissing: true,
      defaultValue: ''
    });
    
    // Return just the resolved string for backward compatibility
    return typeof result === 'string' ? result : result?.resolved ?? '';
  }

  /**
   * Set variable in current environment
   */
  async setVariable(name: string, value: string | null, isSecret = false) {
    const state = this.stateManager.getState();
    return this.setVariableInEnvironment(name, value, state.activeEnvironment, isSecret);
  }

  /**
   * Set variable in a specific environment
   */
  async setVariableInEnvironment(name: string, value: string | null, environmentName: string, isSecret = false) {
    const state = this.stateManager.getState();
    const updatedEnvironments = this.variableManager.setVariable(
      state.environments,
      environmentName,
      name,
      value,
      isSecret
    );

    await this.commitEnvironmentChange(updatedEnvironments, environmentName);
    return true;
  }

  /**
   * Batch set multiple variables in a specific environment (single save + single IPC event)
   */
  async batchSetVariablesInEnvironment(environmentName: string, variables: Array<{ name: string; value: string | null; isSecret?: boolean }>) {
    const state = this.stateManager.getState();
    const updatedEnvironments = JSON.parse(JSON.stringify(state.environments));

    if (!updatedEnvironments[environmentName]) {
      throw new Error(`Environment '${environmentName}' does not exist`);
    }

    for (const { name, value, isSecret } of variables) {
      if (value === null || value === '') {
        delete updatedEnvironments[environmentName][name];
      } else {
        updatedEnvironments[environmentName][name] = {
          value,
          isSecret: isSecret || false,
          updatedAt: new Date().toISOString()
        };
      }
    }

    await this.commitEnvironmentChange(updatedEnvironments, environmentName);
    return true;
  }

  /**
   * Persist environment changes: update state, save to disk, dispatch events,
   * and notify main process if the changed environment is active.
   */
  private async commitEnvironmentChange(updatedEnvironments: EnvironmentMap, environmentName: string) {
    const state = this.stateManager.getState();

    this.stateManager.setState({ environments: updatedEnvironments });
    await this.saveEnvironments();

    this.eventManager.dispatchVariablesChanged(
      environmentName,
      updatedEnvironments[environmentName]
    );

    if (window.electronAPI?.send && state.activeEnvironment === environmentName) {
      window.electronAPI.send('environment-variables-changed', {
        environment: environmentName,
        variables: updatedEnvironments[environmentName]
      });
    }
  }

  /**
   * Create new environment
   */
  async createEnvironment(name: string) {
    const state = this.stateManager.getState();
    const updatedEnvironments = this.variableManager.createEnvironment(
      state.environments,
      name
    );

    this.stateManager.setState({ environments: updatedEnvironments });
    await this.saveEnvironments();
    
    return true;
  }

  /**
   * Delete an environment
   */
  async deleteEnvironment(name: string) {
    const state = this.stateManager.getState();
    const updatedEnvironments = this.variableManager.deleteEnvironment(
      state.environments,
      name
    );

    // If we're deleting the active environment, switch to Default
    const updates: Partial<EnvironmentServiceState> = { environments: updatedEnvironments };
    const wasActiveEnvironment = state.activeEnvironment === name;
    if (wasActiveEnvironment) {
      updates.activeEnvironment = 'Default';
    }

    this.stateManager.setState(updates);
    await this.saveEnvironments();

    // Dispatch event
    this.eventManager.dispatchEnvironmentDeleted(name);
    
    // If we switched to Default, dispatch environment switch event
    if (wasActiveEnvironment) {
      this.eventManager.dispatchEnvironmentChanged('Default', updatedEnvironments['Default']);
      
      // Also notify main process about environment switch
      if (window.electronAPI && window.electronAPI.send) {
        window.electronAPI.send('environment-switched', {
          environment: 'Default',
          variables: updatedEnvironments['Default']
        });
      }
    }

    return true;
  }

  /**
   * Switch to different environment
   */
  async switchEnvironment(name: string) {
    const state = this.stateManager.getState();
    this.variableManager.validateEnvironmentExists(state.environments, name);

    log.info(`[switchEnvironment] Switching from '${state.activeEnvironment}' to '${name}'`);
    
    this.stateManager.setState({ activeEnvironment: name });
    await this.saveEnvironments();

    log.debug(`[switchEnvironment] Environment switched successfully:`, {
      previousEnv: state.activeEnvironment,
      currentEnv: name,
      availableVars: Object.keys(state.environments[name] || {})
    });

    // Dispatch event
    this.eventManager.dispatchEnvironmentChanged(name, state.environments[name]);

    // Notify main process about environment switch
    if (window.electronAPI && window.electronAPI.send) {
      window.electronAPI.send('environment-switched', {
        environment: name,
        variables: state.environments[name]
      });
    }

    return true;
  }

  /**
   * Cleanup service
   */
  cleanup() {
    this.eventManager.cleanup();
    this.stateManager.cleanup();
    log.info('CentralizedEnvironmentService cleaned up');
  }
}

// Create singleton instance
let serviceInstance: CentralizedEnvironmentService | null = null;

export function getCentralizedEnvironmentService() {
  if (!serviceInstance) {
    serviceInstance = new CentralizedEnvironmentService();
    // NOTE: No auto-initialize here. The service is initialized lazily by:
    // - CentralizedWorkspaceService (passes workspaceId it already loaded)
    // - EnvironmentProvider (via useEnvironmentCore)
    // This avoids a redundant workspaces.json load on startup.
  }
  return serviceInstance;
}

// Also export the class for type checking if needed
export { CentralizedEnvironmentService };