/**
 * Configuration File Validator
 * 
 * Shared validation logic for Open Headers configuration files
 * Used by Import modal and Git workspace validation
 * This is a shared utility that can be used by both main and renderer processes
 */

// Use appropriate logger for the context
let log;
try {
  // Try renderer logger first
  if (typeof window !== 'undefined' && window.electronAPI) {
    const rendererLogger = require('../renderer/utils/error-handling/logger');
    log = rendererLogger.createLogger('ConfigValidator');
  } else {
    // Fall back to main logger
    const mainLogger = require('./mainLogger');
    log = mainLogger.createLogger('ConfigValidator');
  }
} catch (e) {
  // If both fail, use console
  log = {
    debug: (...args) => console.debug('[ConfigValidator]', ...args),
    info: (...args) => console.info('[ConfigValidator]', ...args),
    warn: (...args) => console.warn('[ConfigValidator]', ...args),
    error: (...args) => console.error('[ConfigValidator]', ...args)
  };
}

/**
 * Helper function to calculate environment count
 * @param {Object} data - Parsed JSON data
 * @returns {number} Environment count
 */
function calculateEnvironmentCount(data) {
  return data.environments ? Object.keys(data.environments).length : 
         (data.environmentSchema?.environments ? Object.keys(data.environmentSchema.environments).length : 0);
}

/**
 * Helper function to calculate variable count
 * @param {Object} data - Parsed JSON data
 * @returns {number} Variable count
 */
function calculateVariableCount(data) {
  return data.environmentSchema ? Object.keys(data.environmentSchema.variableDefinitions || {}).length : 0;
}

/**
 * Analyze and validate Open Headers configuration file content
 * @param {string} content - Raw file content to validate
 * @param {boolean} isEnvFile - Whether this is expected to be an environment-only file
 * @param {boolean} isSeparateMode - Whether we're in separate files mode (affects validation strictness)
 * @returns {Object} Validation result with file info or error
 */
async function analyzeConfigFile(content, isEnvFile = false, isSeparateMode = false) {
  try {
    const data = JSON.parse(content);
    
    if (isEnvFile) {
      // Environment file should only contain environment data
      const hasOtherData = data.rules || data.sources || data.proxyRules;
      if (hasOtherData) {
        return {
          valid: false,
          error: 'This appears to be a main configuration file with sources/rules/proxy rules. Please use the main configuration file upload area for this file.'
        };
      }
      
      return {
        valid: true,
        hasEnvironmentSchema: !!data.environmentSchema,
        hasEnvironments: !!data.environments,
        environmentCount: calculateEnvironmentCount(data),
        variableCount: calculateVariableCount(data),
        rawData: data
      };
    }
    
    // For main config file in separate mode, check if it's environment-only
    const hasOnlyEnvData = !data.sources && !data.rules && !data.proxyRules && 
                           (data.environmentSchema || data.environments);
    
    // In separate files mode, reject environment-only files for main config area
    if (isSeparateMode && hasOnlyEnvData) {
      return {
        valid: false,
        error: 'This appears to be an environment-only file. Please use the environment file upload area for environment files.'
      };
    }
    
    return {
      valid: true,
      hasEnvironmentSchema: !!data.environmentSchema,
      hasEnvironments: !!data.environments,
      hasRules: !!data.rules,
      hasSources: !!data.sources,
      hasProxyRules: !!data.proxyRules,
      ruleCount: data.rules ? data.rules.length : 0,
      sourceCount: data.sources ? data.sources.length : 0,
      proxyRuleCount: data.proxyRules ? data.proxyRules.length : 0,
      environmentCount: calculateEnvironmentCount(data),
      variableCount: calculateVariableCount(data),
      rawData: data
    };
  } catch (error) {
    log.error('Config file analysis failed:', error);
    return {
      valid: false,
      error: error.message
    };
  }
}

/**
 * Validate Git workspace configuration
 * @param {string} configPath - Path to config file
 * @param {string} envPath - Path to environment file (optional)
 * @returns {Object} Validation result
 */
async function validateGitWorkspaceConfig(configPath, envPath) {
  const fs = require('fs').promises;
  
  try {
    log.info('Validating Git workspace config:', { configPath, envPath });
    
    // Read and validate main config file
    const configContent = await fs.readFile(configPath, 'utf8');
    const configResult = await analyzeConfigFile(configContent, false, !!envPath);
    
    if (!configResult.valid) {
      return {
        valid: false,
        error: `Main config file validation failed: ${configResult.error}`
      };
    }
    
    let envResult = null;
    if (envPath) {
      // Read and validate environment file
      const envContent = await fs.readFile(envPath, 'utf8');
      envResult = await analyzeConfigFile(envContent, true, true);
      
      if (!envResult.valid) {
        return {
          valid: false,
          error: `Environment file validation failed: ${envResult.error}`
        };
      }
    }
    
    // Combine results
    const totalSources = configResult.sourceCount + (envResult ? 0 : 0);
    const totalRules = configResult.ruleCount + (envResult ? 0 : 0);
    const totalProxyRules = configResult.proxyRuleCount + (envResult ? 0 : 0);
    const totalEnvironments = Math.max(configResult.environmentCount, envResult ? envResult.environmentCount : 0);
    const totalVariables = Math.max(configResult.variableCount, envResult ? envResult.variableCount : 0);
    
    return {
      valid: true,
      configFile: configResult,
      envFile: envResult,
      summary: {
        sources: totalSources,
        rules: totalRules,
        proxyRules: totalProxyRules,
        environments: totalEnvironments,
        variables: totalVariables,
        isMultiFile: !!envPath
      }
    };
  } catch (error) {
    log.error('Git workspace validation error:', error);
    return {
      valid: false,
      error: error.message
    };
  }
}

/**
 * Read and validate multi-file configuration
 * @param {string} configPath - Path to main config file
 * @param {string} envPath - Path to environment file
 * @returns {Object} Combined validation result
 */
async function readAndValidateMultiFileConfig(configPath, envPath) {
  return await validateGitWorkspaceConfig(configPath, envPath);
}

module.exports = {
  analyzeConfigFile,
  validateGitWorkspaceConfig,
  readAndValidateMultiFileConfig
};