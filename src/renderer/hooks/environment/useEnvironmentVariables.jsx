import { useCallback } from 'react';
import { useEnvironmentCore } from './useEnvironmentCore';
import { showMessage } from '../../utils/ui/messageUtil';
const { createLogger } = require('../../utils/error-handling/logger');
const log = createLogger('useEnvironmentVariables');

/**
 * Hook for environment variable management
 */
export function useEnvironmentVariables() {
  const { service, state, activeEnvironment, environments, isReady } = useEnvironmentCore();

  const setVariable = useCallback(async (name, value, environment = null, isSecret = false) => {
    try {
      if (environment && environment !== activeEnvironment) {
        // Use the new method to set variable in specific environment without switching
        await service.setVariableInEnvironment(name, value, environment, isSecret);
      } else {
        // Set in current active environment
        await service.setVariable(name, value, isSecret);
      }
      return true;
    } catch (error) {
      showMessage('error', error.message);
      return false;
    }
  }, [service, activeEnvironment]);

  const deleteVariable = useCallback(async (name, environment = null) => {
    return setVariable(name, null, environment);
  }, [setVariable]);

  const getVariable = useCallback((name, environment = null) => {
    const targetEnv = environment || activeEnvironment;
    const variable = environments[targetEnv]?.[name];
    return variable?.value || '';
  }, [environments, activeEnvironment]);

  const getAllVariables = useCallback((environment = null) => {
    const targetEnv = environment || activeEnvironment;
    
    // If service is not ready, use the service's getAllVariables which handles initialization
    if (!isReady) {
      log.debug('Service not ready, using service.getAllVariables()');
      return service.getAllVariables();
    }
    
    const envVars = environments[targetEnv] || {};
    
    const result = {};
    Object.entries(envVars).forEach(([key, variable]) => {
      result[key] = variable.value || '';
    });
    
    return result;
  }, [environments, activeEnvironment, isReady, service]);

  const getAllVariablesWithMetadata = useCallback((environment = null) => {
    const targetEnv = environment || activeEnvironment;
    const envData = environments[targetEnv] || {};
    
    // Filter out any non-variable properties
    // Variables should have a 'value' property
    const variables = {};
    Object.entries(envData).forEach(([key, data]) => {
      if (data && typeof data === 'object' && 'value' in data) {
        variables[key] = data;
      }
    });
    
    return variables;
  }, [environments, activeEnvironment]);

  return {
    setVariable,
    deleteVariable,
    getVariable,
    getAllVariables,
    getAllVariablesWithMetadata
  };
}