import { useCallback } from 'react';
import { useEnvironmentCore, EnvironmentVariableEntry } from './useEnvironmentCore';
import { showMessage } from '../../utils/ui/messageUtil';
import { createLogger } from '../../utils/error-handling/logger';
const log = createLogger('useEnvironmentOperations');

interface UseEnvironmentOperationsReturn {
  environments: Record<string, Record<string, EnvironmentVariableEntry>>;
  activeEnvironment: string;
  createEnvironment: (name: string) => Promise<boolean>;
  deleteEnvironment: (name: string) => Promise<boolean>;
  switchEnvironment: (name: string) => Promise<boolean>;
  cloneEnvironment: (sourceEnv: string, newName: string) => Promise<boolean>;
  waitForEnvironments: (timeout?: number) => Promise<boolean>;
}

/**
 * Hook for environment CRUD operations
 */
export function useEnvironmentOperations(): UseEnvironmentOperationsReturn {
  const { service, environments, activeEnvironment } = useEnvironmentCore();

  const createEnvironment = useCallback(async (name: string): Promise<boolean> => {
    try {
      await service.createEnvironment(name);
      showMessage('success', `Environment '${name}' created`);
      return true;
    } catch (error: unknown) {
      showMessage('error', error instanceof Error ? error.message : String(error));
      return false;
    }
  }, [service]);

  const deleteEnvironment = useCallback(async (name: string): Promise<boolean> => {
    try {
      await service.deleteEnvironment(name);
      showMessage('success', `Environment '${name}' deleted`);
      return true;
    } catch (error: unknown) {
      showMessage('error', error instanceof Error ? error.message : String(error));
      return false;
    }
  }, [service]);

  const switchEnvironment = useCallback(async (name: string): Promise<boolean> => {
    try {
      await service.switchEnvironment(name);
      showMessage('success', `Switched to '${name}' environment`);
      return true;
    } catch (error: unknown) {
      showMessage('error', error instanceof Error ? error.message : String(error));
      return false;
    }
  }, [service]);

  const cloneEnvironment = useCallback(async (sourceEnv: string, newName: string): Promise<boolean> => {
    try {
      const sourceVars = environments[sourceEnv];
      if (!sourceVars) {
        throw new Error(`Source environment '${sourceEnv}' does not exist`);
      }

      await service.createEnvironment(newName);

      // Batch copy all variables (single save + single IPC event)
      const variablesToSet = Object.entries(sourceVars).map(([varName, variable]: [string, EnvironmentVariableEntry]) => ({
        name: varName,
        value: variable.value ?? null,
        isSecret: variable.isSecret
      }));

      if (variablesToSet.length > 0) {
        await service.batchSetVariablesInEnvironment(newName, variablesToSet);
      }

      showMessage('success', `Environment '${sourceEnv}' cloned to '${newName}'`);
      return true;
    } catch (error: unknown) {
      showMessage('error', error instanceof Error ? error.message : String(error));
      return false;
    }
  }, [service, environments]);

  const waitForEnvironments = useCallback(async (timeout: number = 5000): Promise<boolean> => {
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
