/**
 * TemplateResolver - Resolves variable templates in strings
 */
import { createLogger } from '../../utils/error-handling/logger';

const log = createLogger('TemplateResolver');

class TemplateResolver {
  variablePattern: RegExp;

  constructor() {
    // Match {{variable}} pattern
    this.variablePattern = /\{\{(\w+)\}\}/g;
  }

  /**
   * Resolve template with variables
   */
  resolveTemplate(
    template: string | null,
    variables: Record<string, string>,
    options: { defaultValue?: string; throwOnMissing?: boolean; logMissing?: boolean } = {},
  ) {
    if (!template || typeof template !== 'string') {
      return template;
    }

    const { defaultValue = '', throwOnMissing = false, logMissing = true } = options;

    const missingVars: string[] = [];

    const resolved = template.replace(this.variablePattern, (_match, varName) => {
      if (Object.hasOwn(variables, varName)) {
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
      hasAllVars: missingVars.length === 0,
    };
  }

  /**
   * Extract variable names from a template
   */
  extractVariables(template: string | null) {
    if (!template || typeof template !== 'string') {
      return [];
    }

    const variables = new Set<string>();
    let match: RegExpExecArray | null;

    // Reset regex lastIndex
    this.variablePattern.lastIndex = 0;

    // biome-ignore lint/suspicious/noAssignInExpressions: idiomatic regex.exec() loop
    while ((match = this.variablePattern.exec(template)) !== null) {
      variables.add(match[1]);
    }

    return Array.from(variables);
  }

  /**
   * Check if a string contains variables
   */
  hasVariables(template: string | null) {
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
  resolveObject(
    obj: unknown,
    variables: Record<string, string>,
    options: { defaultValue?: string; throwOnMissing?: boolean; logMissing?: boolean } = {},
  ): unknown {
    if (!obj || typeof obj !== 'object') {
      return this.resolveTemplate(obj as string, variables, options);
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.resolveObject(item, variables, options));
    }

    const resolved: Record<string, string | unknown> = {};
    const allMissingVars: string[] = [];

    Object.entries(obj).forEach(([key, value]) => {
      if (typeof value === 'string') {
        const result = this.resolveTemplate(value, variables, options);
        if (result === null || typeof result === 'string') {
          resolved[key] = result;
        } else {
          resolved[key] = result.resolved;
        }
        if (result !== null && typeof result !== 'string' && result.missingVars) {
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
  validateVariables(template: string | null, variables: Record<string, string>) {
    const required = this.extractVariables(template);
    const missing = required.filter((varName) => !Object.hasOwn(variables, varName as string));

    return {
      isValid: missing.length === 0,
      missing,
      required,
    };
  }

  /**
   * Create a resolver function with pre-bound variables
   */
  createResolver(
    variables: Record<string, string>,
    options: { defaultValue?: string; throwOnMissing?: boolean; logMissing?: boolean } = {},
  ) {
    return (template: string | null) => this.resolveTemplate(template, variables, options);
  }
}

export default TemplateResolver;
