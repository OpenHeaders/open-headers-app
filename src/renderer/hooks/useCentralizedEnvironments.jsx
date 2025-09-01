import { 
  useEnvironmentCore,
  useEnvironmentOperations,
  useEnvironmentVariables,
  useEnvironmentTemplates,
  useEnvironmentSchema
} from './environment';

/**
 * Hook to use the centralized environment service
 * Provides the same API as useEnvironments but with guaranteed state consistency
 * This combines all the modular environment hooks into a single interface
 */
export function useCentralizedEnvironments() {
  const core = useEnvironmentCore();
  const operations = useEnvironmentOperations();
  const variables = useEnvironmentVariables();
  const templates = useEnvironmentTemplates();
  const schema = useEnvironmentSchema();

  return {
    // State from core
    environments: core.environments,
    activeEnvironment: core.activeEnvironment,
    loading: core.isLoading,
    environmentsReady: core.isReady,
    
    // Functions from operations
    waitForEnvironments: operations.waitForEnvironments,
    createEnvironment: operations.createEnvironment,
    deleteEnvironment: operations.deleteEnvironment,
    switchEnvironment: operations.switchEnvironment,
    cloneEnvironment: operations.cloneEnvironment,
    
    // Functions from variables
    setVariable: variables.setVariable,
    deleteVariable: variables.deleteVariable,
    getVariable: variables.getVariable,
    getAllVariables: variables.getAllVariables,
    getAllVariablesWithMetadata: variables.getAllVariablesWithMetadata,
    
    // Functions from templates
    resolveTemplate: templates.resolveTemplate,
    resolveObjectTemplate: templates.resolveObjectTemplate,
    
    // Functions from schema
    findVariableUsage: schema.findVariableUsage,
    generateEnvironmentSchema: schema.generateEnvironmentSchema,
    
    // Direct service access if needed
    service: core.service
  };
}

// Export with same name as original for drop-in replacement
export const useEnvironments = useCentralizedEnvironments;