/**
 * HTTP Options Utilities
 * 
 * Utility functions and helpers for HTTP options including TOTP code generation,
 * environment change effects, form field validation triggers, and component
 * lifecycle management.
 * 
 * Utility Categories:
 * - TOTP code generation and timer management
 * - Environment change effect handlers
 * - Form field validation triggers
 * - Component state helpers and ref management
 * - Imperative handle method factories
 * 
 * TOTP Features:
 * - Secure TOTP code generation with time-based validation
 * - Automatic code regeneration with 30-second periods
 * - Time remaining calculation and countdown display
 * - Error handling for invalid secrets and generation failures
 * 
 * @module HttpUtils
 * @since 3.0.0
 */

import { createLogger } from '../../../utils/error-handling/logger';
import { showMessage } from '../../../utils/ui/messageUtil';
import { validateVariableExists } from './HttpValidation';
import timeManager from '../../../services/TimeManager';

const log = createLogger('HttpUtils');

/**
 * Creates TOTP state management from form values
 * 
 * Factory function that creates a helper to get TOTP state from form,
 * providing a single source of truth for TOTP configuration.
 * 
 * @param {Object} form - Form instance
 * @returns {Function} Function that returns current TOTP state from form
 * 
 * @example
 * const getTotpStateFromForm = createTotpStateHelper(form);
 * const { enabled, secret } = getTotpStateFromForm();
 */
export const createTotpStateHelper = (form) => () => {
    const formEnabled = form.getFieldValue('enableTOTP');
    const formSecret = form.getFieldValue('totpSecret');
    const requestOptionsTotpSecret = form.getFieldValue(['requestOptions', 'totpSecret']);
    
    const secret = formSecret || requestOptionsTotpSecret || '';
    const enabled = Boolean(formEnabled && secret);
    
    return { enabled, secret };
};

/**
 * Creates TOTP toggle handler
 * 
 * Factory function that creates a handler for TOTP enable/disable
 * toggle with proper form field synchronization.
 * 
 * @param {Object} params - Handler parameters
 * @param {Function} params.setTotpPreviewVisible - TOTP preview visibility setter
 * @param {Function} params.setTotpError - TOTP error state setter
 * @param {Object} params.form - Form instance
 * @returns {Function} TOTP toggle handler
 */
export const createTotpToggleHandler = ({
    setTotpPreviewVisible,
    setTotpError,
    form
}) => (checked) => {
    setTotpPreviewVisible(false);
    setTotpError(null);

    // Update form values - form is source of truth
    form.setFieldsValue({ enableTOTP: checked });

    // Update requestOptions to match
    const currentRequestOptions = form.getFieldValue('requestOptions') || {};
    const currentSecret = form.getFieldValue('totpSecret');
    
    const updatedRequestOptions = {
        headers: currentRequestOptions.headers || [],
        queryParams: currentRequestOptions.queryParams || [],
        contentType: currentRequestOptions.contentType || 'application/json',
        body: currentRequestOptions.body || '',
        ...currentRequestOptions
    };

    if (checked && currentSecret) {
        // Add secret to requestOptions if enabled and secret exists
        updatedRequestOptions.totpSecret = currentSecret;
    } else if (!checked && updatedRequestOptions.totpSecret) {
        // Remove secret from requestOptions if disabled
        delete updatedRequestOptions.totpSecret;
    }
    
    form.setFieldsValue({ requestOptions: updatedRequestOptions });
};

/**
 * Creates TOTP secret change handler
 * 
 * Factory function that creates a handler for TOTP secret field changes
 * with form synchronization and requestOptions updates.
 * 
 * @param {Object} params - Handler parameters
 * @param {Function} params.setTotpPreviewVisible - TOTP preview visibility setter
 * @param {Function} params.setTotpError - TOTP error state setter
 * @param {Object} params.form - Form instance
 * @returns {Function} TOTP secret change handler
 */
export const createTotpSecretHandler = ({
    setTotpPreviewVisible,
    setTotpError,
    form
}) => (e) => {
    const newSecret = e.target.value;
    setTotpPreviewVisible(false);
    setTotpError(null);

    // Update form values - form is source of truth
    form.setFieldsValue({ totpSecret: newSecret });

    // Update requestOptions if TOTP is enabled
    const isEnabled = form.getFieldValue('enableTOTP');
    if (isEnabled) {
        const currentRequestOptions = form.getFieldValue('requestOptions') || {};
        
        const updatedRequestOptions = {
            headers: currentRequestOptions.headers || [],
            queryParams: currentRequestOptions.queryParams || [],
            contentType: currentRequestOptions.contentType || 'application/json',
            body: currentRequestOptions.body || '',
            ...currentRequestOptions
        };

        if (newSecret) {
            updatedRequestOptions.totpSecret = newSecret;
        } else if (updatedRequestOptions.totpSecret) {
            delete updatedRequestOptions.totpSecret;
        }
        
        form.setFieldsValue({ requestOptions: updatedRequestOptions });
    }
};

/**
 * Creates TOTP code generator
 * 
 * Factory function that creates a TOTP code generator with proper
 * error handling and environment variable resolution.
 * 
 * @param {Object} params - Generator parameters
 * @param {Function} params.getTotpStateFromForm - Function to get TOTP state
 * @param {Function} params.resolveAllVariables - Function to resolve variables
 * @param {Function} params.setTotpError - TOTP error state setter
 * @param {Function} params.setTotpTesting - TOTP testing state setter
 * @param {Function} params.setTotpCode - TOTP code state setter
 * @returns {Function} Async TOTP code generator
 */
export const createTotpCodeGenerator = ({
    getTotpStateFromForm,
    resolveAllVariables,
    setTotpError,
    setTotpTesting,
    setTotpCode
}) => async () => {
    try {
        const { secret } = getTotpStateFromForm();
        
        if (!secret) {
            setTotpError('Please enter a secret key');
            return;
        }

        setTotpError(null);
        setTotpTesting(true);

        // Resolve any variables in the secret first
        const resolvedSecret = resolveAllVariables(secret);

        // Normalize secret for better compatibility
        const normalizedSecret = resolvedSecret.replace(/\s/g, '').replace(/=/g, '');


        // Use the window.generateTOTP function
        const totpCode = await window.generateTOTP(normalizedSecret, 30, 6, 0);

        if (totpCode === 'ERROR') {
            setTotpError('Failed to generate code. Check your secret key.');
            setTotpCode('ERROR');
        } else {
            setTotpCode(totpCode);
        }
    } catch (error) {
        log.error('Error generating TOTP:', error);
        setTotpError(`Error: ${error.message}`);
        setTotpCode('ERROR');
    } finally {
        setTotpTesting(false);
    }
};

/**
 * Creates TOTP test handler
 * 
 * Factory function that creates a handler for testing TOTP code generation
 * with validation and preview display.
 * 
 * @param {Object} params - Handler parameters
 * @param {Function} params.getTotpStateFromForm - Function to get TOTP state
 * @param {Function} params.validateVariableExists - Variable validation function
 * @param {Function} params.setTotpError - TOTP error state setter
 * @param {Function} params.setTotpCode - TOTP code state setter
 * @param {Function} params.setTotpPreviewVisible - TOTP preview visibility setter
 * @param {Function} params.generateTotpCode - TOTP code generator function
 * @returns {Function} Async TOTP test handler
 */
export const createTotpTestHandler = ({
    getTotpStateFromForm,
    validateVariableExists,
    setTotpError,
    setTotpCode,
    setTotpPreviewVisible,
    generateTotpCode
}) => async () => {
    const { secret } = getTotpStateFromForm();
    
    if (!secret) {
        setTotpError('Please enter a secret key');
        setTotpCode('NO SECRET');
        return;
    }
    
    // Validate if the secret contains variables that exist
    const validation = validateVariableExists(secret);
    if (!validation.valid) {
        showMessage('error', validation.error);
        setTotpError(validation.error);
        setTotpCode('VAR ERROR');
        return;
    }

    setTotpPreviewVisible(true);
    await generateTotpCode();
};

/**
 * Creates TOTP timer effect
 * 
 * Factory function that creates a TOTP timer effect for automatic
 * code regeneration and countdown display.
 * 
 * @param {Object} params - Timer parameters
 * @param {boolean} params.totpPreviewVisible - TOTP preview visibility state
 * @param {Function} params.setTimeRemaining - Time remaining state setter
 * @param {Function} params.generateTotpCode - TOTP code generator function
 * @returns {Function} Effect function with cleanup
 */
export const createTotpTimerEffect = ({
    totpPreviewVisible,
    setTimeRemaining,
    generateTotpCode
}) => () => {
    if (!totpPreviewVisible) return;

    // Function to calculate time remaining in current period
    const calculateTimeRemaining = () => {
        const secondsInPeriod = 30;
        const currentSeconds = Math.floor(timeManager.now() / 1000);
        return secondsInPeriod - (currentSeconds % secondsInPeriod);
    };

    // Track the last period to avoid multiple regenerations
    let lastPeriod = Math.floor(timeManager.now() / 1000 / 30);

    // Initial timer setup
    setTimeRemaining(calculateTimeRemaining());

    // Set up interval for countdown and code regeneration
    const timer = setInterval(() => {
        const remaining = calculateTimeRemaining();
        setTimeRemaining(remaining);
        
        // Check if we've entered a new 30-second period
        const currentPeriod = Math.floor(timeManager.now() / 1000 / 30);
        if (currentPeriod !== lastPeriod) {
            lastPeriod = currentPeriod;
            void generateTotpCode();
        }
    }, 100); // Update every 100ms for smoother countdown

    return () => clearInterval(timer);
};

/**
 * Creates TOTP tracking effect
 * 
 * Factory function that creates an effect for TOTP source tracking
 * with proper cleanup on component unmount.
 * 
 * @param {Object} params - Tracking parameters
 * @param {Function} params.getTotpStateFromForm - Function to get TOTP state
 * @param {string} params.testSourceId - Test source ID for tracking
 * @param {Function} params.trackTotpSecret - TOTP tracking function
 * @param {Function} params.untrackTotpSecret - TOTP untracking function
 * @returns {Function} Effect function with cleanup
 */
export const createTotpTrackingEffect = ({
    getTotpStateFromForm,
    testSourceId,
    trackTotpSecret,
    untrackTotpSecret
}) => () => {
    const { enabled, secret } = getTotpStateFromForm();
    
    if (enabled && secret && testSourceId) {
        trackTotpSecret(testSourceId);
    }
    
    // Cleanup on unmount
    return () => {
        if (testSourceId) {
            untrackTotpSecret(testSourceId);
        }
    };
};

/**
 * Creates environment change effect handler
 * 
 * Factory function that creates a handler for environment changes
 * with automatic field re-validation for fields containing variables.
 * 
 * @param {Object} params - Handler parameters
 * @param {Object} params.form - Form instance
 * @param {Object} params.envContext - Environment context
 * @param {Object} params.isFormInitializedRef - Form initialization ref
 * @returns {Function} Environment change effect handler
 */
export const createEnvironmentChangeEffect = ({
    form,
    envContext,
    isFormInitializedRef
}) => () => {
    // Only validate if environments are ready and form is initialized
    if (!envContext.environmentsReady || !isFormInitializedRef.current || !form) return;


    // Small delay to ensure environment state is fully updated
    const timer = setTimeout(() => {
        const fieldsToValidate = [];
        
        // Check headers
        const headers = form.getFieldValue(['requestOptions', 'headers']);
        if (Array.isArray(headers)) {
            headers.forEach((header, index) => {
                if (header && header.value && typeof header.value === 'string' && 
                    (header.value.includes('{{') || header.value.includes('[['))) {
                    fieldsToValidate.push(['requestOptions', 'headers', index, 'value']);
                }
            });
        }
        
        // Check query params
        const queryParams = form.getFieldValue(['requestOptions', 'queryParams']);
        if (Array.isArray(queryParams)) {
            queryParams.forEach((param, index) => {
                if (param && param.value && typeof param.value === 'string' && 
                    (param.value.includes('{{') || param.value.includes('[['))) {
                    fieldsToValidate.push(['requestOptions', 'queryParams', index, 'value']);
                }
            });
        }
        
        // Check body
        const body = form.getFieldValue(['requestOptions', 'body']);
        if (body && typeof body === 'string' && 
            (body.includes('{{') || body.includes('[['))) {
            fieldsToValidate.push(['requestOptions', 'body']);
        }
        
        // Re-validate all fields that contain variables
        if (fieldsToValidate.length > 0) {
            form.validateFields(fieldsToValidate)
                .then(() => {
                    // Re-validation completed successfully
                })
                .catch((errorInfo) => {
                    // Re-validation found errors
                });
        }
    }, 100);

    return () => clearTimeout(timer);
};

/**
 * Creates imperative handle methods factory
 * 
 * Factory function that creates imperative handle methods for external
 * component interaction and state management.
 * 
 * @param {Object} params - Handle parameters
 * @param {Object} params.form - Form instance
 * @param {Function} params.getTotpStateFromForm - Function to get TOTP state
 * @param {Object} params.isFormInitializedRef - Form initialization ref
 * @returns {Object} Imperative handle methods
 */
export const createImperativeHandleMethods = ({
    form,
    getTotpStateFromForm,
    isFormInitializedRef
}) => ({
    // Method to force TOTP state directly
    forceTotpState: (enabled, secret) => {

        // Update form values - form is the single source of truth
        form.setFieldsValue({
            enableTOTP: enabled,
            totpSecret: secret || ''
        });

        // Always update requestOptions to match
        const currentRequestOptions = form.getFieldValue('requestOptions') || {};
        
        const updatedRequestOptions = {
            headers: currentRequestOptions.headers || [],
            queryParams: currentRequestOptions.queryParams || [],
            contentType: currentRequestOptions.contentType || 'application/json',
            body: currentRequestOptions.body || '',
            ...currentRequestOptions
        };

        if (enabled && secret) {
            updatedRequestOptions.totpSecret = secret;
        } else if (updatedRequestOptions.totpSecret) {
            delete updatedRequestOptions.totpSecret;
        }
        
        form.setFieldsValue({ requestOptions: updatedRequestOptions });

        return true;
    },

    // Simplified getTotpState using form as source of truth
    getTotpState: () => {
        const state = getTotpStateFromForm();
        return state;
    },

    // Method to force headers state
    forceHeadersState: (headers) => {

        // Update form values
        if (Array.isArray(headers) && headers.length > 0) {
            // First set the headers
            form.setFieldValue(['requestOptions', 'headers'], headers);
            
            // Then mark each header value field as touched so validation will run
            headers.forEach((header, index) => {
                if (header?.value && (header.value.includes('{{') || header.value.includes('[['))) {
                    const fieldPath = ['requestOptions', 'headers', index, 'value'];
                    form.setFields([{
                        name: fieldPath,
                        touched: true
                    }]);
                }
            });
        }

        return true;
    },

    // Method to get headers state
    getHeadersState: () => {
        // Get the current headers from the form
        const headers = form.getFieldValue(['requestOptions', 'headers']);
        return Array.isArray(headers) ? headers : [];
    },

    // Method to trigger re-validation of fields with variables
    validateFields: () => {
        if (!isFormInitializedRef.current) {
            return;
        }
        
        // Build list of fields to validate
        const fieldsToValidate = [];
        
        // Check headers
        const headers = form.getFieldValue(['requestOptions', 'headers']);
        if (Array.isArray(headers)) {
            headers.forEach((header, index) => {
                if (header && header.value && typeof header.value === 'string' && 
                    (header.value.includes('{{') || header.value.includes('[['))) {
                    fieldsToValidate.push(['requestOptions', 'headers', index, 'value']);
                }
            });
        }
        
        // Check query params
        const queryParams = form.getFieldValue(['requestOptions', 'queryParams']);
        if (Array.isArray(queryParams)) {
            queryParams.forEach((param, index) => {
                if (param && param.value && typeof param.value === 'string' && 
                    (param.value.includes('{{') || param.value.includes('[['))) {
                    fieldsToValidate.push(['requestOptions', 'queryParams', index, 'value']);
                }
            });
        }
        
        // Check body
        const body = form.getFieldValue(['requestOptions', 'body']);
        if (body && typeof body === 'string' && 
            (body.includes('{{') || body.includes('[['))) {
            fieldsToValidate.push(['requestOptions', 'body']);
        }
        
        // Check JSON filter path
        const jsonFilter = form.getFieldValue('jsonFilter');
        if (jsonFilter?.enabled && jsonFilter?.path && typeof jsonFilter.path === 'string' &&
            (jsonFilter.path.includes('{{') || jsonFilter.path.includes('[['))) {
            fieldsToValidate.push(['jsonFilter', 'path']);
        }
        
        if (fieldsToValidate.length > 0) {
            form.validateFields(fieldsToValidate)
                .then(() => {
                    // Validation passed for all fields
                })
                .catch((errorInfo) => {
                    // Validation errors found
                });
        } else {
        }
    }
});