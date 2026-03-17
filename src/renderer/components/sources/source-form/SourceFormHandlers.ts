/**
 * Source Form Handlers
 * 
 * Event handlers and business logic for source form operations including
 * form submission, field changes, file browsing, and HTTP testing.
 * 
 * Handler Categories:
 * - Form submission with comprehensive validation
 * - Source type change handling with state cleanup
 * - File selection and browsing for file sources
 * - TOTP state management and tracking
 * - Test response handling for HTTP sources
 * 
 * Handler Features:
 * - Comprehensive error handling with user feedback
 * - State cleanup and form reset on type changes
 * - Integration with external services (file system, TOTP)
 * - Loading state management for async operations
 * 
 * @module SourceFormHandlers
 * @since 3.0.0
 */

import { showMessage } from '../../../utils/ui/messageUtil';
import { validateAllHttpFields } from './SourceFormValidation';

/**
 * Creates source type change handler
 * 
 * Factory function that creates a handler for source type changes with
 * proper state cleanup and form field reset.
 * 
 * @param {Object} params - Handler parameters
 * @param {Function} params.setSourceType - Source type state setter
 * @param {Function} params.setFilePath - File path state setter
 * @param {Function} params.setTotpEnabled - TOTP enabled state setter
 * @param {Function} params.setTotpSecret - TOTP secret state setter
 * @param {Function} params.untrackTotpSecret - TOTP untracking function
 * @param {Object} params.form - Form instance
 * @param {string} params.testSourceId - Test source ID for TOTP tracking
 * @returns {Function} Source type change handler
 */
export const createSourceTypeChangeHandler = ({
    setSourceType,
    setFilePath,
    setTotpEnabled,
    setTotpSecret,
    untrackTotpSecret,
    form,
    testSourceId
}) => (value) => {
    // Update source type state
    setSourceType(value);
    
    // Reset related state
    setFilePath('');
    
    // Reset form fields that are specific to source type
    form.resetFields(['sourcePath', 'sourceTag']);
    
    // Reset TOTP state when switching away from HTTP
    if (value !== 'http') {
        setTotpEnabled(false);
        setTotpSecret('');
        // Untrack the TOTP source
        untrackTotpSecret(testSourceId);
    }
};

/**
 * Creates file browse handler
 * 
 * Factory function that creates a handler for file browsing operations
 * with error handling and form field updates.
 * 
 * @param {Object} params - Handler parameters
 * @param {Object} params.fileSystem - File system service
 * @param {Function} params.setFilePath - File path state setter
 * @param {Object} params.form - Form instance
 * @returns {Function} File browse handler
 */
export const createFileBrowseHandler = ({
    fileSystem,
    setFilePath,
    form
}) => async () => {
    try {
        // Open file selection dialog
        const selectedPath = await fileSystem.selectFile();
        if (selectedPath) {
            // Update state and form field
            setFilePath(selectedPath);
            form.setFieldsValue({ sourcePath: selectedPath });
        }
    } catch (error) {
        showMessage('error', `Failed to select file: ${error.message}`);
    }
};

/**
 * Creates TOTP change handler
 * 
 * Factory function that creates a handler for TOTP configuration changes
 * from the HttpOptions component.
 * 
 * @param {Object} params - Handler parameters
 * @param {Function} params.setTotpEnabled - TOTP enabled state setter
 * @param {Function} params.setTotpSecret - TOTP secret state setter
 * @returns {Function} TOTP change handler
 */
export const createTotpChangeHandler = ({
    setTotpEnabled,
    setTotpSecret
}) => (enabled, secret) => {
    setTotpEnabled(enabled);
    setTotpSecret(secret);
};

/**
 * Creates test response handler
 * 
 * Factory function that creates a handler for HTTP test responses
 * with basic logging for debugging purposes.
 * 
 * @returns {Function} Test response handler
 */
export const createTestResponseHandler = () => (response) => {
    // Test response is handled by HttpOptions component
    // This callback exists for potential future use and debugging
    console.debug('Test response received:', response);
};

/**
 * Creates form submission handler
 * 
 * Factory function that creates a comprehensive form submission handler
 * with validation, data preparation, and error handling.
 * 
 * @param {Object} params - Handler parameters
 * @param {Function} params.setSubmitting - Submitting state setter
 * @param {Object} params.form - Form instance
 * @param {Object} params.envContext - Environment context
 * @param {Function} params.onAddSource - Source addition callback
 * @param {Function} params.untrackTotpSecret - TOTP untracking function
 * @param {string} params.testSourceId - Test source ID for TOTP tracking
 * @param {Object} params.refs - Ref objects for form components
 * @param {Object} params.stateSetters - State setter functions
 * @param {Object} params.log - Logger instance
 * @returns {Function} Form submission handler
 */
export const createFormSubmissionHandler = ({
    setSubmitting,
    form,
    envContext,
    onAddSource,
    untrackTotpSecret,
    testSourceId,
    refs,
    stateSetters,
    log
}) => async (values) => {
    try {
        setSubmitting(true);

        // Check if JSON filter is enabled but missing a path
        if (values.jsonFilter?.enabled && !values.jsonFilter?.path) {
            form.setFields([{
                name: ['jsonFilter', 'path'],
                errors: ['JSON path is required when filter is enabled']
            }]);
            showMessage('error', 'JSON filter is enabled but no path is specified');
            setSubmitting(false);
            return;
        }
        
        // For HTTP sources, validate all fields that might contain template variables
        if (values.sourceType === 'http') {
            const validationError = validateAllHttpFields(form, values, envContext);
            if (validationError) {
                showMessage('error', validationError.message);
                setSubmitting(false);
                return;
            }
        }

        // Prepare source data with type-specific processing
        const sourceData = prepareSourceData(values, form, log);

        // Call parent handler to add source
        const success = await onAddSource(sourceData);

        if (success) {
            // Clean up and reset form on successful submission
            await handleSuccessfulSubmission({
                untrackTotpSecret,
                testSourceId,
                form,
                refs,
                stateSetters
            });
        }
    } catch (error) {
        showMessage('error', `Failed to add source: ${error.message}`);
    } finally {
        setSubmitting(false);
    }
};

/**
 * Prepares source data for submission
 * 
 * Transforms form values into the appropriate source data structure
 * with type-specific processing and data validation.
 * 
 * @param {Object} values - Form values
 * @param {Object} form - Form instance
 * @param {Object} log - Logger instance
 * @returns {Object} Prepared source data
 */
const prepareSourceData = (values, form, log) => {
    // Prepare basic source data
    const sourceData = {
        sourceType: values.sourceType,
        sourcePath: values.sourcePath,
        sourceTag: values.sourceTag || ''
    };

    // Add HTTP-specific properties
    if (values.sourceType === 'http') {
        sourceData.sourceMethod = values.sourceMethod || 'GET';

        // Make a deep copy of request options to avoid reference issues
        sourceData.requestOptions = JSON.parse(JSON.stringify(values.requestOptions || {}));
        
        // Ensure TOTP secret is preserved from form if not already present
        if (!sourceData.requestOptions.totpSecret) {
            const formRequestOptions = form.getFieldValue('requestOptions');
            if (formRequestOptions?.totpSecret) {
                sourceData.requestOptions.totpSecret = formRequestOptions.totpSecret;
                log.debug('[SourceForm] Added TOTP secret from form requestOptions');
            }
        }

        // Ensure required arrays are initialized
        if (!sourceData.requestOptions.headers) {
            sourceData.requestOptions.headers = [];
        }

        if (!sourceData.requestOptions.queryParams) {
            sourceData.requestOptions.queryParams = [];
        }

        // Add form-specific configurations
        sourceData.jsonFilter = values.jsonFilter || { enabled: false, path: '' };
        sourceData.refreshOptions = values.refreshOptions || { interval: 0 };

        // Mark source as needing initial fetch
        sourceData.needsInitialFetch = true;

        // Ensure URL has protocol
        if (!sourceData.sourcePath.match(/^https?:\/\//i)) {
            sourceData.sourcePath = 'https://' + sourceData.sourcePath;
        }
    }

    return sourceData;
};

/**
 * Handles successful form submission cleanup
 * 
 * Performs cleanup operations after successful source addition including
 * form reset, state cleanup, and component resets.
 * 
 * @param {Object} params - Cleanup parameters
 * @param {Function} params.untrackTotpSecret - TOTP untracking function
 * @param {string} params.testSourceId - Test source ID
 * @param {Object} params.form - Form instance
 * @param {Object} params.refs - Component refs
 * @param {Object} params.stateSetters - State setter functions
 */
const handleSuccessfulSubmission = async ({
    untrackTotpSecret,
    testSourceId,
    form,
    refs,
    stateSetters
}) => {
    // Untrack TOTP source before resetting
    untrackTotpSecret(testSourceId);
    
    // Reset form and state
    form.resetFields();
    stateSetters.setFilePath('');
    stateSetters.setTotpEnabled(false);
    stateSetters.setTotpSecret('');
    
    // Reset source type to default
    stateSetters.setSourceType('file');
    
    // Force reset HttpOptions if it exists
    if (refs.httpOptionsRef.current && refs.httpOptionsRef.current.forceTotpState) {
        refs.httpOptionsRef.current.forceTotpState(false, '');
    }
    
    // Generate new temporary sourceId for next use
    refs.tempSourceIdRef.current = `new-source-${Date.now()}`;
};