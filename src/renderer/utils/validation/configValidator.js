/**
 * Configuration File Validator
 * 
 * Shared validation logic for Open Headers configuration files
 * Used by Import modal and Git workspace validation
 */

const { createLogger } = require('../error-handling/logger');
const log = createLogger('ConfigValidator');

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
        throw new Error('This appears to be a main configuration file with sources/rules/proxy rules. Please use the main configuration file upload area for this file.');
      }
      
      return {
        valid: true,
        hasEnvironmentSchema: !!data.environmentSchema,
        hasEnvironments: !!data.environments,
        environmentCount: data.environments ? Object.keys(data.environments).length : 
                        (data.environmentSchema?.environments ? Object.keys(data.environmentSchema.environments).length : 0),
        variableCount: data.environmentSchema ? Object.keys(data.environmentSchema.variableDefinitions || {}).length : 0,
        rawData: data
      };
    }
    
    // For main config file in separate mode, check if it's environment-only
    const hasOnlyEnvData = !data.sources && !data.rules && !data.proxyRules && 
                           (data.environmentSchema || data.environments);
    
    // In separate files mode, reject environment-only files for main config area
    if (isSeparateMode && hasOnlyEnvData) {
      throw new Error('This appears to be an environment-only file. Please use the environment file upload area for environment files.');
    }
    
    const info = {
      valid: true,
      version: data.version || 'Unknown',
      hasRules: !!data.rules,
      hasSources: !!data.sources,
      hasProxyRules: !!data.proxyRules,
      hasEnvironmentSchema: !!data.environmentSchema,
      hasEnvironments: !!data.environments,
      hasWorkspace: !!data.workspace,
      
      // Counts
      ruleCount: 0,
      sourceCount: data.sources ? data.sources.length : 0,
      proxyRuleCount: data.proxyRules ? data.proxyRules.length : 0,
      environmentCount: data.environments ? Object.keys(data.environments).length : 
                      (data.environmentSchema?.environments ? Object.keys(data.environmentSchema.environments).length : 0),
      variableCount: data.environmentSchema ? Object.keys(data.environmentSchema.variableDefinitions || {}).length : 0,
      
      // Rule breakdown
      ruleBreakdown: {},
      
      // Workspace info if present
      workspaceInfo: data.workspace || null,
      
      // Store raw data for further validation
      rawData: data
    };
    
    // Count rules by type
    if (data.rules) {
      for (const [ruleType, rules] of Object.entries(data.rules)) {
        if (Array.isArray(rules)) {
          info.ruleBreakdown[ruleType] = rules.length;
          info.ruleCount += rules.length;
        }
      }
    }
    
    // Additional validation for structure
    validateConfigStructure(data);
    
    return info;
  } catch (error) {
    if (error.message.includes('Environment file') || error.message.includes('environment-only')) {
      throw error;
    }
    throw new Error('Invalid file format. Please select a valid Open Headers configuration file.');
  }
}

/**
 * Validate the internal structure of configuration data
 * @param {Object} data - Parsed configuration object
 * @throws {Error} If structure is invalid
 */
function validateConfigStructure(data) {
  // Validate sources
  if (data.sources) {
    if (!Array.isArray(data.sources)) {
      throw new Error('Invalid configuration: sources must be an array');
    }
    
    data.sources.forEach((source, index) => {
      if (!source.sourceId || !source.sourceType || !source.sourcePath) {
        throw new Error(`Invalid source at index ${index}: missing required fields`);
      }
      
      if (!['http', 'file', 'env'].includes(source.sourceType)) {
        throw new Error(`Invalid source type at index ${index}: ${source.sourceType}`);
      }
    });
  }
  
  // Validate rules
  if (data.rules) {
    if (typeof data.rules !== 'object') {
      throw new Error('Invalid configuration: rules must be an object');
    }
    
    for (const [ruleType, rules] of Object.entries(data.rules)) {
      if (!Array.isArray(rules)) {
        throw new Error(`Invalid configuration: rules.${ruleType} must be an array`);
      }
    }
  }
  
  // Validate proxy rules
  if (data.proxyRules) {
    if (!Array.isArray(data.proxyRules)) {
      throw new Error('Invalid configuration: proxyRules must be an array');
    }
    
    data.proxyRules.forEach((rule, index) => {
      // Validate based on rule type
      const isDynamicRule = rule.isDynamic === true || !!rule.headerRuleId;
      const isStaticRule = rule.isDynamic === false || (rule.domains && rule.domains.length > 0);
      
      if (!isDynamicRule && !isStaticRule) {
        throw new Error(`Invalid proxy rule at index ${index}: must have either domains (for static rules) or headerRuleId (for dynamic rules)`);
      }
      
      // Validate static rules
      if (isStaticRule && !isDynamicRule) {
        if (!rule.domains || !Array.isArray(rule.domains) || rule.domains.length === 0) {
          throw new Error(`Invalid proxy rule at index ${index}: static rule must have at least one domain`);
        }
        if (!rule.headerName || typeof rule.headerName !== 'string') {
          throw new Error(`Invalid proxy rule at index ${index}: static rule must have a valid header name`);
        }
      }
      
      // Validate dynamic rules  
      if (isDynamicRule) {
        if (!rule.headerRuleId || typeof rule.headerRuleId !== 'string') {
          throw new Error(`Invalid proxy rule at index ${index}: dynamic rule must have a valid header rule ID`);
        }
      }
    });
  }
  
  // Validate environment schema
  if (data.environmentSchema) {
    if (typeof data.environmentSchema !== 'object') {
      throw new Error('Invalid configuration: environmentSchema must be an object');
    }
    
    if (data.environmentSchema.variableDefinitions && 
        typeof data.environmentSchema.variableDefinitions !== 'object') {
      throw new Error('Invalid configuration: environmentSchema.variableDefinitions must be an object');
    }
  }
  
  // Validate environments
  if (data.environments) {
    if (typeof data.environments !== 'object') {
      throw new Error('Invalid configuration: environments must be an object');
    }
    
    for (const [envName, envVars] of Object.entries(data.environments)) {
      if (typeof envVars !== 'object') {
        throw new Error(`Invalid environment ${envName}: must be an object`);
      }
    }
  }
  
  // Validate workspace configuration
  if (data.workspace) {
    if (typeof data.workspace !== 'object') {
      throw new Error('Invalid configuration: workspace must be an object');
    }
    
    // Required fields for Git workspace
    if (data.workspace.type === 'git') {
      if (!data.workspace.gitUrl) {
        throw new Error('Invalid workspace configuration: gitUrl is required for Git workspaces');
      }
      if (!data.workspace.name) {
        throw new Error('Invalid workspace configuration: name is required');
      }
    }
  }
}

/**
 * Validate configuration for Git workspace
 * This includes both file validation and Git-specific checks
 * @param {string} content - Configuration file content
 * @param {string} filePath - Expected file path in repository
 * @returns {Object} Validation result
 */
async function validateGitWorkspaceConfig(content, filePath) {
  try {
    // First, use the standard config validation
    const validationResult = await analyzeConfigFile(content, false, false);
    
    // Check if config has any data (workspace alone is not enough)
    const hasData = validationResult.sourceCount > 0 || 
                    validationResult.ruleCount > 0 || 
                    validationResult.proxyRuleCount > 0 || 
                    validationResult.environmentCount > 0 ||
                    validationResult.variableCount > 0;
    
    if (!hasData) {
      return {
        success: false,
        error: `Configuration file is empty or contains no data to import`,
        details: validationResult
      };
    }
    
    // Additional Git-specific validation could go here
    // For example, checking for required workspace metadata
    
    return {
      success: true,
      message: 'Configuration file is valid',
      details: validationResult,
      summary: {
        sources: validationResult.sourceCount,
        rules: validationResult.ruleCount,
        proxyRules: validationResult.proxyRuleCount,
        environments: validationResult.environmentCount,
        variables: validationResult.variableCount
      }
    };
  } catch (error) {
    log.error('Git workspace config validation failed:', error);
    return {
      success: false,
      error: error.message || 'Invalid configuration file',
      details: null
    };
  }
}

/**
 * Read and validate multi-file configuration format
 * @param {Function} readFile - Function to read file content (async)
 * @param {string} basePath - Base path for config files
 * @returns {Object} Combined configuration object
 */
async function readAndValidateMultiFileConfig(readFile, basePath) {
  let config = {};
  let validationResults = {
    mainFile: null,
    envFile: null
  };
  
  try {
    // Look for main config file
    const mainConfigPattern = /^open-headers-config.*\.json$/;
    const envConfigPattern = /^open-headers-env.*\.json$/;
    
    // Try to read main config
    try {
      const files = await readFile(basePath, { list: true });
      const mainFile = files.find(f => mainConfigPattern.test(f));
      
      if (mainFile) {
        const content = await readFile(`${basePath}/${mainFile}`);
        const result = await analyzeConfigFile(content, false, true);
        validationResults.mainFile = result;
        config = result.rawData;
      }
    } catch (error) {
      log.debug('No main config file found in multi-file format');
    }
    
    // Try to read env file
    try {
      const files = await readFile(basePath, { list: true });
      const envFile = files.find(f => envConfigPattern.test(f));
      
      if (envFile) {
        const content = await readFile(`${basePath}/${envFile}`);
        const result = await analyzeConfigFile(content, true, true);
        validationResults.envFile = result;
        
        // Merge environment data
        if (result.rawData.environmentSchema) {
          config.environmentSchema = result.rawData.environmentSchema;
        }
        if (result.rawData.environments) {
          config.environments = result.rawData.environments;
        }
      }
    } catch (error) {
      log.debug('No env file found in multi-file format');
    }
    
    // Validate we found at least something
    if (!validationResults.mainFile && !validationResults.envFile) {
      throw new Error('No valid configuration files found in the expected format');
    }
    
    return {
      success: true,
      config,
      validationResults
    };
  } catch (error) {
    log.error('Multi-file config validation failed:', error);
    return {
      success: false,
      error: error.message,
      config: null,
      validationResults
    };
  }
}

// Export functions for both CommonJS and ES modules
module.exports = {
  analyzeConfigFile,
  validateGitWorkspaceConfig,
  readAndValidateMultiFileConfig
};

// Also export as named exports for ES modules
module.exports.analyzeConfigFile = analyzeConfigFile;
module.exports.validateGitWorkspaceConfig = validateGitWorkspaceConfig;
module.exports.readAndValidateMultiFileConfig = readAndValidateMultiFileConfig;