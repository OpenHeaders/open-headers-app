import { useCallback } from 'react';

interface UseEnvReturn {
  getVariable: (name: string) => Promise<string>;
}

/**
 * Custom hook for environment variable operations
 */
export function useEnv(): UseEnvReturn {
    /**
     * Get environment variable value
     */
    const getVariable = useCallback(async (name: string): Promise<string> => {
        try {
            if (!name) {
                throw new Error('Environment variable name is required');
            }

            return await window.electronAPI.getEnvVariable(name);
        } catch (error: unknown) {
            throw new Error(`Error getting environment variable: ${error instanceof Error ? error.message : String(error)}`);
        }
    }, []);

    return {
        getVariable
    };
}
