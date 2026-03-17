/**
 * EnvironmentVariableManager - Manages environment variables and operations
 */
const { createLogger } = require('../../utils/error-handling/logger');
const log = createLogger('EnvironmentVariableManager');

class EnvironmentVariableManager {
  constructor() {}

  /**
   * Get all variables for an environment
   */
  getAllVariables(environments, activeEnvironment) {
    const envVars = environments[activeEnvironment] || {};
    const result = {};

    Object.entries(envVars).forEach(([key, variable]) => {
      // Variables are always stored as objects with value property
      result[key] = variable.value || '';
    });

    return result;
  }

  /**
   * Set variable in an environment
   */
  setVariable(environments, environmentName, name, value, isSecret = false) {
    // Deep copy to avoid mutations
    const updatedEnvironments = JSON.parse(JSON.stringify(environments));
    
    if (!updatedEnvironments[environmentName]) {
      throw new Error(`Environment '${environmentName}' does not exist`);
    }

    if (value === null || value === '') {
      delete updatedEnvironments[environmentName][name];
      log.debug(`Deleted variable ${name} from environment ${environmentName}`);
    } else {
      updatedEnvironments[environmentName][name] = {
        value,
        isSecret,
        updatedAt: new Date().toISOString()
      };
      log.debug(`Set variable ${name} in environment ${environmentName}:`, {
        value: isSecret ? '(secret)' : value,
        isSecret
      });
    }

    return updatedEnvironments;
  }

  /**
   * Create a new environment
   */
  createEnvironment(environments, name) {
    if (environments[name]) {
      throw new Error(`Environment '${name}' already exists`);
    }

    const updatedEnvironments = {
      ...environments,
      [name]: {}
    };

    log.info(`Created environment: ${name}`);
    return updatedEnvironments;
  }

  /**
   * Delete an environment
   */
  deleteEnvironment(environments, name) {
    if (name === 'Default') {
      throw new Error('Cannot delete Default environment');
    }

    const updatedEnvironments = { ...environments };
    delete updatedEnvironments[name];

    log.info(`Deleted environment: ${name}`);
    return updatedEnvironments;
  }

  /**
   * Validate environment exists
   */
  validateEnvironmentExists(environments, name) {
    if (!environments[name]) {
      throw new Error(`Environment '${name}' does not exist`);
    }
  }

  /**
   * Get variable count for an environment
   */
  getVariableCount(environments, environmentName) {
    const env = environments[environmentName];
    return env ? Object.keys(env).length : 0;
  }

  /**
   * Export environment variables in a specific format
   */
  exportEnvironment(environments, environmentName, format = 'json') {
    const env = environments[environmentName];
    if (!env) {
      throw new Error(`Environment '${environmentName}' does not exist`);
    }

    switch (format) {
      case 'json':
        return JSON.stringify(env, null, 2);
      
      case 'env':
        // Export as .env format
        return Object.entries(env)
          .map(([key, variable]) => `${key}=${variable.value || ''}`)
          .join('\n');
      
      case 'shell':
        // Export as shell export commands
        return Object.entries(env)
          .map(([key, variable]) => `export ${key}="${variable.value || ''}"`)
          .join('\n');
      
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Import environment variables from different formats
   */
  importEnvironment(data, format = 'json') {
    const variables = {};

    switch (format) {
      case 'json':
        const parsed = JSON.parse(data);
        Object.entries(parsed).forEach(([key, value]) => {
          if (typeof value === 'object' && value.value !== undefined) {
            variables[key] = value;
          } else {
            // Convert simple key-value to variable object
            variables[key] = {
              value: String(value),
              isSecret: false,
              updatedAt: new Date().toISOString()
            };
          }
        });
        break;
      
      case 'env':
        // Parse .env format
        data.split('\n').forEach(line => {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const [key, ...valueParts] = trimmed.split('=');
            if (key) {
              variables[key.trim()] = {
                value: valueParts.join('=').trim(),
                isSecret: false,
                updatedAt: new Date().toISOString()
              };
            }
          }
        });
        break;
      
      default:
        throw new Error(`Unsupported import format: ${format}`);
    }

    return variables;
  }
}

module.exports = EnvironmentVariableManager;