/**
 * Environment Variable Validation Utilities
 * Provides functions for detecting, extracting, and validating environment variables
 */

const { createLogger } = require('../error-handling/logger');
const log = createLogger('EnvironmentVariableValidation');

/**
 * Regular expression to match environment variables in the format {{VAR_NAME}}
 */
const ENV_VAR_PATTERN = /\{\{([^}]+)\}\}/g;

/**
 * Extract all environment variable names from a text string
 * @param {string} text - Text to extract variables from
 * @returns {Array<string>} Array of variable names (without the {{ }})
 */
export function extractEnvironmentVariables(text) {
    if (!text || typeof text !== 'string') {
        return [];
    }

    const variables = [];
    const matches = text.matchAll(ENV_VAR_PATTERN);
    
    for (const match of matches) {
        const varName = match[1].trim();
        if (varName && !variables.includes(varName)) {
            variables.push(varName);
        }
    }
    
    return variables;
}

/**
 * Check if a text contains environment variables
 * @param {string} text - Text to check
 * @returns {boolean} True if contains environment variables
 */
export function hasEnvironmentVariables(text) {
    if (!text || typeof text !== 'string') {
        return false;
    }
    
    return ENV_VAR_PATTERN.test(text);
}

/**
 * Extract environment variables from all fields of a header rule
 * @param {Object} rule - Header rule object
 * @returns {Array<string>} Array of all variable names used in the rule
 */
export function extractVariablesFromRule(rule) {
    const variables = [];
    
    // Check header name
    if (rule.headerName) {
        variables.push(...extractEnvironmentVariables(rule.headerName));
    }
    
    // Check header value (for static values)
    if (!rule.isDynamic && rule.headerValue) {
        variables.push(...extractEnvironmentVariables(rule.headerValue));
    }
    
    // Check prefix and suffix (for dynamic values)
    if (rule.isDynamic) {
        if (rule.prefix) {
            variables.push(...extractEnvironmentVariables(rule.prefix));
        }
        if (rule.suffix) {
            variables.push(...extractEnvironmentVariables(rule.suffix));
        }
    }
    
    // Check domains
    if (Array.isArray(rule.domains)) {
        rule.domains.forEach(domain => {
            variables.push(...extractEnvironmentVariables(domain));
        });
    }
    
    // Remove duplicates
    return [...new Set(variables)];
}

/**
 * Check which environment variables are missing
 * @param {Array<string>} requiredVars - Variable names required
 * @param {Object} availableVars - Available variables object
 * @returns {Array<string>} Array of missing variable names
 */
export function findMissingVariables(requiredVars, availableVars) {
    if (!Array.isArray(requiredVars) || !availableVars) {
        return requiredVars || [];
    }
    
    return requiredVars.filter(varName => {
        // Check if variable exists and has a non-empty value
        const value = availableVars[varName];
        return value === undefined || value === null || value === '';
    });
}

/**
 * Validate environment variables in a text and return validation result
 * @param {string} text - Text to validate
 * @param {Object} availableVars - Available variables object
 * @returns {Object} Validation result { isValid, missingVars, usedVars }
 */
export function validateEnvironmentVariables(text, availableVars) {
    const usedVars = extractEnvironmentVariables(text);
    const missingVars = findMissingVariables(usedVars, availableVars);
    
    return {
        isValid: missingVars.length === 0,
        missingVars,
        usedVars,
        hasVars: usedVars.length > 0
    };
}

/**
 * Validate all environment variables in a header rule
 * @param {Object} rule - Header rule to validate
 * @param {Object} availableVars - Available variables object
 * @returns {Object} Validation result with details for each field
 */
export function validateRuleEnvironmentVariables(rule, availableVars) {
    const results = {
        isValid: true,
        missingVars: [],
        fieldValidation: {},
        totalVarsUsed: 0
    };
    
    // Validate header name
    if (rule.headerName) {
        const validation = validateEnvironmentVariables(rule.headerName, availableVars);
        results.fieldValidation.headerName = validation;
        results.missingVars.push(...validation.missingVars);
        results.totalVarsUsed += validation.usedVars.length;
    }
    
    // Validate header value (for static values)
    if (!rule.isDynamic && rule.headerValue) {
        const validation = validateEnvironmentVariables(rule.headerValue, availableVars);
        results.fieldValidation.headerValue = validation;
        results.missingVars.push(...validation.missingVars);
        results.totalVarsUsed += validation.usedVars.length;
    }
    
    // Validate prefix and suffix (for dynamic values)
    if (rule.isDynamic) {
        if (rule.prefix) {
            const validation = validateEnvironmentVariables(rule.prefix, availableVars);
            results.fieldValidation.prefix = validation;
            results.missingVars.push(...validation.missingVars);
            results.totalVarsUsed += validation.usedVars.length;
        }
        if (rule.suffix) {
            const validation = validateEnvironmentVariables(rule.suffix, availableVars);
            results.fieldValidation.suffix = validation;
            results.missingVars.push(...validation.missingVars);
            results.totalVarsUsed += validation.usedVars.length;
        }
    }
    
    // Validate domains
    if (Array.isArray(rule.domains)) {
        results.fieldValidation.domains = [];
        rule.domains.forEach((domain, index) => {
            const validation = validateEnvironmentVariables(domain, availableVars);
            results.fieldValidation.domains[index] = validation;
            results.missingVars.push(...validation.missingVars);
            results.totalVarsUsed += validation.usedVars.length;
        });
    }
    
    // Remove duplicates from missing vars
    results.missingVars = [...new Set(results.missingVars)];
    results.isValid = results.missingVars.length === 0;
    
    return results;
}

/**
 * Resolve environment variables in a text string
 * @param {string} text - Text with environment variables
 * @param {Object} variables - Variables object
 * @param {Object} options - Resolution options
 * @returns {string} Text with variables resolved
 */
export function resolveEnvironmentVariables(text, variables, options = {}) {
    if (!text || typeof text !== 'string') {
        return text;
    }
    
    const { keepUnresolved = false, placeholderPrefix = '[MISSING_VAR:' } = options;
    
    return text.replace(ENV_VAR_PATTERN, (match, varName) => {
        const trimmedVarName = varName.trim();
        const value = variables[trimmedVarName];
        
        if (value !== undefined && value !== null && value !== '') {
            return value;
        }
        
        // Handle missing variables
        if (keepUnresolved) {
            return match; // Keep the {{VAR}} syntax
        }
        
        // Return placeholder for missing variables
        return `${placeholderPrefix}${trimmedVarName}]`;
    });
}

/**
 * Resolve all environment variables in a header rule
 * @param {Object} rule - Header rule to resolve
 * @param {Object} variables - Variables object
 * @param {Object} options - Resolution options
 * @returns {Object} Rule with resolved variables
 */
export function resolveRuleEnvironmentVariables(rule, variables, options = {}) {
    const resolvedRule = { ...rule };
    
    // Resolve header name
    if (rule.headerName) {
        resolvedRule.headerName = resolveEnvironmentVariables(rule.headerName, variables, options);
    }
    
    // Resolve header value (for static values)
    if (!rule.isDynamic && rule.headerValue) {
        resolvedRule.headerValue = resolveEnvironmentVariables(rule.headerValue, variables, options);
    }
    
    // Resolve prefix and suffix (for dynamic values)
    if (rule.isDynamic) {
        if (rule.prefix) {
            resolvedRule.prefix = resolveEnvironmentVariables(rule.prefix, variables, options);
        }
        if (rule.suffix) {
            resolvedRule.suffix = resolveEnvironmentVariables(rule.suffix, variables, options);
        }
    }
    
    // Resolve domains
    if (Array.isArray(rule.domains)) {
        resolvedRule.domains = rule.domains.map(domain => 
            resolveEnvironmentVariables(domain, variables, options)
        );
    }
    
    return resolvedRule;
}

/**
 * Check if a rule should be applied based on environment variable availability
 * @param {Object} rule - Header rule to check
 * @param {Object} availableVars - Available variables object
 * @returns {Object} Result { shouldApply, reason, missingVars }
 */
export function checkRuleActivation(rule, availableVars) {
    // Skip disabled rules
    if (!rule.isEnabled) {
        return {
            shouldApply: false,
            reason: 'Rule is disabled',
            missingVars: []
        };
    }
    
    // Validate environment variables
    const validation = validateRuleEnvironmentVariables(rule, availableVars);
    
    if (!validation.isValid) {
        return {
            shouldApply: false,
            reason: 'Missing environment variables',
            missingVars: validation.missingVars,
            activationState: 'waiting_for_deps'
        };
    }
    
    return {
        shouldApply: true,
        reason: 'All dependencies satisfied',
        missingVars: [],
        activationState: 'active'
    };
}

/**
 * Format missing variables for display
 * @param {Array<string>} missingVars - Array of missing variable names
 * @returns {string} Formatted string for display
 */
export function formatMissingVariables(missingVars) {
    if (!missingVars || missingVars.length === 0) {
        return '';
    }
    
    if (missingVars.length === 1) {
        return `Missing variable: {{${missingVars[0]}}}`;
    }
    
    return `Missing variables: ${missingVars.map(v => `{{${v}}}`).join(', ')}`;
}

/**
 * Get a preview of resolved text with indicators for missing variables
 * @param {string} text - Text with environment variables
 * @param {Object} variables - Available variables
 * @returns {Object} Preview object { text, hasMissing, missingCount }
 */
export function getResolvedPreview(text, variables) {
    if (!text) {
        return { text: '', hasMissing: false, missingCount: 0 };
    }
    
    const usedVars = extractEnvironmentVariables(text);
    const missingVars = findMissingVariables(usedVars, variables);
    
    // Resolve with placeholders for missing vars
    const resolved = resolveEnvironmentVariables(text, variables, {
        keepUnresolved: false,
        placeholderPrefix: '[MISSING:'
    });
    
    return {
        text: resolved,
        hasMissing: missingVars.length > 0,
        missingCount: missingVars.length,
        missingVars
    };
}