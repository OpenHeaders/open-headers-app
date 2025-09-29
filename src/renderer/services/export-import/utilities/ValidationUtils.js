/**
 * Validation Utilities for Export/Import Operations
 * 
 * This module provides comprehensive validation functions for ensuring data integrity
 * during import/export operations. It validates structure, required fields, data types,
 * and business rules for all supported data types.
 * 
 * Key features:
 * - JSON structure validation with detailed error messages
 * - Type-specific validation rules (sources, proxy rules, environment variables)
 * - Version compatibility checking
 * - Comprehensive payload validation with error aggregation
 * - Support for validation warnings vs hard errors
 */

import { VALIDATION_RULES, ERROR_MESSAGES } from '../core/ExportImportConfig.js';

/**
 * Validates the basic structure of import data
 * 
 * Performs initial validation to ensure the data is a valid object (not null, array, or primitive).
 * This is the first validation step before type-specific validations.
 * 
 * @param {any} data - The data to validate
 * @returns {Object} - Validation result with success flag and error message
 */
export function validateImportData(data) {
  if (!data || typeof data !== 'object') {
    return {
      success: false,
      error: ERROR_MESSAGES.INVALID_FILE_FORMAT
    };
  }

  if (Array.isArray(data)) {
    return {
      success: false,
      error: 'Import data must be an object, not an array'
    };
  }

  return { success: true };
}

/**
 * Validates file content and attempts to parse JSON
 * 
 * Combines JSON parsing with basic structure validation. Returns both
 * validation result and parsed data if successful.
 * 
 * @param {string} fileContent - Raw file content
 * @returns {Object} - Validation result with parsed data or error
 */
export function validateAndParseFileContent(fileContent) {
  try {
    if (!fileContent || typeof fileContent !== 'string') {
      return {
        success: false,
        error: 'File content is empty or invalid'
      };
    }

    const parsedData = JSON.parse(fileContent);
    const validationResult = validateImportData(parsedData);
    
    if (!validationResult.success) {
      return validationResult;
    }

    return {
      success: true,
      data: parsedData
    };
  } catch (error) {
    return {
      success: false,
      error: `Invalid JSON format: ${error.message}`
    };
  }
}

/**
 * Validates workspace configuration
 * 
 * Validates workspace objects for required fields (name, type) and enforces
 * business rules like maximum name length.
 * 
 * @param {Object} workspace - Workspace configuration object
 * @returns {Object} - Validation result
 */
export function validateWorkspaceConfig(workspace) {
  if (!workspace || typeof workspace !== 'object') {
    return {
      success: false,
      error: 'Workspace configuration is required and must be an object'
    };
  }

  const requiredFields = VALIDATION_RULES.REQUIRED_FIELDS.WORKSPACE;
  for (const field of requiredFields) {
    if (!workspace[field]) {
      return {
        success: false,
        error: `Workspace configuration missing required field: ${field}`
      };
    }
  }

  if (workspace.name && workspace.name.length > VALIDATION_RULES.MAX_NAME_LENGTH) {
    return {
      success: false,
      error: `Workspace name exceeds maximum length of ${VALIDATION_RULES.MAX_NAME_LENGTH} characters`
    };
  }

  return { success: true };
}

/**
 * Validates environment variable definition
 * @param {Object} variable - Environment variable object
 * @returns {Object} - Validation result
 */
export function validateEnvironmentVariable(variable) {
  if (!variable || typeof variable !== 'object') {
    return {
      success: false,
      error: 'Environment variable must be an object'
    };
  }

  if (!variable.name || typeof variable.name !== 'string') {
    return {
      success: false,
      error: 'Environment variable must have a valid name'
    };
  }

  if (variable.name.length > VALIDATION_RULES.MAX_NAME_LENGTH) {
    return {
      success: false,
      error: `Variable name exceeds maximum length of ${VALIDATION_RULES.MAX_NAME_LENGTH} characters`
    };
  }

  return { success: true };
}

/**
 * Validates proxy rule configuration
 * @param {Object} rule - Proxy rule object
 * @returns {Object} - Validation result
 */
export function validateProxyRule(rule) {
  if (!rule || typeof rule !== 'object') {
    return {
      success: false,
      error: 'Proxy rule must be an object'
    };
  }

  // Proxy rules can be either static (with domains) or dynamic (with headerRuleId)
  const isDynamicRule = rule.isDynamic === true || !!rule.headerRuleId;
  const isStaticRule = rule.isDynamic === false || (rule.domains && rule.domains.length > 0);

  if (!isDynamicRule && !isStaticRule) {
    return {
      success: false,
      error: 'Proxy rule must have either domains (for static rules) or headerRuleId (for dynamic rules)'
    };
  }

  // Validate static rules
  if (isStaticRule && !isDynamicRule) {
    if (!rule.domains || !Array.isArray(rule.domains) || rule.domains.length === 0) {
      return {
        success: false,
        error: 'Static proxy rule must have at least one domain'
      };
    }
    if (!rule.headerName || typeof rule.headerName !== 'string') {
      return {
        success: false,
        error: 'Static proxy rule must have a valid header name'
      };
    }
  }

  // Validate dynamic rules
  if (isDynamicRule) {
    if (!rule.headerRuleId || typeof rule.headerRuleId !== 'string') {
      return {
        success: false,
        error: 'Dynamic proxy rule must have a valid header rule ID'
      };
    }
  }

  return { success: true };
}

/**
 * Validates source configuration
 * 
 * Validates source objects for required fields and type-specific requirements.
 * Different source types (http, file, env) have different validation rules.
 * 
 * @param {Object} source - Source object
 * @returns {Object} - Validation result
 */
export function validateSource(source) {
  if (!source || typeof source !== 'object') {
    return {
      success: false,
      error: 'Source must be an object'
    };
  }

  const requiredFields = VALIDATION_RULES.REQUIRED_FIELDS.SOURCE;
  for (const field of requiredFields) {
    if (!source[field]) {
      return {
        success: false,
        error: `Source missing required field: ${field}`
      };
    }
  }

  // Validate source type specific requirements
  switch (source.sourceType) {
    case 'http':
      // For HTTP sources, the URL is stored in sourcePath field
      if (!source.sourcePath || typeof source.sourcePath !== 'string') {
        return {
          success: false,
          error: 'HTTP source must have a valid URL in sourcePath'
        };
      }
      // Validate that sourcePath contains a valid URL
      try {
        new URL(source.sourcePath);
      } catch {
        return {
          success: false,
          error: 'HTTP source must have a valid URL in sourcePath'
        };
      }
      break;
    case 'file':
      if (!source.sourcePath || typeof source.sourcePath !== 'string') {
        return {
          success: false,
          error: 'File source must have a valid file path'
        };
      }
      break;
    case 'env':
      if (!source.sourcePath || typeof source.sourcePath !== 'string') {
        return {
          success: false,
          error: 'Environment source must have a valid variable name'
        };
      }
      break;
  }

  return { success: true };
}

/**
 * Validates version compatibility
 * 
 * Checks if the version is supported by the current application version.
 * Returns warnings for unsupported versions instead of hard errors to allow
 * graceful degradation.
 * 
 * @param {string} version - Version string to validate
 * @returns {Object} - Validation result
 */
export function validateVersion(version) {
  if (!version || typeof version !== 'string') {
    return {
      success: false,
      error: 'Version must be a valid string'
    };
  }

  if (!VALIDATION_RULES.SUPPORTED_VERSIONS.includes(version)) {
    return {
      success: true, // Don't fail for unsupported versions, just warn
      warning: `Version ${version} may not be fully supported. Supported versions: ${VALIDATION_RULES.SUPPORTED_VERSIONS.join(', ')}`
    };
  }

  return { success: true };
}

/**
 * Validates environment schema structure
 * @param {Object} schema - Environment schema object
 * @returns {Object} - Validation result
 */
export function validateEnvironmentSchema(schema) {
  if (!schema || typeof schema !== 'object') {
    return {
      success: false,
      error: 'Environment schema must be an object'
    };
  }

  if (schema.environments && typeof schema.environments !== 'object') {
    return {
      success: false,
      error: 'Environment schema environments must be an object'
    };
  }

  // Accept both object and array formats for variableDefinitions
  if (schema.variableDefinitions) {
    if (typeof schema.variableDefinitions !== 'object') {
      return {
        success: false,
        error: 'Environment schema variable definitions must be an object or array'
      };
    }
  }

  return { success: true };
}

/**
 * Validates a complete import payload
 * 
 * Performs comprehensive validation of an entire import payload, including
 * all nested objects. Aggregates all errors and warnings into a single result.
 * 
 * @param {Object} payload - Complete import payload
 * @returns {Object} - Comprehensive validation result with aggregated errors/warnings
 */
export function validateImportPayload(payload) {
  const errors = [];
  const warnings = [];

  // Basic structure validation
  const basicValidation = validateImportData(payload);
  if (!basicValidation.success) {
    return basicValidation;
  }

  // Version validation
  if (payload.version) {
    const versionValidation = validateVersion(payload.version);
    if (!versionValidation.success) {
      errors.push(versionValidation.error);
    } else if (versionValidation.warning) {
      warnings.push(versionValidation.warning);
    }
  }

  // Workspace validation
  if (payload.workspace) {
    const workspaceValidation = validateWorkspaceConfig(payload.workspace);
    if (!workspaceValidation.success) {
      errors.push(`Workspace validation failed: ${workspaceValidation.error}`);
    }
  }

  // Sources validation
  if (payload.sources && Array.isArray(payload.sources)) {
    payload.sources.forEach((source, index) => {
      const sourceValidation = validateSource(source);
      if (!sourceValidation.success) {
        errors.push(`Source ${index + 1} validation failed: ${sourceValidation.error}`);
      }
    });
  }

  // Proxy rules validation
  if (payload.proxyRules && Array.isArray(payload.proxyRules)) {
    payload.proxyRules.forEach((rule, index) => {
      const ruleValidation = validateProxyRule(rule);
      if (!ruleValidation.success) {
        errors.push(`Proxy rule ${index + 1} validation failed: ${ruleValidation.error}`);
      }
    });
  }

  // Environment schema validation
  if (payload.environmentSchema) {
    const schemaValidation = validateEnvironmentSchema(payload.environmentSchema);
    if (!schemaValidation.success) {
      errors.push(`Environment schema validation failed: ${schemaValidation.error}`);
    }
  }

  if (errors.length > 0) {
    return {
      success: false,
      error: errors.join('; '),
      warnings
    };
  }

  return {
    success: true,
    warnings
  };
}