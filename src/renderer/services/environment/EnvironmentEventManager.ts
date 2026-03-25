/**
 * EnvironmentEventManager - Manages environment-related events
 */
import { createLogger } from '../../utils/error-handling/logger';
import type { EnvironmentMap, EnvironmentVariables } from '../../../types/environment';

const log = createLogger('EnvironmentEventManager');

class EnvironmentEventManager {
  listeners: Array<(() => void) | (() => void)>;

  constructor() {
    this.listeners = [];
  }

  /**
   * Setup environment structure change listener
   */
  setupEnvironmentStructureListener(onStructureChange: (data: { workspaceId: string }) => Promise<void>) {
    const handleStructureChange = async (event: Event | { detail: unknown }) => {
      const data = (event as CustomEvent).detail as { workspaceId: string } | null;
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
  dispatchEnvironmentsLoaded(workspaceId: string, environments: EnvironmentMap, activeEnvironment: string) {
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
  dispatchVariablesChanged(environmentName: string, variables: EnvironmentVariables) {
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
  dispatchEnvironmentChanged(environmentName: string, variables: EnvironmentVariables) {
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
  dispatchEnvironmentDeleted(environmentName: string) {
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

export default EnvironmentEventManager;
