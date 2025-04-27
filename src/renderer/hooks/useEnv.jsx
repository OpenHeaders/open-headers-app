import { useCallback } from 'react';

/**
 * Custom hook for environment variable operations
 */
export function useEnv() {
    /**
     * Get environment variable value
     */
    const getVariable = useCallback(async (name) => {
        try {
            if (!name) {
                throw new Error('Environment variable name is required');
            }

            return await window.electronAPI.getEnvVariable(name);
        } catch (error) {
            throw new Error(`Error getting environment variable: ${error.message}`);
        }
    }, []);

    return {
        getVariable
    };
}