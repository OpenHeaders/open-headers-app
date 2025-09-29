const { createLogger } = require('../../../utils/error-handling/logger');
const log = createLogger('FormValidation');

/**
 * Validates environment variables in a value string
 * @param {string} value - The value to validate
 * @param {Object} envContext - Environment context for variable validation
 * @returns {Promise<void>} - Resolves if valid, rejects with error message if invalid
 */
const validateEnvironmentVariables = (value, envContext) => {
    if (!value || typeof value !== 'string') return Promise.resolve();
    
    // Skip validation if environments aren't ready yet
    if (!envContext.environmentsReady) {
        log.debug('Environments not ready, skipping validation');
        return Promise.resolve();
    }
    
    // Check for environment variable pattern {{VAR}}
    const envVarMatches = value.match(/{{([^}]+)}}/g);
    if (envVarMatches) {
        // Get fresh environment variables from the context
        const envVars = envContext.getAllVariables();
        const currentActiveEnv = envContext.activeEnvironment;
        
        log.debug('Checking env vars:', {
            matches: envVarMatches,
            activeEnv: currentActiveEnv,
            availableVars: Object.keys(envVars)
        });
        
        for (const match of envVarMatches) {
            const varName = match.slice(2, -2).trim();
            if (!envVars[varName]) {
                log.debug(`Variable "${varName}" not found in environment "${currentActiveEnv}"`);
                return Promise.reject(new Error(`Environment variable "${varName}" is not defined in the current environment "${currentActiveEnv}"`));
            }
        }
    }
    
    return Promise.resolve();
};

/**
 * Validates TOTP code placeholders in a value string
 * @param {string} value - The value to validate
 * @param {Object} form - Ant Design form instance
 * @returns {Promise<void>} - Resolves if valid, rejects with error message if invalid
 */
const validateTotpCodePlaceholder = (value, form) => {
    if (!value || typeof value !== 'string') return Promise.resolve();
    
    // Check for TOTP code pattern [[TOTP_CODE]]
    if (value.includes('[[TOTP_CODE]]')) {
        // Get current TOTP settings from form
        const totpSecret = form.getFieldValue('totpSecret');
        const enableTOTP = form.getFieldValue('enableTOTP');
        
        if (!enableTOTP || !totpSecret || totpSecret.trim() === '') {
            return Promise.reject(new Error('TOTP code placeholder [[TOTP_CODE]] is used but no TOTP secret is configured. Please enable TOTP and provide a secret.'));
        }
    }
    
    return Promise.resolve();
};

/**
 * Validates headers for environment variables and TOTP codes
 * @param {Array} headers - Array of header objects
 * @param {Object} envContext - Environment context for variable validation
 * @param {string} fieldName - Name of the field being validated (for error messages)
 * @returns {Promise<void>} - Resolves if valid, rejects with error message if invalid
 */
const validateHeadersForVariables = (headers, envContext, fieldName = 'Header') => {
    if (!headers || !Array.isArray(headers)) return Promise.resolve();
    
    for (const [index, header] of headers.entries()) {
        if (header && header.value) {
            // Check for environment variables
            const envVarMatches = header.value.match(/{{([^}]+)}}/g);
            if (envVarMatches) {
                const envVars = envContext.getAllVariables();
                const currentActiveEnv = envContext.activeEnvironment;
                
                for (const match of envVarMatches) {
                    const varName = match.slice(2, -2).trim();
                    if (!envVars[varName]) {
                        return Promise.reject(new Error(`${fieldName} "${header.key || `#${index + 1}`}": Environment variable "${varName}" is not defined in the current environment "${currentActiveEnv}"`));
                    }
                }
            }
            
            // Check for TOTP code
            if (header.value.includes('[[TOTP_CODE]]')) {
                return Promise.reject(new Error(`${fieldName} "${header.key || `#${index + 1}`}": TOTP code placeholder [[TOTP_CODE]] is used but validation should be done at form level`));
            }
        }
    }
    
    return Promise.resolve();
};

/**
 * Validates query parameters for environment variables
 * @param {Array} queryParams - Array of query parameter objects
 * @param {Object} envContext - Environment context for variable validation
 * @returns {Promise<void>} - Resolves if valid, rejects with error message if invalid
 */
const validateQueryParamsForVariables = (queryParams, envContext) => {
    if (!queryParams || !Array.isArray(queryParams)) return Promise.resolve();
    
    for (const [index, param] of queryParams.entries()) {
        if (param && param.value) {
            // Check for environment variables
            const envVarMatches = param.value.match(/{{([^}]+)}}/g);
            if (envVarMatches) {
                const envVars = envContext.getAllVariables();
                const currentActiveEnv = envContext.activeEnvironment;
                
                for (const match of envVarMatches) {
                    const varName = match.slice(2, -2).trim();
                    if (!envVars[varName]) {
                        return Promise.reject(new Error(`Query param "${param.key || `#${index + 1}`}": Environment variable "${varName}" is not defined in the current environment "${currentActiveEnv}"`));
                    }
                }
            }
        }
    }
    
    return Promise.resolve();
};

/**
 * Validates request body for environment variables
 * @param {string} body - Request body content
 * @param {Object} envContext - Environment context for variable validation
 * @returns {Promise<void>} - Resolves if valid, rejects with error message if invalid
 */
const validateBodyForVariables = (body, envContext) => {
    if (!body) return Promise.resolve();
    
    const envVarMatches = body.match(/{{([^}]+)}}/g);
    if (envVarMatches) {
        const envVars = envContext.getAllVariables();
        const currentActiveEnv = envContext.activeEnvironment;
        
        for (const match of envVarMatches) {
            const varName = match.slice(2, -2).trim();
            if (!envVars[varName]) {
                return Promise.reject(new Error(`Request body: Environment variable "${varName}" is not defined in the current environment "${currentActiveEnv}"`));
            }
        }
    }
    
    return Promise.resolve();
};

/**
 * Validates JSON filter path for environment variables
 * @param {Object} jsonFilter - JSON filter object with enabled and path properties
 * @param {Object} envContext - Environment context for variable validation
 * @returns {Promise<void>} - Resolves if valid, rejects with error message if invalid
 */
const validateJsonFilterForVariables = (jsonFilter, envContext) => {
    if (!jsonFilter || !jsonFilter.enabled || !jsonFilter.path) return Promise.resolve();
    
    const envVarMatches = jsonFilter.path.match(/{{([^}]+)}}/g);
    if (envVarMatches) {
        const envVars = envContext.getAllVariables();
        const currentActiveEnv = envContext.activeEnvironment;
        
        for (const match of envVarMatches) {
            const varName = match.slice(2, -2).trim();
            if (!envVars[varName]) {
                return Promise.reject(new Error(`JSON filter path: Environment variable "${varName}" is not defined in the current environment "${currentActiveEnv}"`));
            }
        }
    }
    
    return Promise.resolve();
};

/**
 * Validates TOTP secret for environment variables
 * @param {string} totpSecret - TOTP secret value
 * @param {Object} envContext - Environment context for variable validation
 * @returns {Promise<void>} - Resolves if valid, rejects with error message if invalid
 */
const validateTotpSecretForVariables = (totpSecret, envContext) => {
    if (!totpSecret) return Promise.resolve();
    
    const envVarMatches = totpSecret.match(/{{([^}]+)}}/g);
    if (envVarMatches) {
        const envVars = envContext.getAllVariables();
        const currentActiveEnv = envContext.activeEnvironment;
        
        for (const match of envVarMatches) {
            const varName = match.slice(2, -2).trim();
            if (!envVars[varName]) {
                return Promise.reject(new Error(`TOTP secret: Environment variable "${varName}" is not defined in the current environment "${currentActiveEnv}"`));
            }
        }
    }
    
    return Promise.resolve();
};

/**
 * Comprehensive validation of all form fields for environment variables and TOTP codes
 * @param {Object} form - Ant Design form instance
 * @param {Object} envContext - Environment context for variable validation
 * @returns {Promise<void>} - Resolves if all validations pass, rejects with first error encountered
 */
const validateAllFormFields = async (form, envContext) => {
    // Validate headers
    const headers = form.getFieldValue(['requestOptions', 'headers']);
    await validateHeadersForVariables(headers, envContext);
    
    // Validate query params
    const queryParams = form.getFieldValue(['requestOptions', 'queryParams']);
    await validateQueryParamsForVariables(queryParams, envContext);
    
    // Validate body
    const body = form.getFieldValue(['requestOptions', 'body']);
    await validateBodyForVariables(body, envContext);
    
    // Validate JSON filter path
    const jsonFilter = form.getFieldValue('jsonFilter');
    await validateJsonFilterForVariables(jsonFilter, envContext);
    
    // Validate TOTP secret
    const enableTOTP = form.getFieldValue('enableTOTP');
    const totpSecret = form.getFieldValue('totpSecret');
    if (enableTOTP && totpSecret) {
        await validateTotpSecretForVariables(totpSecret, envContext);
    }
};

module.exports = {
    validateEnvironmentVariables,
    validateTotpCodePlaceholder,
    validateHeadersForVariables,
    validateQueryParamsForVariables,
    validateBodyForVariables,
    validateJsonFilterForVariables,
    validateTotpSecretForVariables,
    validateAllFormFields
};