/**
 * EnvironmentEventManager - Manages environment-related events
 */
const { createLogger } = require('../../utils/error-handling/logger');
const log = createLogger('EnvironmentEventManager');

class EnvironmentEventManager {
  constructor() {
    this.listeners = [];
  }

  /**
   * Setup workspace change listener
   */
  setupWorkspaceListener(onWorkspaceChange) {
    const handleWorkspaceSwitch = async (event) => {
      const newWorkspaceId = event.detail?.workspaceId;
      if (!newWorkspaceId) return;
      
      log.info(`Workspace switched event received: ${newWorkspaceId}`);
      await onWorkspaceChange(newWorkspaceId);
    };
    
    window.addEventListener('workspace-switched', handleWorkspaceSwitch);
    window.addEventListener('workspace-data-applied', handleWorkspaceSwitch);
    
    this.listeners.push(() => {
      window.removeEventListener('workspace-switched', handleWorkspaceSwitch);
      window.removeEventListener('workspace-data-applied', handleWorkspaceSwitch);
    });
  }

  /**
   * Setup environment structure change listener
   */
  setupEnvironmentStructureListener(onStructureChange) {
    const handleStructureChange = async (event) => {
      const data = event.detail;
      if (!data || !data.workspaceId) return;
      
      log.info(`Environment structure changed for workspace: ${data.workspaceId}`);
      await onStructureChange(data);
    };
    
    // Listen for custom events
    window.addEventListener('environments-structure-changed', handleStructureChange);
    
    // Also handle IPC events
    if (window.electronAPI && window.electronAPI.onEnvironmentsStructureChanged) {
      const unsubscribe = window.electronAPI.onEnvironmentsStructureChanged((data) => {
        handleStructureChange({ detail: data });
      });
      
      this.listeners.push(unsubscribe);
    }
    
    this.listeners.push(() => {
      window.removeEventListener('environments-structure-changed', handleStructureChange);
    });
  }

  /**
   * Dispatch environment loaded event
   */
  dispatchEnvironmentsLoaded(workspaceId, environments, activeEnvironment) {
    window.dispatchEvent(new CustomEvent('environments-loaded', {
      detail: { 
        workspaceId,
        environments,
        activeEnvironment
      }
    }));
    
    log.debug('Dispatched environments-loaded event', {
      workspaceId,
      environmentCount: Object.keys(environments).length,
      activeEnvironment
    });
  }

  /**
   * Dispatch environment variables changed event
   */
  dispatchVariablesChanged(environmentName, variables) {
    window.dispatchEvent(new CustomEvent('environment-variables-changed', {
      detail: { 
        environment: environmentName, 
        variables
      }
    }));
    
    log.debug('Dispatched environment-variables-changed event', {
      environment: environmentName,
      variableCount: Object.keys(variables).length
    });
  }

  /**
   * Dispatch environment changed event
   */
  dispatchEnvironmentChanged(environmentName, variables) {
    window.dispatchEvent(new CustomEvent('environment-switched', {
      detail: { 
        environment: environmentName, 
        variables
      }
    }));
    
    log.debug('Dispatched environment-switched event', {
      environment: environmentName
    });
  }

  /**
   * Dispatch environment deleted event
   */
  dispatchEnvironmentDeleted(environmentName) {
    window.dispatchEvent(new CustomEvent('environment-deleted', {
      detail: { environment: environmentName }
    }));
    
    log.debug('Dispatched environment-deleted event', {
      environment: environmentName
    });
  }

  /**
   * Cleanup all listeners
   */
  cleanup() {
    this.listeners.forEach(cleanup => {
      try {
        if (typeof cleanup === 'function') {
          cleanup();
        }
      } catch (error) {
        log.error('Error during cleanup:', error);
      }
    });
    this.listeners = [];
  }
}

module.exports = EnvironmentEventManager;