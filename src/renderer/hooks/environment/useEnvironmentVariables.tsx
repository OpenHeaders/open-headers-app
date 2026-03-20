import { useCallback } from 'react';
import { useEnvironmentCore, EnvironmentVariableEntry } from './useEnvironmentCore';
import { showMessage } from '../../utils/ui/messageUtil';
import { createLogger } from '../../utils/error-handling/logger';
const log = createLogger('useEnvironmentVariables');

interface UseEnvironmentVariablesReturn {
  setVariable: (name: string, value: string | null, environment?: string | null, isSecret?: boolean) => Promise<boolean>;
  deleteVariable: (name: string, environment?: string | null) => Promise<boolean>;
  getVariable: (name: string, environment?: string | null) => string;
  getAllVariables: (environment?: string | null) => Record<string, string>;
  getAllVariablesWithMetadata: (environment?: string | null) => Record<string, EnvironmentVariableEntry>;
}

/**
 * Hook for environment variable management
 */
export function useEnvironmentVariables(): UseEnvironmentVariablesReturn {
  const { service, activeEnvironment, environments, isReady } = useEnvironmentCore();

  const setVariable = useCallback(async (name: string, value: string | null, environment: string | null = null, isSecret: boolean = false): Promise<boolean> => {
    try {
      if (environment && environment !== activeEnvironment) {
        // Use the new method to set variable in specific environment without switching
        await service.setVariableInEnvironment(name, value, environment, isSecret);
      } else {
        // Set in current active environment
        await service.setVariable(name, value, isSecret);
      }
      return true;
    } catch (error: unknown) {
      showMessage('error', error instanceof Error ? error.message : String(error));
      return false;
    }
  }, [service, activeEnvironment]);

  const deleteVariable = useCallback(async (name: string, environment: string | null = null): Promise<boolean> => {
    return setVariable(name, null, environment);
  }, [setVariable]);

  const getVariable = useCallback((name: string, environment: string | null = null): string => {
    const targetEnv = environment || activeEnvironment;
    const variable = environments[targetEnv]?.[name];
    return variable?.value || '';
  }, [environments, activeEnvironment]);

  const getAllVariables = useCallback((environment: string | null = null): Record<string, string> => {
    const targetEnv = environment || activeEnvironment;

    // If service is not ready, use the service's getAllVariables which handles initialization
    if (!isReady) {
      log.debug('Service not ready, using service.getAllVariables()');
      return service.getAllVariables();
    }

    const envVars = environments[targetEnv] || {};

    const result: Record<string, string> = {};
    Object.entries(envVars).forEach(([key, variable]: [string, EnvironmentVariableEntry]) => {
      result[key] = variable.value || '';
    });

    return result;
  }, [environments, activeEnvironment, isReady, service]);

  const getAllVariablesWithMetadata = useCallback((environment: string | null = null): Record<string, EnvironmentVariableEntry> => {
    const targetEnv = environment || activeEnvironment;
    const envData = environments[targetEnv] || {};

    // Filter out any non-variable properties
    // Variables should have a 'value' property
    const variables: Record<string, EnvironmentVariableEntry> = {};
    Object.entries(envData).forEach(([key, data]: [string, EnvironmentVariableEntry]) => {
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
