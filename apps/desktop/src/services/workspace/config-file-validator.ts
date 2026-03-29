/**
 * ConfigFileValidator - Validates OpenHeaders configuration files
 * Ensures configuration files meet the required schema and constraints
 */

import fs from 'fs';
import path from 'path';
import mainLogger from '../../utils/mainLogger';
import type { JsonObject } from '../../types/common';

const { createLogger } = mainLogger;
const log = createLogger('ConfigFileValidator');

import { DATA_FORMAT_VERSION } from '../../config/version';

// Type definitions
interface FieldDefinition {
  type: string;
  required: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

interface SchemaDefinition {
  [field: string]: FieldDefinition;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
  validatedFiles?: Array<{
    type: string;
    path: string;
    relativePath: string;
  }>;
}

interface ConfigPaths {
  [type: string]: string | undefined;
}

type ConfigContent = JsonObject;

interface MetadataOptions {
  workspaceId?: string;
  workspaceName?: string;
}

// Configuration schemas
const SCHEMAS: Record<string, SchemaDefinition> = {
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
   */
  async validateAll(configPaths: ConfigPaths, repoDir: string): Promise<ValidationResult> {
    const result: ValidationResult = {
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
          result.validatedFiles!.push({
            type,
            path: filePath,
            relativePath: path.relative(repoDir, filePath)
          });
        } else {
          result.valid = false;
          result.errors.push(...validation.errors.map(err => `${type}: ${err}`));
        }

        if (validation.warnings) {
          result.warnings!.push(...validation.warnings.map(warn => `${type}: ${warn}`));
        }

      } catch (error: unknown) {
        result.valid = false;
        const errMsg = error instanceof Error ? error.message : String(error);
        result.errors.push(`${type}: Failed to validate - ${errMsg}`);
      }
    }

    return result;
  }

  /**
   * Validate a single configuration file
   */
  async validateFile(filePath: string, type: string): Promise<ValidationResult> {
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
          errors: [],
          warnings: [`No schema defined for type: ${type}`]
        };
      }

      // Validate against schema
      return this.validateAgainstSchema(content, schema, type);

    } catch (error: unknown) {
      log.error(`Failed to validate ${type} file:`, error);
      const errMsg = error instanceof Error ? error.message : String(error);
      return {
        valid: false,
        errors: [errMsg]
      };
    }
  }

  /**
   * Validate content against schema
   */
  validateAgainstSchema(content: ConfigContent, schema: SchemaDefinition, type: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required fields
    for (const [field, definition] of Object.entries(schema)) {
      if (definition.required && !Object.prototype.hasOwnProperty.call(content, field)) {
        errors.push(`Missing required field: ${field}`);
        continue;
      }

      if (Object.prototype.hasOwnProperty.call(content, field)) {
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
   */
  validateField(field: string, value: unknown, definition: FieldDefinition): string[] {
    const errors: string[] = [];

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
   */
  validateTypeSpecific(content: ConfigContent, type: string): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    switch (type) {
      case 'headers':
        if (Array.isArray(content.headers)) {
          for (const [index, header] of content.headers.entries()) {
            const h = header as JsonObject | null;
            if (!h || typeof h !== 'object') continue;
            if (!h.name) {
              errors.push(`Header at index ${index} missing 'name' field`);
            }
            if (!h.value && h.value !== '') {
              errors.push(`Header at index ${index} missing 'value' field`);
            }
          }
        }
        break;

      case 'environments':
        if (Array.isArray(content.environments)) {
          const names = new Set<string>();
          for (const [index, env] of content.environments.entries()) {
            const e = env as JsonObject | null;
            if (!e || typeof e !== 'object') continue;
            const envName = typeof e.name === 'string' ? e.name : '';
            if (!envName) {
              errors.push(`Environment at index ${index} missing 'name' field`);
            } else if (names.has(envName)) {
              errors.push(`Duplicate environment name: ${envName}`);
            } else {
              names.add(envName);
            }
          }
        }
        break;

      case 'proxy':
        if (Array.isArray(content.rules)) {
          for (const [index, rule] of content.rules.entries()) {
            const r = rule as JsonObject | null;
            if (!r || typeof r !== 'object') continue;
            if (!r.pattern && !r.url) {
              errors.push(`Proxy rule at index ${index} must have either 'pattern' or 'url'`);
            }
            if (!r.target) {
              errors.push(`Proxy rule at index ${index} missing 'target' field`);
            }
          }
        }
        break;

      case 'metadata': {
        const workspaceId = typeof content.workspaceId === 'string' ? content.workspaceId : '';
        const version = typeof content.version === 'string' ? content.version : '';
        if (workspaceId && !/^[a-zA-Z0-9-_]+$/.test(workspaceId)) {
          errors.push('Invalid workspaceId format');
        }
        if (version && !/^\d+\.\d+\.\d+$/.test(version)) {
          warnings.push('Version should follow semver format (e.g., 1.0.0)');
        }
        break;
      }
    }

    return { errors, warnings };
  }

  /**
   * Load JSON file
   */
  async loadJson(filePath: string): Promise<ConfigContent | null> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf8');
      return JSON.parse(content) as ConfigContent;
    } catch (error: unknown) {
      if (error instanceof SyntaxError) {
        log.error(`Invalid JSON in ${filePath}:`, error);
        return null;
      }
      throw error;
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Create default configuration
   */
  createDefaultConfig(type: string, metadata: MetadataOptions = {}): ConfigContent {
    const defaults: Record<string, ConfigContent> = {
      headers: {
        version: DATA_FORMAT_VERSION,
        headers: []
      },
      environments: {
        version: DATA_FORMAT_VERSION,
        environments: []
      },
      proxy: {
        version: DATA_FORMAT_VERSION,
        rules: []
      },
      rules: {
        version: DATA_FORMAT_VERSION,
        rules: []
      },
      metadata: {
        workspaceId: metadata.workspaceId || 'default',
        workspaceName: metadata.workspaceName || 'Default Workspace',
        version: DATA_FORMAT_VERSION,
        createdAt: new Date().toISOString(),
        configPaths: {}
      }
    };

    return defaults[type] || { version: DATA_FORMAT_VERSION };
  }

  /**
   * Merge configurations
   */
  mergeConfigs(base: ConfigContent | null, override: ConfigContent | null, type: string): ConfigContent {
    if (!base || !override) {
      return base || override || this.createDefaultConfig(type);
    }

    const merged: ConfigContent = { ...base };

    // Version from override takes precedence
    if (override.version) {
      merged.version = override.version;
    }

    // Type-specific merging
    switch (type) {
      case 'headers':
        if (Array.isArray(override.headers)) {
          const baseHeaders = Array.isArray(base.headers) ? base.headers : [];
          merged.headers = [...baseHeaders, ...override.headers];
        }
        break;

      case 'rules':
        if (Array.isArray(override.rules)) {
          const baseRules = Array.isArray(base.rules) ? base.rules : [];
          merged.rules = [...baseRules, ...override.rules];
        }
        break;

      case 'environments':
        if (Array.isArray(override.environments)) {
          const envMap = new Map<string, JsonObject>();
          const baseEnvs = Array.isArray(base.environments) ? base.environments : [];
          for (const env of baseEnvs) {
            const e = env as JsonObject | null;
            if (e && typeof e.name === 'string') envMap.set(e.name, e);
          }
          for (const env of override.environments) {
            const e = env as JsonObject | null;
            if (e && typeof e.name === 'string') envMap.set(e.name, e);
          }
          merged.environments = Array.from(envMap.values());
        }
        break;

      case 'proxy':
        if (Array.isArray(override.rules)) {
          merged.rules = override.rules;
        }
        break;

      case 'metadata': {
        const baseConfigPaths = typeof base.configPaths === 'object' && base.configPaths && !Array.isArray(base.configPaths) ? base.configPaths : {};
        const overrideConfigPaths = typeof override.configPaths === 'object' && override.configPaths && !Array.isArray(override.configPaths) ? override.configPaths : {};
        merged.configPaths = { ...baseConfigPaths, ...overrideConfigPaths };
        break;
      }
    }

    return merged;
  }
}

export { ConfigFileValidator, ValidationResult, ConfigPaths, ConfigContent, SCHEMAS };
export default ConfigFileValidator;
