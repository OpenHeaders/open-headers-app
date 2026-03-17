/**
 * TemplateResolver - Resolves variable templates in strings
 */
const { createLogger } = require('../../utils/error-handling/logger');
const log = createLogger('TemplateResolver');

class TemplateResolver {
  constructor() {
    // Match {{variable}} pattern
    this.variablePattern = /\{\{(\w+)\}\}/g;
  }

  /**
   * Resolve template with variables
   */
  resolveTemplate(template, variables, options = {}) {
    if (!template || typeof template !== 'string') {
      return template;
    }

    const { 
      defaultValue = '', 
      throwOnMissing = false,
      logMissing = true 
    } = options;
    
    const missingVars = [];
    
    const resolved = template.replace(this.variablePattern, (match, varName) => {
      if (variables.hasOwnProperty(varName)) {
        return variables[varName];
      }
      
      missingVars.push(varName);
      
      if (logMissing) {
        log.warn(`Variable '${varName}' not found in template resolution`);
      }
      
      if (throwOnMissing) {
        throw new Error(`Variable '${varName}' not found`);
      }
      
      return defaultValue;
    });
    
    return {
      resolved,
      missingVars,
      hasAllVars: missingVars.length === 0
    };
  }

  /**
   * Extract variable names from a template
   */
  extractVariables(template) {
    if (!template || typeof template !== 'string') {
      return [];
    }

    const variables = new Set();
    let match;
    
    // Reset regex lastIndex
    this.variablePattern.lastIndex = 0;
    
    while ((match = this.variablePattern.exec(template)) !== null) {
      variables.add(match[1]);
    }
    
    return Array.from(variables);
  }

  /**
   * Check if a string contains variables
   */
  hasVariables(template) {
    if (!template || typeof template !== 'string') {
      return false;
    }
    
    // Reset regex lastIndex
    this.variablePattern.lastIndex = 0;
    return this.variablePattern.test(template);
  }

  /**
   * Resolve template in an object recursively
   */
  resolveObject(obj, variables, options = {}) {
    if (!obj || typeof obj !== 'object') {
      return this.resolveTemplate(obj, variables, options);
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.resolveObject(item, variables, options));
    }

    const resolved = {};
    const allMissingVars = [];

    Object.entries(obj).forEach(([key, value]) => {
      if (typeof value === 'string') {
        const result = this.resolveTemplate(value, variables, options);
        resolved[key] = typeof result === 'string' ? result : result.resolved;
        if (result.missingVars) {
          allMissingVars.push(...result.missingVars);
        }
      } else if (typeof value === 'object') {
        resolved[key] = this.resolveObject(value, variables, options);
      } else {
        resolved[key] = value;
      }
    });

    return resolved;
  }

  /**
   * Validate that all required variables are present
   */
  validateVariables(template, variables) {
    const required = this.extractVariables(template);
    const missing = required.filter(varName => !variables.hasOwnProperty(varName));
    
    return {
      isValid: missing.length === 0,
      missing,
      required
    };
  }

  /**
   * Create a resolver function with pre-bound variables
   */
  createResolver(variables, options = {}) {
    return (template) => this.resolveTemplate(template, variables, options);
  }
}

module.exports = TemplateResolver;