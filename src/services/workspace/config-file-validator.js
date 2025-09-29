/**
 * ConfigFileValidator - Validates OpenHeaders configuration files
 * Ensures configuration files meet the required schema and constraints
 */

const fs = require('fs').promises;
const path = require('path');
const { createLogger } = require('../../utils/mainLogger');

const log = createLogger('ConfigFileValidator');

// Configuration schemas
const SCHEMAS = {
  headers: {
    version: { type: 'string', required: true },
    headers: { type: 'array', required: true }
  },
  environments: {
    version: { type: 'string', required: true },
    environments: { type: 'array', required: true }
  },
  proxy: {
    version: { type: 'string', required: true },
    rules: { type: 'array', required: true }
  },
  rules: {
    version: { type: 'string', required: true },
    rules: { type: 'array', required: true }
  },
  metadata: {
    workspaceId: { type: 'string', required: true },
    workspaceName: { type: 'string', required: true },
    version: { type: 'string', required: true },
    createdAt: { type: 'string', required: true },
    configPaths: { type: 'object', required: false }
  }
};

class ConfigFileValidator {
  /**
   * Validate all configuration files
   * @param {Object} configPaths - Paths to configuration files
   * @param {string} repoDir - Repository directory
   * @returns {Promise<Object>} - Validation result
   */
  async validateAll(configPaths, repoDir) {
    const result = {
      valid: true,
      errors: [],
      warnings: [],
      validatedFiles: []
    };

    for (const [type, filePath] of Object.entries(configPaths)) {
      if (!filePath) continue;

      try {
        const validation = await this.validateFile(filePath, type);
        
        if (validation.valid) {
          result.validatedFiles.push({
            type,
            path: filePath,
            relativePath: path.relative(repoDir, filePath)
          });
        } else {
          result.valid = false;
          result.errors.push(...validation.errors.map(err => `${type}: ${err}`));
        }

        if (validation.warnings) {
          result.warnings.push(...validation.warnings.map(warn => `${type}: ${warn}`));
        }

      } catch (error) {
        result.valid = false;
        result.errors.push(`${type}: Failed to validate - ${error.message}`);
      }
    }

    return result;
  }

  /**
   * Validate a single configuration file
   * @param {string} filePath - Path to configuration file
   * @param {string} type - Configuration type
   * @returns {Promise<Object>} - Validation result
   */
  async validateFile(filePath, type) {
    try {
      // Check if file exists
      const exists = await this.fileExists(filePath);
      if (!exists) {
        return {
          valid: false,
          errors: [`File not found: ${filePath}`]
        };
      }

      // Load and parse JSON
      const content = await this.loadJson(filePath);
      if (!content) {
        return {
          valid: false,
          errors: ['Invalid JSON format']
        };
      }

      // Get schema for type
      const schema = SCHEMAS[type];
      if (!schema) {
        return {
          valid: true,
          warnings: [`No schema defined for type: ${type}`]
        };
      }

      // Validate against schema
      return this.validateAgainstSchema(content, schema, type);

    } catch (error) {
      log.error(`Failed to validate ${type} file:`, error);
      return {
        valid: false,
        errors: [error.message]
      };
    }
  }

  /**
   * Validate content against schema
   * @param {Object} content - Content to validate
   * @param {Object} schema - Schema definition
   * @param {string} type - Configuration type
   * @returns {Object} - Validation result
   */
  validateAgainstSchema(content, schema, type) {
    const errors = [];
    const warnings = [];

    // Check required fields
    for (const [field, definition] of Object.entries(schema)) {
      if (definition.required && !content.hasOwnProperty(field)) {
        errors.push(`Missing required field: ${field}`);
        continue;
      }

      if (content.hasOwnProperty(field)) {
        const value = content[field];
        const fieldErrors = this.validateField(field, value, definition);
        errors.push(...fieldErrors);
      }
    }

    // Type-specific validation
    const typeValidation = this.validateTypeSpecific(content, type);
    errors.push(...typeValidation.errors);
    warnings.push(...typeValidation.warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate individual field
   * @param {string} field - Field name
   * @param {any} value - Field value
   * @param {Object} definition - Field definition
   * @returns {string[]} - Field errors
   */
  validateField(field, value, definition) {
    const errors = [];

    // Type validation
    if (definition.type) {
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (actualType !== definition.type) {
        errors.push(`Field '${field}' must be of type ${definition.type}, got ${actualType}`);
      }
    }

    // Additional validations
    if (definition.type === 'array' && Array.isArray(value)) {
      if (definition.minLength && value.length < definition.minLength) {
        errors.push(`Field '${field}' must have at least ${definition.minLength} items`);
      }
      if (definition.maxLength && value.length > definition.maxLength) {
        errors.push(`Field '${field}' must have at most ${definition.maxLength} items`);
      }
    }

    if (definition.type === 'string' && typeof value === 'string') {
      if (definition.pattern && !new RegExp(definition.pattern).test(value)) {
        errors.push(`Field '${field}' does not match required pattern`);
      }
      if (definition.minLength && value.length < definition.minLength) {
        errors.push(`Field '${field}' must be at least ${definition.minLength} characters`);
      }
    }

    return errors;
  }

  /**
   * Type-specific validation
   * @param {Object} content - Content to validate
   * @param {string} type - Configuration type
   * @returns {Object} - Validation result
   */
  validateTypeSpecific(content, type) {
    const errors = [];
    const warnings = [];

    switch (type) {
      case 'headers':
        if (content.headers) {
          for (const [index, header] of content.headers.entries()) {
            if (!header.name) {
              errors.push(`Header at index ${index} missing 'name' field`);
            }
            if (!header.value && header.value !== '') {
              errors.push(`Header at index ${index} missing 'value' field`);
            }
          }
        }
        break;

      case 'environments':
        if (content.environments) {
          const names = new Set();
          for (const [index, env] of content.environments.entries()) {
            if (!env.name) {
              errors.push(`Environment at index ${index} missing 'name' field`);
            } else if (names.has(env.name)) {
              errors.push(`Duplicate environment name: ${env.name}`);
            } else {
              names.add(env.name);
            }
          }
        }
        break;

      case 'proxy':
        if (content.rules) {
          for (const [index, rule] of content.rules.entries()) {
            if (!rule.pattern && !rule.url) {
              errors.push(`Proxy rule at index ${index} must have either 'pattern' or 'url'`);
            }
            if (!rule.target) {
              errors.push(`Proxy rule at index ${index} missing 'target' field`);
            }
          }
        }
        break;

      case 'metadata':
        // Validate workspace ID format
        if (content.workspaceId && !/^[a-zA-Z0-9-_]+$/.test(content.workspaceId)) {
          errors.push('Invalid workspaceId format');
        }
        // Validate version format
        if (content.version && !/^\d+\.\d+\.\d+$/.test(content.version)) {
          warnings.push('Version should follow semver format (e.g., 1.0.0)');
        }
        break;
    }

    return { errors, warnings };
  }

  /**
   * Load JSON file
   * @param {string} filePath - Path to JSON file
   * @returns {Promise<Object|null>} - Parsed JSON or null
   */
  async loadJson(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      if (error.name === 'SyntaxError') {
        log.error(`Invalid JSON in ${filePath}:`, error);
        return null;
      }
      throw error;
    }
  }

  /**
   * Check if file exists
   * @param {string} filePath - File path
   * @returns {Promise<boolean>} - Whether file exists
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Create default configuration
   * @param {string} type - Configuration type
   * @param {Object} metadata - Additional metadata
   * @returns {Object} - Default configuration
   */
  createDefaultConfig(type, metadata = {}) {
    const defaults = {
      headers: {
        version: '3.0.0',
        headers: []
      },
      environments: {
        version: '3.0.0',
        environments: []
      },
      proxy: {
        version: '3.0.0',
        rules: []
      },
      rules: {
        version: '3.0.0',
        rules: []
      },
      metadata: {
        workspaceId: metadata.workspaceId || 'default',
        workspaceName: metadata.workspaceName || 'Default Workspace',
        version: '3.0.0',
        createdAt: new Date().toISOString(),
        configPaths: {}
      }
    };

    return defaults[type] || { version: '3.0.0' };
  }

  /**
   * Merge configurations
   * @param {Object} base - Base configuration
   * @param {Object} override - Override configuration
   * @param {string} type - Configuration type
   * @returns {Object} - Merged configuration
   */
  mergeConfigs(base, override, type) {
    if (!base || !override) {
      return base || override || this.createDefaultConfig(type);
    }

    const merged = { ...base };

    // Version from override takes precedence
    if (override.version) {
      merged.version = override.version;
    }

    // Type-specific merging
    switch (type) {
      case 'headers':
      case 'rules':
        // For arrays, concatenate unique items
        if (Array.isArray(override[type])) {
          merged[type] = [...(base[type] || []), ...override[type]];
        }
        break;

      case 'environments':
        // Merge environments by name
        if (Array.isArray(override.environments)) {
          const envMap = new Map();
          (base.environments || []).forEach(env => envMap.set(env.name, env));
          override.environments.forEach(env => envMap.set(env.name, env));
          merged.environments = Array.from(envMap.values());
        }
        break;

      case 'proxy':
        // Replace proxy rules entirely
        if (Array.isArray(override.rules)) {
          merged.rules = override.rules;
        }
        break;

      case 'metadata':
        // Deep merge metadata
        merged.configPaths = {
          ...(base.configPaths || {}),
          ...(override.configPaths || {})
        };
        break;
    }

    return merged;
  }
}

module.exports = ConfigFileValidator;