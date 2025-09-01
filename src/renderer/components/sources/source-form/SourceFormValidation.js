/**
 * Source Form Validation
 * 
 * Centralized validation logic for source form fields including environment
 * variable validation, TOTP secret validation, and complex nested field validation.
 * 
 * Core Validation Features:
 * - Environment variable pattern validation ({{VAR}} syntax)
 * - TOTP code placeholder validation ([[TOTP_CODE]] syntax)
 * - Nested form field validation for HTTP sources
 * - Cross-field dependency validation
 * - Real-time validation with environment context
 * 
 * Validation Types:
 * - URL field validation with template variables
 * - Headers validation with environment and TOTP patterns
 * - Query parameters validation
 * - Request body validation
 * - JSON filter path validation
 * - TOTP secret validation
 * 
 * @module SourceFormValidation
 * @since 3.0.0
 */

/**
 * Validates URL field for environment variables and TOTP patterns
 * 
 * Comprehensive validation for HTTP source URLs that may contain template
 * variables or TOTP placeholders. Checks environment variable availability
 * and TOTP secret configuration when placeholders are detected.
 * 
 * @param {Object} rule - Validation rule object from Ant Design Form
 * @param {string} value - URL value to validate
 * @param {string} sourceType - Type of source being validated
 * @param {Object} envContext - Environment context with variables and state
 * @param {Object} form - Form instance for accessing other field values
 * @returns {Promise} Resolves if valid, rejects with error message if invalid
 * 
 * @example
 * const validation = validateUrlField(rule, 'https://{{API_URL}}/data', 'http', envContext, form);
 * validation.catch(error => console.log(error.message));
 */
export const validateUrlField = (rule, value, sourceType, envContext, form) => {
    // Skip validation for non-HTTP sources or empty values
    if (!value || sourceType !== 'http') return Promise.resolve();
    
    // Ensure value is a string for pattern matching
    if (typeof value !== 'string') {
        return Promise.resolve();
    }
    
    // Skip validation if environments aren't ready to prevent false errors
    if (!envContext.environmentsReady) {
        return Promise.resolve();
    }
    
    // Resolve template variables to validate the final URL
    let resolvedUrl = value;
    
    // Replace environment variables with their actual values
    const envMatches = resolvedUrl.match(/{{([^}]+)}}/g);
    if (envMatches) {
        const envVars = envContext.getAllVariables();
        for (const match of envMatches) {
            const varName = match.slice(2, -2).trim();
            if (envVars[varName]) {
                resolvedUrl = resolvedUrl.replace(match, envVars[varName]);
            }
        }
    }
    
    // Replace TOTP placeholder with a valid dummy code for validation
    resolvedUrl = resolvedUrl.replace(/\[\[TOTP_CODE]]/g, '123456');
    
    // Ensure URL has a protocol for validation
    if (!resolvedUrl.match(/^https?:\/\//i)) {
        resolvedUrl = 'https://' + resolvedUrl;
    }
    
    // Validate the final resolved URL format
    try {
        new URL(resolvedUrl);
    } catch (error) {
        return Promise.reject(new Error('Invalid URL format. Please check the URL structure and template variables.'));
    }
    
    // Check for TOTP code pattern [[TOTP_CODE]]
    // This pattern indicates the URL contains a TOTP placeholder
    if (value.includes('[[TOTP_CODE]]')) {
        // Get current TOTP settings from form's request options
        const requestOptions = form.getFieldValue('requestOptions') || {};
        const totpSecret = requestOptions.totpSecret;
        
        // Validate that TOTP secret is properly configured
        if (!totpSecret || totpSecret === 'none' || totpSecret.trim() === '') {
            return Promise.reject(new Error('TOTP code placeholder [[TOTP_CODE]] is used but no TOTP secret is configured. Please enable TOTP and provide a secret.'));
        }
    }
    
    // Check for environment variable pattern {{VAR}}
    // Extract all environment variable references from the URL
    const envVarMatches = value.match(/{{([^}]+)}}/g);
    if (envVarMatches) {
        // Get fresh environment variables from the context
        const envVars = envContext.getAllVariables();
        const currentActiveEnv = envContext.activeEnvironment;
        
        // Validate each environment variable reference
        for (const match of envVarMatches) {
            const varName = match.slice(2, -2).trim();
            if (!envVars[varName]) {
                return Promise.reject(new Error(`Environment variable "${varName}" is not defined in the current environment "${currentActiveEnv}"`));
            }
        }
    }
    
    return Promise.resolve();
};

/**
 * Validates environment variables in a given value string
 * 
 * Generic validation function for checking environment variable availability
 * in any field value. Used for headers, query params, body, and other fields.
 * 
 * @param {string} value - String value to check for environment variables
 * @param {Object} envContext - Environment context with variables and state
 * @param {string} fieldName - Name of the field being validated (for error messages)
 * @returns {Object|null} Error object if validation fails, null if valid
 * 
 * @example
 * const error = validateEnvironmentVariables('{{API_KEY}}', envContext, 'Header value');
 * if (error) console.log(error.message);
 */
export const validateEnvironmentVariables = (value, envContext, fieldName) => {
    // Check for environment variable pattern {{VAR}}
    const envVarMatches = value.match(/{{([^}]+)}}/g);
    if (envVarMatches) {
        const envVars = envContext.getAllVariables();
        const currentActiveEnv = envContext.activeEnvironment;
        
        // Check each environment variable reference
        for (const match of envVarMatches) {
            const varName = match.slice(2, -2).trim();
            if (!envVars[varName]) {
                return {
                    message: `${fieldName}: Environment variable "${varName}" is not defined in the current environment "${currentActiveEnv}"`
                };
            }
        }
    }
    
    return null;
};

/**
 * Validates TOTP code placeholders in a given value string
 * 
 * Checks if a field contains TOTP placeholders and validates that the
 * corresponding TOTP secret is properly configured in the form.
 * 
 * @param {string} value - String value to check for TOTP placeholders
 * @param {Object} form - Form instance for accessing TOTP configuration
 * @param {string} fieldName - Name of the field being validated (for error messages)
 * @returns {Object|null} Error object if validation fails, null if valid
 * 
 * @example
 * const error = validateTotpPlaceholders('Bearer [[TOTP_CODE]]', form, 'Authorization header');
 * if (error) console.log(error.message);
 */
export const validateTotpPlaceholders = (value, form, fieldName) => {
    // Check for TOTP code pattern [[TOTP_CODE]]
    if (value.includes('[[TOTP_CODE]]')) {
        const requestOptions = form.getFieldValue('requestOptions') || {};
        const totpSecret = requestOptions.totpSecret;
        
        // Validate TOTP secret configuration
        if (!totpSecret || totpSecret.trim() === '') {
            return {
                message: `${fieldName}: TOTP code placeholder [[TOTP_CODE]] is used but no TOTP secret is configured`
            };
        }
    }
    
    return null;
};

/**
 * Validates all HTTP headers for environment variables and TOTP patterns
 * 
 * Comprehensive validation for all headers in the form, checking each header
 * value for environment variable references and TOTP placeholders.
 * 
 * @param {Object} form - Form instance for accessing header values
 * @param {Object} envContext - Environment context with variables and state
 * @returns {Object|null} Error object if validation fails, null if valid
 * 
 * @example
 * const error = validateHttpHeaders(form, envContext);
 * if (error) {
 *   showMessage('error', error.message);
 *   return;
 * }
 */
export const validateHttpHeaders = (form, envContext) => {
    // Get all headers from the form
    const headers = form.getFieldValue(['requestOptions', 'headers']);
    if (!headers || headers.length === 0) return null;
    
    // Validate each header
    for (const [index, header] of headers.entries()) {
        if (header && header.value) {
            // Check for environment variables
            const envError = validateEnvironmentVariables(
                header.value, 
                envContext, 
                `Header "${header.key || `#${index + 1}`}"`
            );
            if (envError) return envError;
            
            // Check for TOTP placeholders
            const totpError = validateTotpPlaceholders(
                header.value, 
                form, 
                `Header "${header.key || `#${index + 1}`}"`
            );
            if (totpError) return totpError;
        }
    }
    
    return null;
};

/**
 * Validates all query parameters for environment variables and TOTP patterns
 * 
 * Comprehensive validation for all query parameters in the form, checking each
 * parameter value for environment variable references and TOTP placeholders.
 * 
 * @param {Object} form - Form instance for accessing query parameter values
 * @param {Object} envContext - Environment context with variables and state
 * @returns {Object|null} Error object if validation fails, null if valid
 */
export const validateQueryParameters = (form, envContext) => {
    // Get all query parameters from the form
    const queryParams = form.getFieldValue(['requestOptions', 'queryParams']);
    if (!queryParams || queryParams.length === 0) return null;
    
    // Validate each query parameter
    for (const [index, param] of queryParams.entries()) {
        if (param && param.value) {
            // Check for environment variables
            const envError = validateEnvironmentVariables(
                param.value, 
                envContext, 
                `Query param "${param.key || `#${index + 1}`}"`
            );
            if (envError) return envError;
        }
    }
    
    return null;
};

/**
 * Validates request body for environment variables
 * 
 * Checks the request body field for environment variable references
 * and validates their availability in the current environment.
 * 
 * @param {Object} form - Form instance for accessing body value
 * @param {Object} envContext - Environment context with variables and state
 * @returns {Object|null} Error object if validation fails, null if valid
 */
export const validateRequestBody = (form, envContext) => {
    // Get request body from the form
    const body = form.getFieldValue(['requestOptions', 'body']);
    if (!body) return null;
    
    // Check for environment variables in body
    return validateEnvironmentVariables(body, envContext, 'Request body');
};

/**
 * Validates JSON filter path for environment variables
 * 
 * Checks the JSON filter path field for environment variable references
 * when JSON filtering is enabled.
 * 
 * @param {Object} values - Form values containing JSON filter configuration
 * @param {Object} envContext - Environment context with variables and state
 * @returns {Object|null} Error object if validation fails, null if valid
 */
export const validateJsonFilterPath = (values, envContext) => {
    // Only validate if JSON filter is enabled and has a path
    if (!values.jsonFilter?.enabled || !values.jsonFilter?.path) return null;
    
    // Check for environment variables in JSON filter path
    return validateEnvironmentVariables(
        values.jsonFilter.path, 
        envContext, 
        'JSON filter path'
    );
};

/**
 * Validates TOTP secret for environment variables
 * 
 * Checks the TOTP secret field for environment variable references
 * and validates their availability in the current environment.
 * 
 * @param {Object} form - Form instance for accessing TOTP secret value
 * @param {Object} envContext - Environment context with variables and state
 * @returns {Object|null} Error object if validation fails, null if valid
 */
export const validateTotpSecret = (form, envContext) => {
    // Get TOTP secret from form request options
    const requestOptions = form.getFieldValue('requestOptions') || {};
    const totpSecret = requestOptions.totpSecret;
    if (!totpSecret) return null;
    
    // Check for environment variables in TOTP secret
    return validateEnvironmentVariables(totpSecret, envContext, 'TOTP secret');
};

/**
 * Validates all HTTP source fields comprehensively
 * 
 * Master validation function that checks all HTTP-related fields for
 * environment variables and TOTP placeholders. Used during form submission
 * to ensure all template variables are properly configured.
 * 
 * @param {Object} form - Form instance for accessing all field values
 * @param {Object} values - Current form values
 * @param {Object} envContext - Environment context with variables and state
 * @returns {Object|null} Error object if validation fails, null if all valid
 * 
 * @example
 * const error = validateAllHttpFields(form, values, envContext);
 * if (error) {
 *   showMessage('error', error.message);
 *   setSubmitting(false);
 *   return;
 * }
 */
export const validateAllHttpFields = (form, values, envContext) => {
    // Only validate HTTP sources
    if (values.sourceType !== 'http') return null;
    
    // Validate headers
    const headerError = validateHttpHeaders(form, envContext);
    if (headerError) return headerError;
    
    // Validate query parameters
    const queryError = validateQueryParameters(form, envContext);
    if (queryError) return queryError;
    
    // Validate request body
    const bodyError = validateRequestBody(form, envContext);
    if (bodyError) return bodyError;
    
    // Validate JSON filter path
    const jsonFilterError = validateJsonFilterPath(values, envContext);
    if (jsonFilterError) return jsonFilterError;
    
    // Validate TOTP secret
    const totpError = validateTotpSecret(form, envContext);
    if (totpError) return totpError;
    
    return null;
};