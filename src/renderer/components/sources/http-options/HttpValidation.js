/**
 * HTTP Options Validation
 * 
 * Validation utilities for HTTP request fields including environment variable
 * validation, TOTP placeholder validation, and comprehensive field checking.
 * 
 * Validation Features:
 * - Environment variable pattern validation ({{VAR}} format)
 * - TOTP code placeholder validation ([[TOTP_CODE]] format)
 * - Cross-field validation for TOTP configuration
 * - Real-time environment context integration
 * 
 * Validation Categories:
 * - URL field validation with template variable support
 * - HTTP headers validation with environment and TOTP checking
 * - Query parameters validation with variable substitution
 * - Request body validation for POST/PUT/PATCH requests
 * - JSON filter path validation
 * 
 * @module HttpValidation
 * @since 3.0.0
 */

import { createLogger } from '../../../utils/error-handling/logger';

const log = createLogger('HttpValidation');

/**
 * Validates if environment variables and TOTP placeholders exist and are properly configured
 * 
 * Comprehensive validation function that checks for environment variable patterns
 * and TOTP code placeholders, ensuring all referenced variables exist in the
 * current environment and TOTP is properly configured when needed.
 * 
 * @param {string} value - The value to validate (URL, header value, etc.)
 * @param {Object} envContext - Environment context for variable resolution
 * @param {Object} form - Form instance for TOTP secret checking
 * @returns {Object} Validation result with valid boolean and error message
 * 
 * @example
 * const result = validateVariableExists('{{API_KEY}}', envContext, form);
 * if (!result.valid) {
 *   console.error(result.error);
 * }
 */
export const validateVariableExists = (value, envContext, form) => {
    if (!value) return { valid: true };
    
    // Skip validation if environments aren't ready yet
    if (!envContext.environmentsReady) {
        return { valid: true };
    }
    
    // Check for TOTP code pattern [[TOTP_CODE]]
    if (value.includes('[[TOTP_CODE]]')) {
        // Get current TOTP settings from form
        const requestOptions = form.getFieldValue('requestOptions') || {};
        const totpSecret = requestOptions.totpSecret;
        
        if (!totpSecret || totpSecret === 'none' || totpSecret.trim() === '') {
            return {
                valid: false,
                error: 'TOTP code placeholder [[TOTP_CODE]] is used but no TOTP secret is configured. Please enable TOTP and provide a secret.'
            };
        }
    }
    
    // Check for environment variable pattern {{VAR}}
    const envVarMatches = value.match(/{{([^}]+)}}/g);
    if (envVarMatches) {
        // Get fresh environment data by calling getAllVariables() without params
        // This ensures we always get the current active environment
        const currentEnvVars = envContext.getAllVariables();
        const currentActiveEnv = envContext.activeEnvironment;
        
        for (const match of envVarMatches) {
            const varName = match.slice(2, -2).trim();
            if (!currentEnvVars[varName]) {
                return { 
                    valid: false, 
                    error: `Environment variable "${varName}" is not defined in the current environment "${currentActiveEnv}"`
                };
            }
        }
    }
    
    return { valid: true };
};

/**
 * Resolves environment variables in a text string
 * 
 * Utility function that resolves environment variable placeholders in text
 * using the environment context. Returns the original text if environments
 * aren't ready or no variables are found.
 * 
 * @param {string} text - Text containing environment variable placeholders
 * @param {Object} envContext - Environment context for variable resolution
 * @returns {string} Text with resolved environment variables
 * 
 * @example
 * const resolved = resolveAllVariables('{{BASE_URL}}/api/v1', envContext);
 * // Returns: "https://api.example.com/api/v1"
 */
export const resolveAllVariables = (text, envContext) => {
    if (!text) return text;
    
    // If environments aren't ready, return text as-is
    if (!envContext.environmentsReady) {
        return text;
    }
    
    // Resolve environment variables
    return envContext.resolveTemplate(text);
};

/**
 * Validates URL field with environment and TOTP support
 * 
 * Specialized validation function for URL fields that checks for proper
 * environment variable configuration and TOTP secret setup when placeholders
 * are used in the URL.
 * 
 * @param {Object} rule - Ant Design validation rule
 * @param {string} value - URL value to validate
 * @param {Object} envContext - Environment context
 * @param {Object} form - Form instance
 * @returns {Promise} Validation promise (resolves or rejects with error)
 * 
 * @example
 * // In form validation rules
 * rules: [
 *   { validator: (rule, value) => validateUrlField(rule, value, envContext, form) }
 * ]
 */
export const validateUrlField = (rule, value, envContext, form) => {
    if (!value) return Promise.resolve();
    
    const result = validateVariableExists(value, envContext, form);
    if (!result.valid) {
        return Promise.reject(new Error(result.error));
    }
    
    return Promise.resolve();
};

/**
 * Validates HTTP headers for environment variables and TOTP placeholders
 * 
 * Validates an array of HTTP headers, checking each header value for
 * environment variable patterns and TOTP placeholders.
 * 
 * @param {Array} headers - Array of header objects with key/value pairs
 * @param {Object} envContext - Environment context
 * @param {Object} form - Form instance
 * @returns {Object} Validation result with valid boolean and error details
 * 
 * @example
 * const headers = [
 *   { key: 'Authorization', value: 'Bearer {{API_TOKEN}}' },
 *   { key: 'X-TOTP', value: '[[TOTP_CODE]]' }
 * ];
 * const result = validateHttpHeaders(headers, envContext, form);
 */
export const validateHttpHeaders = (headers, envContext, form) => {
    if (!Array.isArray(headers)) return { valid: true };
    
    for (const [index, header] of headers.entries()) {
        if (header && header.value) {
            const result = validateVariableExists(header.value, envContext, form);
            if (!result.valid) {
                return {
                    valid: false,
                    error: `Header "${header.key || `#${index + 1}`}": ${result.error}`,
                    fieldPath: ['requestOptions', 'headers', index, 'value']
                };
            }
        }
    }
    
    return { valid: true };
};

/**
 * Validates query parameters for environment variables and TOTP placeholders
 * 
 * Validates an array of query parameters, checking each parameter value for
 * environment variable patterns and TOTP placeholders.
 * 
 * @param {Array} queryParams - Array of query parameter objects
 * @param {Object} envContext - Environment context
 * @param {Object} form - Form instance
 * @returns {Object} Validation result with valid boolean and error details
 * 
 * @example
 * const queryParams = [
 *   { key: 'api_key', value: '{{API_KEY}}' },
 *   { key: 'timestamp', value: '{{TIMESTAMP}}' }
 * ];
 * const result = validateQueryParameters(queryParams, envContext, form);
 */
export const validateQueryParameters = (queryParams, envContext, form) => {
    if (!Array.isArray(queryParams)) return { valid: true };
    
    for (const [index, param] of queryParams.entries()) {
        if (param && param.value) {
            const result = validateVariableExists(param.value, envContext, form);
            if (!result.valid) {
                return {
                    valid: false,
                    error: `Query param "${param.key || `#${index + 1}`}": ${result.error}`,
                    fieldPath: ['requestOptions', 'queryParams', index, 'value']
                };
            }
        }
    }
    
    return { valid: true };
};

/**
 * Validates request body for environment variables and TOTP placeholders
 * 
 * Validates the request body content for environment variable patterns
 * and TOTP placeholders, typically used for POST/PUT/PATCH requests.
 * 
 * @param {string} body - Request body content
 * @param {Object} envContext - Environment context
 * @param {Object} form - Form instance
 * @returns {Object} Validation result with valid boolean and error details
 * 
 * @example
 * const body = '{"token": "{{API_TOKEN}}", "code": "[[TOTP_CODE]]"}';
 * const result = validateRequestBody(body, envContext, form);
 */
export const validateRequestBody = (body, envContext, form) => {
    if (!body) return { valid: true };
    
    const result = validateVariableExists(body, envContext, form);
    if (!result.valid) {
        return {
            valid: false,
            error: `Request body: ${result.error}`,
            fieldPath: ['requestOptions', 'body']
        };
    }
    
    return { valid: true };
};

/**
 * Validates JSON filter path for environment variables
 * 
 * Validates the JSON filter path for environment variable patterns,
 * ensuring all referenced variables exist in the current environment.
 * 
 * @param {string} path - JSON filter path
 * @param {Object} envContext - Environment context
 * @param {Object} form - Form instance
 * @returns {Object} Validation result with valid boolean and error details
 * 
 * @example
 * const result = validateJsonFilterPath('{{ROOT_PATH}}.data.items', envContext, form);
 */
export const validateJsonFilterPath = (path, envContext, form) => {
    if (!path) return { valid: true };
    
    const result = validateVariableExists(path, envContext, form);
    if (!result.valid) {
        return {
            valid: false,
            error: `JSON filter path: ${result.error}`,
            fieldPath: ['jsonFilter', 'path']
        };
    }
    
    return { valid: true };
};

/**
 * Validates all HTTP-related fields for environment variables and TOTP
 * 
 * Comprehensive validation function that checks all HTTP request fields
 * including headers, query parameters, body, and JSON filter path for
 * proper environment variable and TOTP configuration.
 * 
 * @param {Object} form - Form instance
 * @param {Object} values - Form values to validate
 * @param {Object} envContext - Environment context
 * @returns {Object|null} Validation error object or null if valid
 * 
 * @example
 * const error = validateAllHttpFields(form, formValues, envContext);
 * if (error) {
 *   showMessage('error', error.message);
 *   return;
 * }
 */
export const validateAllHttpFields = (form, values, envContext) => {
    // Validate headers
    const headers = form.getFieldValue(['requestOptions', 'headers']);
    if (headers && headers.length > 0) {
        const headerResult = validateHttpHeaders(headers, envContext, form);
        if (!headerResult.valid) {
            return { message: headerResult.error };
        }
    }
    
    // Validate query params
    const queryParams = form.getFieldValue(['requestOptions', 'queryParams']);
    if (queryParams && queryParams.length > 0) {
        const queryResult = validateQueryParameters(queryParams, envContext, form);
        if (!queryResult.valid) {
            return { message: queryResult.error };
        }
    }
    
    // Validate body
    const body = form.getFieldValue(['requestOptions', 'body']);
    if (body) {
        const bodyResult = validateRequestBody(body, envContext, form);
        if (!bodyResult.valid) {
            return { message: bodyResult.error };
        }
    }
    
    // Validate JSON filter path if enabled
    const jsonFilter = form.getFieldValue('jsonFilter');
    if (jsonFilter?.enabled && jsonFilter?.path) {
        const pathResult = validateJsonFilterPath(jsonFilter.path, envContext, form);
        if (!pathResult.valid) {
            return { message: pathResult.error };
        }
    }
    
    return null; // All validations passed
};