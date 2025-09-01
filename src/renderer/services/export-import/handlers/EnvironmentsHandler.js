/**
 * Environments Handler for Export/Import Operations
 * 
 * This module handles the export and import of environment configurations,
 * including schema processing, variable management, and Git sync integration.
 */

import { getCentralizedEnvironmentService } from '../../../services/CentralizedEnvironmentService';
import { validateEnvironmentVariable, validateEnvironmentSchema } from '../utilities/ValidationUtils.js';
import { isEnvironmentVariableDuplicate } from '../utilities/DuplicateDetection.js';
import { IMPORT_MODES, EVENTS, DEFAULTS } from '../core/ExportImportConfig.js';

const { createLogger } = require('../../../utils/error-handling/logger');
const log = createLogger('EnvironmentsHandler');

/**
 * Environments Handler Class
 * Manages export and import operations for environment configurations
 */
export class EnvironmentsHandler {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.activeWorkspaceId = dependencies.activeWorkspaceId;
  }

  /**
   * Exports environment data for inclusion in export file
   * @param {Object} options - Export options
   * @returns {Promise<Object|null>} - Environment data or null if not selected
   */
  async exportEnvironments(options) {
    const { environmentOption, selectedEnvironments } = options;
    
    if (environmentOption === 'none') {
      log.debug('Environments not selected for export');
      return null;
    }

    try {
      const { generateEnvironmentSchema } = this.dependencies;
      const fullSchema = generateEnvironmentSchema(this.dependencies.sources);
      
      if (environmentOption === 'schema') {
        return this._exportEnvironmentSchema(fullSchema, selectedEnvironments);
      } else if (environmentOption === 'full') {
        return this._exportFullEnvironments(fullSchema, selectedEnvironments);
      }

      return null;
    } catch (error) {
      log.error('Failed to export environments:', error);
      throw new Error(`Failed to export environments: ${error.message}`);
    }
  }

  /**
   * Exports environment schema only
   * @param {Object} fullSchema - Complete environment schema
   * @param {Array} selectedEnvironments - Selected environment names
   * @returns {Object} - Schema export data
   * @private
   */
  _exportEnvironmentSchema(fullSchema, selectedEnvironments) {
    let schema = fullSchema;
    
    if (selectedEnvironments && selectedEnvironments.length > 0) {
      schema = {
        environments: {},
        variableDefinitions: fullSchema.variableDefinitions
      };
      
      selectedEnvironments.forEach(envName => {
        if (fullSchema.environments[envName]) {
          schema.environments[envName] = fullSchema.environments[envName];
        }
      });
    }

    log.info(`Exporting environment schema with ${Object.keys(schema.environments).length} environments`);
    return { environmentSchema: schema };
  }

  /**
   * Exports full environments with values
   * @param {Object} fullSchema - Complete environment schema
   * @param {Array} selectedEnvironments - Selected environment names
   * @returns {Object} - Full environment export data
   * @private
   */
  _exportFullEnvironments(fullSchema, selectedEnvironments) {
    const { environments } = this.dependencies;
    let exportEnvironments = environments;
    let schema = fullSchema;
    
    if (selectedEnvironments && selectedEnvironments.length > 0) {
      exportEnvironments = {};
      selectedEnvironments.forEach(envName => {
        if (environments[envName]) {
          exportEnvironments[envName] = environments[envName];
        }
      });
      
      schema = {
        environments: {},
        variableDefinitions: fullSchema.variableDefinitions
      };
      selectedEnvironments.forEach(envName => {
        if (fullSchema.environments[envName]) {
          schema.environments[envName] = fullSchema.environments[envName];
        }
      });
    }

    const envCount = Object.keys(exportEnvironments).length;
    const totalVars = Object.values(exportEnvironments).reduce((sum, env) => sum + Object.keys(env).length, 0);
    log.info(`Exporting ${envCount} environments with ${totalVars} total variables`);
    
    return {
      environmentSchema: schema,
      environments: exportEnvironments
    };
  }

  /**
   * Imports environment data from import payload
   * @param {Object} importData - Import data containing environment info
   * @param {Object} options - Import options
   * @returns {Promise<Object>} - Import statistics
   */
  async importEnvironments(importData, options) {
    const stats = {
      environmentsImported: 0,
      variablesCreated: 0,
      errors: []
    };

    const hasEnvironmentSchema = options.selectedItems.environments && importData.environmentSchema !== undefined;
    const hasEnvironments = options.selectedItems.environments && importData.environments !== undefined;

    if (!hasEnvironmentSchema && !hasEnvironments) {
      log.debug('No environment data to import');
      return stats;
    }

    try {
      if (hasEnvironments && importData.environments) {
        const fullEnvStats = await this._importFullEnvironments(importData.environments, options);
        stats.environmentsImported += fullEnvStats.environmentsImported;
        stats.variablesCreated += fullEnvStats.variablesCreated;
        stats.errors.push(...fullEnvStats.errors);
      }
      
      if (hasEnvironmentSchema && !hasEnvironments && importData.environmentSchema) {
        const schemaStats = await this._importEnvironmentSchema(importData.environmentSchema, options);
        stats.environmentsImported += schemaStats.environmentsImported;
        stats.variablesCreated += schemaStats.variablesCreated;
        stats.errors.push(...schemaStats.errors);
      }

      log.info(`Environment import completed: ${stats.environmentsImported} environments, ${stats.variablesCreated} variables created`);
      return stats;
    } catch (error) {
      log.error('Failed to import environments:', error);
      throw new Error(`Failed to import environments: ${error.message}`);
    }
  }

  /**
   * Imports full environment data with values
   * @param {Object} environmentsData - Environment data to import
   * @param {Object} options - Import options
   * @returns {Promise<Object>} - Import statistics
   * @private
   */
  async _importFullEnvironments(environmentsData, options) {
    const stats = {
      environmentsImported: 0,
      variablesCreated: 0,
      errors: []
    };

    const { environments, createEnvironment, setVariable } = this.dependencies;
    let environmentsToImport = environmentsData;
    
    // Filter environments based on selection
    if (options.selectedEnvironments && options.selectedEnvironments.length > 0) {
      environmentsToImport = {};
      options.selectedEnvironments.forEach(envName => {
        if (environmentsData[envName]) {
          environmentsToImport[envName] = environmentsData[envName];
        }
      });
    }

    for (const [envName, envVars] of Object.entries(environmentsToImport)) {
      try {
        // Create environment if it doesn't exist
        if (!environments[envName]) {
          await createEnvironment(envName);
          log.debug(`Created new environment: ${envName}`);
        }
        
        // Import variables
        for (const [varName, varData] of Object.entries(envVars)) {
          try {
            // Check for existing variables in merge mode
            if (options.importMode === IMPORT_MODES.MERGE && 
              isEnvironmentVariableDuplicate(varName, envName, environments)) {
              continue;
            }
            
            // Handle both old format (direct value) and new format (object with value property)
            const value = typeof varData === 'object' ? (varData.value || '') : varData;
            const isSecret = typeof varData === 'object' ? (varData.isSecret || false) : false;
            
            await setVariable(varName, value, envName, isSecret);
            stats.variablesCreated++;
          } catch (error) {
            log.error(`Failed to import variable ${varName} in environment ${envName}:`, error);
            stats.errors.push({
              environment: envName,
              variable: varName,
              error: error.message
            });
          }
        }
        
        stats.environmentsImported++;
      } catch (error) {
        log.error(`Failed to import environment ${envName}:`, error);
        stats.errors.push({
          environment: envName,
          error: error.message
        });
      }
    }

    return stats;
  }

  /**
   * Imports environment schema and creates empty variables
   * @param {Object} schemaData - Environment schema data
   * @param {Object} options - Import options
   * @returns {Promise<Object>} - Import statistics
   * @private
   */
  async _importEnvironmentSchema(schemaData, options) {
    const stats = {
      environmentsImported: 0,
      variablesCreated: 0,
      errors: []
    };

    const validation = validateEnvironmentSchema(schemaData);
    if (!validation.success) {
      throw new Error(`Invalid environment schema: ${validation.error}`);
    }

    if (!schemaData.environments) {
      return stats;
    }

    const { environments, createEnvironment } = this.dependencies;
    const currentActiveEnvironment = environments && this.activeWorkspaceId ? this.activeWorkspaceId : DEFAULTS.ENVIRONMENT_NAME;
    
    let environmentsToProcess = schemaData.environments;
    
    // Filter environments based on selection
    if (options.selectedEnvironments && options.selectedEnvironments.length > 0) {
      environmentsToProcess = {};
      options.selectedEnvironments.forEach(envName => {
        if (schemaData.environments[envName]) {
          environmentsToProcess[envName] = schemaData.environments[envName];
        }
      });
    }
    
    // Special handling for Git sync vs regular import
    const isGitSyncImport = options.isGitSync === true;
    
    if (!isGitSyncImport) {
      // For regular imports, if schema only has one environment and no specific selection,
      // import variables into the current active environment instead
      const schemaEnvNames = Object.keys(environmentsToProcess);
      const shouldUseActiveEnv = schemaEnvNames.length === 1 && 
                              (!options.selectedEnvironments || options.selectedEnvironments.length === 0);
      
      if (shouldUseActiveEnv) {
        const [schemaEnvName, envSchema] = Object.entries(environmentsToProcess)[0];
        environmentsToProcess = {
          [currentActiveEnvironment]: envSchema
        };
        log.debug(`Importing variables from schema environment '${schemaEnvName}' into active environment '${currentActiveEnvironment}'`);
      }
    }
    
    for (const [envName, envSchema] of Object.entries(environmentsToProcess)) {
      try {
        // Create environment if it doesn't exist
        if (!environments[envName]) {
          log.debug(`Creating new environment: ${envName}`);
          await createEnvironment(envName);
        }
        
        // Create empty variables from schema's variableDefinitions
        if (schemaData.variableDefinitions && typeof schemaData.variableDefinitions === 'object') {
          // Convert object variableDefinitions to array format for processing
          const variableDefsArray = Object.entries(schemaData.variableDefinitions).map(([name, def]) => ({
            name,
            ...def
          }));
          const schemaStats = await this._createVariablesFromSchema(envName, variableDefsArray);
          stats.variablesCreated += schemaStats.variablesCreated;
          stats.errors.push(...schemaStats.errors);
        }
        
        stats.environmentsImported++;
      } catch (error) {
        log.error(`Failed to process environment ${envName} from schema:`, error);
        stats.errors.push({
          environment: envName,
          error: error.message
        });
      }
    }

    return stats;
  }

  /**
   * Creates variables from schema definitions
   * @param {string} envName - Environment name
   * @param {Array} variableDefinitions - Variable definitions from schema
   * @returns {Promise<Object>} - Creation statistics
   * @private
   */
  async _createVariablesFromSchema(envName, variableDefinitions) {
    const stats = {
      variablesCreated: 0,
      errors: []
    };

    log.debug(`Processing ${Array.isArray(variableDefinitions) ? variableDefinitions.length : Object.keys(variableDefinitions).length} variables for environment ${envName}`);
    
    // Collect all variables to set
    const variablesToSet = [];
    for (const varDef of variableDefinitions) {
      if (varDef.name) {
        const validation = validateEnvironmentVariable(varDef);
        if (validation.success) {
          variablesToSet.push({
            name: varDef.name,
            value: '',
            isSecret: varDef.isSecret || false
          });
        } else {
          stats.errors.push({
            environment: envName,
            variable: varDef.name,
            error: validation.error
          });
        }
      }
    }
    
    // Batch update to avoid race conditions
    if (variablesToSet.length > 0) {
      try {
        await this._batchCreateVariables(envName, variablesToSet);
        stats.variablesCreated = variablesToSet.length;
        log.debug(`Successfully created ${stats.variablesCreated} variables in environment ${envName}`);
      } catch (error) {
        log.error(`Failed to batch create variables in environment ${envName}:`, error);
        stats.errors.push({
          environment: envName,
          error: `Batch creation failed: ${error.message}`
        });
      }
    }

    return stats;
  }

  /**
   * Batch creates multiple variables in an environment
   * @param {string} envName - Environment name
   * @param {Array} variablesToSet - Variables to create
   * @returns {Promise<void>}
   * @private
   */
  async _batchCreateVariables(envName, variablesToSet) {
    const envService = getCentralizedEnvironmentService();
    const currentState = envService.getState();
    const environments = JSON.parse(JSON.stringify(currentState.environments));
    
    // Ensure environment exists
    if (!environments[envName]) {
      environments[envName] = {};
    }
    
    // Add all variables at once
    for (const varDef of variablesToSet) {
      environments[envName][varDef.name] = {
        value: varDef.value,
        isSecret: varDef.isSecret,
        updatedAt: new Date().toISOString()
      };
    }
    
    // Update state and save once
    envService.setState({ environments });
    await envService.saveEnvironments();
    
    // Dispatch event for all changes
    this._emitEnvironmentVariablesChangedEvent(envName, environments[envName]);
  }

  /**
   * Emits an event to notify that environment variables have changed
   * @param {string} envName - Environment name
   * @param {Object} variables - Updated variables
   * @private
   */
  _emitEnvironmentVariablesChangedEvent(envName, variables) {
    try {
      window.dispatchEvent(new CustomEvent(EVENTS.ENVIRONMENT_VARIABLES_CHANGED, {
        detail: { 
          environment: envName, 
          variables: variables 
        }
      }));
    } catch (error) {
      log.warn('Failed to emit environment variables changed event:', error);
    }
  }

  /**
   * Gets statistics about environments for reporting
   * @param {Object} environmentData - Environment data object
   * @returns {Object} - Statistics object
   */
  getEnvironmentStatistics(environmentData) {
    const stats = {
      environments: 0,
      totalVariables: 0,
      secretVariables: 0,
      emptyVariables: 0,
      schemaVariables: 0
    };

    if (environmentData.environments) {
      stats.environments = Object.keys(environmentData.environments).length;
      
      Object.values(environmentData.environments).forEach(envVars => {
        Object.values(envVars).forEach(varData => {
          stats.totalVariables++;
          
          if (typeof varData === 'object') {
            if (varData.isSecret) stats.secretVariables++;
            if (!varData.value) stats.emptyVariables++;
          } else if (!varData) {
            stats.emptyVariables++;
          }
        });
      });
    }

    if (environmentData.environmentSchema && environmentData.environmentSchema.variableDefinitions) {
      stats.schemaVariables = Object.keys(environmentData.environmentSchema.variableDefinitions).length;
    }

    return stats;
  }


  /**
   * Validates environment data for export
   * @param {Object} environmentData - Environment data to validate
   * @returns {Object} - Validation result
   */
  validateEnvironmentsForExport(environmentData) {
    if (!environmentData || typeof environmentData !== 'object') {
      return {
        success: false,
        error: 'Environment data must be an object'
      };
    }

    const errors = [];

    if (environmentData.environmentSchema) {
      const schemaValidation = validateEnvironmentSchema(environmentData.environmentSchema);
      if (!schemaValidation.success) {
        errors.push(`Schema validation failed: ${schemaValidation.error}`);
      }
    }

    if (environmentData.environments) {
      Object.entries(environmentData.environments).forEach(([envName, envVars]) => {
        if (typeof envVars !== 'object') {
          errors.push(`Environment ${envName} variables must be an object`);
          return;
        }

        Object.entries(envVars).forEach(([varName, varData]) => {
          const validation = validateEnvironmentVariable({ name: varName, ...varData });
          if (!validation.success) {
            errors.push(`Variable ${varName} in environment ${envName}: ${validation.error}`);
          }
        });
      });
    }

    if (errors.length > 0) {
      return {
        success: false,
        error: errors.join('; ')
      };
    }

    return { success: true };
  }
}