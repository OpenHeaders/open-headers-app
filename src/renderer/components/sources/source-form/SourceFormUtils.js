/**
 * Source Form Utils
 * 
 * Utility functions and helpers for source form operations including
 * scroll handling, form state management, and configuration helpers.
 * 
 * Utility Categories:
 * - Scroll event handling for sticky header behavior
 * - Form validation trigger utilities
 * - Environment change effect handlers
 * - TOTP tracking and management helpers
 * 
 * @module SourceFormUtils
 * @since 3.0.0
 */

/**
 * Creates scroll event handler for sticky header behavior
 * 
 * Factory function that creates a scroll event handler to determine
 * when the form header should become sticky based on scroll position.
 * 
 * @param {Object} params - Handler parameters
 * @param {React.RefObject} params.formCardRef - Form card ref for position detection
 * @param {Function} params.setIsSticky - Sticky state setter
 * @param {boolean} params.isSticky - Current sticky state
 * @param {number} params.headerHeight - App header height in pixels (default: 64)
 * @returns {Function} Scroll event handler
 * 
 * @example
 * const handleScroll = createScrollHandler({
 *   formCardRef,
 *   setIsSticky,
 *   isSticky,
 *   headerHeight: 64
 * });
 */
export const createScrollHandler = ({
    formCardRef,
    setIsSticky,
    isSticky,
    headerHeight = 64
}) => () => {
    // Skip if form card ref is not available
    if (!formCardRef.current) return;

    // Get current position of form card relative to viewport
    const formCardTop = formCardRef.current.getBoundingClientRect().top;

    // Header should become sticky when the form card reaches the app header
    if (formCardTop <= headerHeight && !isSticky) {
        setIsSticky(true);
    } else if (formCardTop > headerHeight && isSticky) {
        setIsSticky(false);
    }
};

/**
 * Sets up scroll event listener with cleanup
 * 
 * Utility function that sets up scroll event listener with proper
 * cleanup and initial position check.
 * 
 * @param {Function} scrollHandler - Scroll event handler function
 * @returns {Function} Cleanup function for removing event listener
 * 
 * @example
 * useEffect(() => {
 *   const cleanup = setupScrollListener(handleScroll);
 *   return cleanup;
 * }, [handleScroll]);
 */
export const setupScrollListener = (scrollHandler) => {
    // Add scroll event listener
    window.addEventListener('scroll', scrollHandler);

    // Run once to check initial position
    scrollHandler();

    // Return cleanup function
    return () => {
        window.removeEventListener('scroll', scrollHandler);
    };
};

/**
 * Creates environment change effect handler
 * 
 * Factory function that creates a handler for environment changes
 * with form field validation triggering.
 * 
 * @param {Object} params - Handler parameters
 * @param {Object} params.form - Form instance
 * @param {string} params.sourceType - Current source type
 * @param {Object} params.envContext - Environment context
 * @param {React.RefObject} params.httpOptionsRef - HttpOptions component ref
 * @param {Object} params.log - Logger instance
 * @returns {Function} Environment change effect handler
 */
export const createEnvironmentChangeHandler = ({
    form,
    sourceType,
    envContext,
    httpOptionsRef,
    log
}) => () => {
    // Only handle changes for HTTP sources when environments are ready
    if (!form || sourceType !== 'http' || !envContext.environmentsReady) return;
    
    // Small delay to ensure environment state is fully updated
    setTimeout(() => {
        // Get all form values to check for environment variables
        const values = form.getFieldsValue();
        const fieldsToValidate = [];
        
        // Check URL for environment variables or TOTP codes
        if (values.sourcePath && typeof values.sourcePath === 'string' && 
            (values.sourcePath.includes('{{') || values.sourcePath.includes('[['))) {
            fieldsToValidate.push('sourcePath');
        }
        
        // Validate fields that contain variables
        if (fieldsToValidate.length > 0) {
            log.debug('[SourceForm] Re-validating URL field after environment change');
            form.validateFields(fieldsToValidate).catch(() => {
                // Ignore validation errors, we just want to update the UI
            });
        }
        
        // Always trigger HttpOptions validation if it exists
        // HttpOptions will check its own fields for variables
        if (httpOptionsRef.current?.validateFields) {
            log.debug('[SourceForm] Triggering HttpOptions validation after environment change');
            httpOptionsRef.current.validateFields();
        }
    }, 100);
};

/**
 * Creates TOTP tracking effect handler
 * 
 * Factory function that creates a handler for TOTP tracking lifecycle
 * with proper cleanup on component unmount.
 * 
 * @param {Object} params - Handler parameters
 * @param {boolean} params.totpEnabled - TOTP enabled state
 * @param {string} params.totpSecret - TOTP secret value
 * @param {Function} params.trackTotpSecret - TOTP tracking function
 * @param {Function} params.untrackTotpSecret - TOTP untracking function
 * @param {string} params.testSourceId - Test source ID for tracking
 * @returns {Function} TOTP tracking effect handler with cleanup
 */
export const createTotpTrackingHandler = ({
    totpEnabled,
    totpSecret,
    trackTotpSecret,
    untrackTotpSecret,
    testSourceId
}) => () => {
    // Track TOTP source when enabled and secret is available
    if (totpEnabled && totpSecret) {
        trackTotpSecret(testSourceId);
    }
    
    // Return cleanup function for component unmount
    return () => {
        untrackTotpSecret(testSourceId);
    };
};

/**
 * Gets form initial values
 * 
 * Utility function that returns the initial values for the form
 * with sensible defaults for all source types.
 * 
 * @returns {Object} Initial form values
 * 
 * @example
 * const initialValues = getFormInitialValues();
 * // Returns: { sourceType: 'file', sourceMethod: 'GET', ... }
 */
export const getFormInitialValues = () => ({
    sourceType: 'file',
    sourceMethod: 'GET',
    requestOptions: {
        contentType: 'application/json'
    }
});

/**
 * Validates fields containing template variables
 * 
 * Utility function that checks if form fields contain template variables
 * and returns a list of fields that need validation.
 * 
 * @param {Object} values - Form values to check
 * @returns {string[]} Array of field names that contain template variables
 * 
 * @example
 * const fields = getFieldsWithTemplateVariables(formValues);
 * // Returns: ['sourcePath', 'headers.0.value']
 */
export const getFieldsWithTemplateVariables = (values) => {
    const fieldsToValidate = [];
    
    // Check URL for environment variables or TOTP codes
    if (values.sourcePath && typeof values.sourcePath === 'string' && 
        (values.sourcePath.includes('{{') || values.sourcePath.includes('[['))) {
        fieldsToValidate.push('sourcePath');
    }
    
    return fieldsToValidate;
};

/**
 * Generates temporary source ID
 * 
 * Utility function that generates a unique temporary source ID
 * for new sources before they are saved.
 * 
 * @param {string} prefix - Prefix for the ID (default: 'new-source')
 * @returns {string} Generated temporary source ID
 * 
 * @example
 * const tempId = generateTempSourceId(); 
 * // Returns: "new-source-1640995200000"
 * const testId = generateTempSourceId('test'); 
 * // Returns: "test-1640995200000"
 */
export const generateTempSourceId = (prefix = 'new-source') => {
    return `${prefix}-${Date.now()}`;
};

/**
 * Creates test source ID from temporary source ID
 * 
 * Utility function that creates a test-specific source ID for
 * TOTP tracking during HTTP testing operations.
 * 
 * @param {string} tempSourceId - Temporary source ID
 * @returns {string} Test source ID with test prefix
 * 
 * @example
 * const testId = createTestSourceId('new-source-123');
 * // Returns: "test-new-source-123"
 */
export const createTestSourceId = (tempSourceId) => {
    return `test-${tempSourceId}`;
};

/**
 * Debounces validation function calls
 * 
 * Utility function that debounces validation calls to prevent
 * excessive validation during rapid user input.
 * 
 * @param {Function} validationFn - Validation function to debounce
 * @param {number} delay - Debounce delay in milliseconds (default: 300)
 * @returns {Function} Debounced validation function
 * 
 * @example
 * const debouncedValidation = debounceValidation(validateField, 500);
 * debouncedValidation(fieldValue);
 */
export const debounceValidation = (validationFn, delay = 300) => {
    let timeoutId;
    
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            validationFn(...args);
        }, delay);
    };
};