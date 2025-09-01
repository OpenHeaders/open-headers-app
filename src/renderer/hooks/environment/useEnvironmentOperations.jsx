import { useCallback } from 'react';
import { useEnvironmentCore } from './useEnvironmentCore';
import { showMessage } from '../../utils/ui/messageUtil';
const { createLogger } = require('../../utils/error-handling/logger');
const log = createLogger('useEnvironmentOperations');

/**
 * Hook for environment CRUD operations
 */
export function useEnvironmentOperations() {
  const { service, environments, activeEnvironment } = useEnvironmentCore();

  const createEnvironment = useCallback(async (name) => {
    try {
      await service.createEnvironment(name);
      showMessage('success', `Environment '${name}' created`);
      return true;
    } catch (error) {
      showMessage('error', error.message);
      return false;
    }
  }, [service]);

  const deleteEnvironment = useCallback(async (name) => {
    try {
      await service.deleteEnvironment(name);
      showMessage('success', `Environment '${name}' deleted`);
      return true;
    } catch (error) {
      showMessage('error', error.message);
      return false;
    }
  }, [service]);

  const switchEnvironment = useCallback(async (name) => {
    try {
      await service.switchEnvironment(name);
      showMessage('success', `Switched to '${name}' environment`);
      return true;
    } catch (error) {
      showMessage('error', error.message);
      return false;
    }
  }, [service]);

  const cloneEnvironment = useCallback(async (sourceEnv, newName) => {
    try {
      const sourceVars = environments[sourceEnv];
      if (!sourceVars) {
        throw new Error(`Source environment '${sourceEnv}' does not exist`);
      }

      await service.createEnvironment(newName);
      
      // Copy all variables to the new environment without switching to it
      for (const [varName, variable] of Object.entries(sourceVars)) {
        await service.setVariableInEnvironment(
          varName, 
          variable.value,
          newName,  // Set in the new environment
          variable.isSecret
        );
      }
      
      showMessage('success', `Environment '${sourceEnv}' cloned to '${newName}'`);
      return true;
    } catch (error) {
      showMessage('error', error.message);
      return false;
    }
  }, [service, environments]);

  const waitForEnvironments = useCallback(async (timeout = 5000) => {
    try {
      return await service.waitForReady(timeout);
    } catch (error) {
      log.error('Failed to wait for environments:', error);
      return false;
    }
  }, [service]);

  return {
    environments,
    activeEnvironment,
    createEnvironment,
    deleteEnvironment,
    switchEnvironment,
    cloneEnvironment,
    waitForEnvironments
  };
}