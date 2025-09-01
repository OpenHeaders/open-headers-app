/**
 * CentralizedEnvironmentService - Refactored to use modular components
 * 
 * This service ensures:
 * - Environments are always loaded before use
 * - No race conditions during workspace switches
 * - Consistent state across all components
 * - Proper initialization sequencing
 */

const { createLogger } = require('../utils/error-handling/logger');
const {
  EnvironmentStateManager,
  EnvironmentStorageManager,
  EnvironmentVariableManager,
  TemplateResolver,
  EnvironmentEventManager
} = require('./environment');

const log = createLogger('CentralizedEnvironmentService');

class CentralizedEnvironmentService {
  constructor() {
    // Initialize managers
    this.stateManager = new EnvironmentStateManager();
    this.storageManager = new EnvironmentStorageManager(window.electronAPI);
    this.variableManager = new EnvironmentVariableManager();
    this.templateResolver = new TemplateResolver();
    this.eventManager = new EnvironmentEventManager();
    
    // Setup workspace listener
    this.setupWorkspaceListener();
    
    log.info('CentralizedEnvironmentService initialized');
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener) {
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
  async initialize(workspaceId = null) {
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

  async _doInitialize(workspaceId) {
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
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Load environments for a workspace (with deduplication)
   */
  async loadWorkspaceEnvironments(workspaceId) {
    // Check if we're already loading this workspace
    if (this.stateManager.isLoadingWorkspace(workspaceId)) {
      log.debug(`Already loading workspace ${workspaceId}, reusing promise`);
      return this.stateManager.getLoadPromise(workspaceId);
    }

    // Create new load promise
    const loadPromise = this._doLoadWorkspace(workspaceId);
    this.stateManager.setLoadPromise(workspaceId, loadPromise);

    try {
      return await loadPromise;
    } finally {
      // Clean up promise after completion
      this.stateManager.clearLoadPromise(workspaceId);
    }
  }

  async _doLoadWorkspace(workspaceId) {
    try {
      const data = await this.storageManager.loadEnvironments(workspaceId);
      
      this.stateManager.setState({
        currentWorkspaceId: workspaceId,
        environments: data.environments,
        activeEnvironment: data.activeEnvironment
      });

      this.stateManager.markInitialDataLoaded();
      
      // If we just loaded defaults, save them
      if (Object.keys(data.environments).length === 1 && data.environments.Default) {
        await this.saveEnvironments();
      }
      
      return true;
    } catch (error) {
      log.error(`Failed to load workspace ${workspaceId}:`, error);
      throw error;
    }
  }

  /**
   * Setup listener for workspace changes
   */
  setupWorkspaceListener() {
    this.eventManager.setupWorkspaceListener(async (newWorkspaceId) => {
      const currentState = this.stateManager.getState();
      if (currentState.currentWorkspaceId !== newWorkspaceId) {
        log.info(`[CentralizedEnvironmentService] Workspace changed from ${currentState.currentWorkspaceId} to ${newWorkspaceId}`);
        await this.handleWorkspaceChange(newWorkspaceId);
      }
    });
    
    this.eventManager.setupEnvironmentStructureListener(async (data) => {
      const currentState = this.stateManager.getState();
      // Only reload if it's for the current workspace
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
  async handleWorkspaceChange(workspaceId) {
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
        error: error.message 
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

    return this.variableManager.getAllVariables(state.environments, state.activeEnvironment);
  }

  /**
   * Resolve template with variables
   */
  resolveTemplate(template) {
    const variables = this.getAllVariables();
    const result = this.templateResolver.resolveTemplate(template, variables, {
      logMissing: true,
      defaultValue: ''
    });
    
    // Return just the resolved string for backward compatibility
    return typeof result === 'string' ? result : result.resolved;
  }

  /**
   * Set variable in current environment
   */
  async setVariable(name, value, isSecret = false) {
    const state = this.stateManager.getState();
    return this.setVariableInEnvironment(name, value, state.activeEnvironment, isSecret);
  }

  /**
   * Set variable in a specific environment
   */
  async setVariableInEnvironment(name, value, environmentName, isSecret = false) {
    const state = this.stateManager.getState();
    const updatedEnvironments = this.variableManager.setVariable(
      state.environments,
      environmentName,
      name,
      value,
      isSecret
    );

    this.stateManager.setState({ environments: updatedEnvironments });
    await this.saveEnvironments();

    // Dispatch event
    this.eventManager.dispatchVariablesChanged(
      environmentName,
      updatedEnvironments[environmentName]
    );

    // Notify main process about environment variable changes
    if (window.electronAPI && window.electronAPI.send) {
      window.electronAPI.send('environment-variables-changed', {
        environment: environmentName,
        variables: updatedEnvironments[environmentName]
      });
    }

    return true;
  }

  /**
   * Create new environment
   */
  async createEnvironment(name) {
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
  async deleteEnvironment(name) {
    const state = this.stateManager.getState();
    const updatedEnvironments = this.variableManager.deleteEnvironment(
      state.environments,
      name
    );

    // If we're deleting the active environment, switch to Default
    let updates = { environments: updatedEnvironments };
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
  async switchEnvironment(name) {
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
let serviceInstance = null;

export function getCentralizedEnvironmentService() {
  if (!serviceInstance) {
    serviceInstance = new CentralizedEnvironmentService();
    
    // Auto-initialize on first access
    serviceInstance.initialize().then(() => {
      log.info('CentralizedEnvironmentService initialized successfully');
    }).catch(error => {
      log.error('Auto-initialization failed:', error);
    });
  }
  return serviceInstance;
}

// Also export the class for type checking if needed
export { CentralizedEnvironmentService };