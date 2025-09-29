/**
 * HTTP Configuration and State Management
 * 
 * Form state management, configuration handlers, and option management for
 * HTTP request settings including refresh options, JSON filtering, and
 * content type handling.
 * 
 * Configuration Features:
 * - Auto-refresh configuration with preset and custom intervals
 * - JSON filter state management with path persistence
 * - Content type handling and form synchronization
 * - Form initialization and structure validation
 * - State persistence across component lifecycle
 * 
 * State Management:
 * - Form field initialization with proper defaults
 * - Ref-based state persistence for complex operations
 * - Cross-component state synchronization
 * - Environment change effects and re-validation
 * 
 * @module HttpConfig
 * @since 3.0.0
 */

import { createLogger } from '../../../utils/error-handling/logger';

const log = createLogger('HttpConfig');

/**
 * Creates content type change handler
 * 
 * Factory function that creates a handler for content type changes
 * with proper form field synchronization.
 * 
 * @param {Object} params - Handler parameters
 * @param {Function} params.setContentType - Content type state setter
 * @param {Object} params.form - Form instance
 * @returns {Function} Content type change handler
 * 
 * @example
 * const handleContentTypeChange = createContentTypeHandler({
 *   setContentType,
 *   form
 * });
 */
export const createContentTypeHandler = ({ setContentType, form }) => (value) => {
    setContentType(value);
    form.setFieldsValue({
        requestOptions: {
            ...form.getFieldValue('requestOptions'),
            contentType: value
        }
    });
};

/**
 * Creates refresh toggle handler
 * 
 * Factory function that creates a handler for refresh enabled/disabled
 * toggle with state persistence and form field updates.
 * 
 * @param {Object} params - Handler parameters
 * @param {Function} params.setRefreshEnabled - Refresh enabled state setter
 * @param {Object} params.refreshEnabledRef - Ref for refresh enabled state
 * @param {Object} params.customIntervalRef - Ref for custom interval
 * @param {Object} params.refreshTypeRef - Ref for refresh type
 * @param {Object} params.form - Form instance
 * @returns {Function} Refresh toggle handler
 * 
 * @example
 * const handleRefreshToggle = createRefreshToggleHandler({
 *   setRefreshEnabled,
 *   refreshEnabledRef,
 *   customIntervalRef,
 *   refreshTypeRef,
 *   form
 * });
 */
export const createRefreshToggleHandler = ({
    setRefreshEnabled,
    refreshEnabledRef,
    customIntervalRef,
    refreshTypeRef,
    form
}) => (checked) => {
    // Update both state and ref
    setRefreshEnabled(checked);
    refreshEnabledRef.current = checked;

    // Get current refresh options from form
    const currentRefreshOptions = form.getFieldValue('refreshOptions') || {};

    // Update form values while preserving existing settings
    form.setFieldsValue({
        refreshOptions: {
            ...currentRefreshOptions,
            enabled: checked,
            // Preserve the existing interval and type even when toggling off
            interval: currentRefreshOptions.interval || customIntervalRef.current,
            type: currentRefreshOptions.type || refreshTypeRef.current
        }
    });

};

/**
 * Creates refresh type change handler
 * 
 * Factory function that creates a handler for refresh type changes
 * (preset vs custom) with proper interval value handling.
 * 
 * @param {Object} params - Handler parameters
 * @param {Function} params.setRefreshType - Refresh type state setter
 * @param {Object} params.refreshTypeRef - Ref for refresh type
 * @param {Function} params.setCustomInterval - Custom interval state setter
 * @param {Object} params.customIntervalRef - Ref for custom interval
 * @param {Object} params.refreshEnabledRef - Ref for refresh enabled state
 * @param {Object} params.form - Form instance
 * @returns {Function} Refresh type change handler
 * 
 * @example
 * const handleRefreshTypeChange = createRefreshTypeHandler({
 *   setRefreshType,
 *   refreshTypeRef,
 *   setCustomInterval,
 *   customIntervalRef,
 *   refreshEnabledRef,
 *   form
 * });
 */
export const createRefreshTypeHandler = ({
    setRefreshType,
    refreshTypeRef,
    setCustomInterval,
    customIntervalRef,
    refreshEnabledRef,
    form
}) => (e) => {
    const newType = e.target.value;
    // Update both state and ref
    setRefreshType(newType);
    refreshTypeRef.current = newType;

    // Get current refresh options to preserve values
    const currentRefreshOptions = form.getFieldValue('refreshOptions') || {};

    // Preserve the enabled flag when switching refresh types
    const isCurrentlyEnabled = currentRefreshOptions.enabled === true || refreshEnabledRef.current === true;

    // If switching to preset, find closest preset value when needed
    let intervalValue = currentRefreshOptions.interval || customIntervalRef.current;

    if (newType === 'preset') {
        const presetValues = [1, 5, 15, 30, 60, 120, 360, 720, 1440];
        if (!presetValues.includes(intervalValue)) {
            // Find the closest preset value
            intervalValue = presetValues.reduce((prev, curr) => {
                return (Math.abs(curr - intervalValue) < Math.abs(prev - intervalValue) ? curr : prev);
            }, presetValues[0]);

            setCustomInterval(intervalValue);
            customIntervalRef.current = intervalValue;
        }
    }

    // Update form values while preserving other settings
    form.setFieldsValue({
        refreshOptions: {
            ...currentRefreshOptions,
            type: newType,
            interval: intervalValue,
            // Explicitly preserve the enabled state
            enabled: isCurrentlyEnabled
        }
    });

};

/**
 * Creates custom interval change handler
 * 
 * Factory function that creates a handler for custom refresh interval
 * changes with value validation and form updates.
 * 
 * @param {Object} params - Handler parameters
 * @param {Function} params.setCustomInterval - Custom interval state setter
 * @param {Object} params.customIntervalRef - Ref for custom interval
 * @param {Object} params.refreshEnabledRef - Ref for refresh enabled state
 * @param {Object} params.form - Form instance
 * @returns {Function} Custom interval change handler
 */
export const createCustomIntervalHandler = ({
    setCustomInterval,
    customIntervalRef,
    refreshEnabledRef,
    form
}) => (value) => {
    // Ensure value is a positive number
    const interval = value > 0 ? value : 1;
    // Update both state and ref
    setCustomInterval(interval);
    customIntervalRef.current = interval;

    // Get current refresh options to preserve values
    const currentRefreshOptions = form.getFieldValue('refreshOptions') || {};

    // Preserve the enabled flag
    const isCurrentlyEnabled = currentRefreshOptions.enabled === true || refreshEnabledRef.current === true;

    // Update form values while preserving other settings
    form.setFieldsValue({
        refreshOptions: {
            ...currentRefreshOptions,
            interval: interval,
            // Ensure refresh type is set to custom
            type: 'custom',
            // Explicitly preserve the current enabled state
            enabled: isCurrentlyEnabled
        }
    });

};

/**
 * Creates preset interval change handler
 * 
 * Factory function that creates a handler for preset refresh interval
 * changes with proper state synchronization.
 * 
 * @param {Object} params - Handler parameters
 * @param {Function} params.setCustomInterval - Custom interval state setter (used for consistency)
 * @param {Object} params.customIntervalRef - Ref for interval value
 * @param {Object} params.refreshEnabledRef - Ref for refresh enabled state
 * @param {Object} params.form - Form instance
 * @returns {Function} Preset interval change handler
 */
export const createPresetIntervalHandler = ({
    setCustomInterval,
    customIntervalRef,
    refreshEnabledRef,
    form
}) => (value) => {
    // Update state and ref for consistency
    setCustomInterval(value); // We use the same state for both preset and custom
    customIntervalRef.current = value;

    // Get current refresh options to preserve values
    const currentRefreshOptions = form.getFieldValue('refreshOptions') || {};

    // Preserve the existing enabled state
    const isCurrentlyEnabled = currentRefreshOptions.enabled === true || refreshEnabledRef.current === true;

    // Update form values while preserving other settings
    form.setFieldsValue({
        refreshOptions: {
            ...currentRefreshOptions,
            interval: value,
            type: 'preset',
            // Explicitly preserve the enabled state
            enabled: isCurrentlyEnabled
        }
    });

};

/**
 * Creates JSON filter toggle handler
 * 
 * Factory function that creates a handler for JSON filter enable/disable
 * toggle with path persistence and form field updates.
 * 
 * @param {Object} params - Handler parameters
 * @param {Function} params.setJsonFilterEnabled - JSON filter enabled state setter
 * @param {Object} params.jsonFilterEnabledRef - Ref for JSON filter enabled state
 * @param {Object} params.jsonFilterPathRef - Ref for JSON filter path
 * @param {Object} params.form - Form instance
 * @returns {Function} JSON filter toggle handler
 */
export const createJsonFilterToggleHandler = ({
    setJsonFilterEnabled,
    jsonFilterEnabledRef,
    jsonFilterPathRef,
    form
}) => (enabled) => {
    // Update both state and ref
    setJsonFilterEnabled(enabled);
    jsonFilterEnabledRef.current = enabled;

    // Get current jsonFilter form value
    let currentJsonFilter = form.getFieldValue('jsonFilter') || { enabled: false, path: '' };

    // When disabling, always save the current path to our ref
    if (!enabled && currentJsonFilter.path) {
        jsonFilterPathRef.current = currentJsonFilter.path;
    }

    // When enabling, decide which path to use (current form path, saved ref path, or empty)
    let pathToUse = '';
    if (enabled) {
        // First try the current form path
        if (currentJsonFilter.path) {
            pathToUse = currentJsonFilter.path;
        }
        // Then try the saved ref path
        else if (jsonFilterPathRef.current) {
            pathToUse = jsonFilterPathRef.current;
        }
    }

    // Create a clean object with explicit boolean type for enabled
    const updatedJsonFilter = {
        enabled: Boolean(enabled), // Ensure it's a boolean
        path: enabled ? pathToUse : '' // Only include path if enabled
    };

    // Update form values with the clean object
    form.setFieldsValue({
        jsonFilter: updatedJsonFilter
    });

    // If enabled but no path is set, focus the path input after a small delay
    if (enabled && !updatedJsonFilter.path) {
        setTimeout(() => {
            try {
                // Try to find and focus the JSON path input
                const pathInput = document.querySelector('input[id$="-jsonFilter-path"]');
                if (pathInput) {
                    pathInput.focus();
                }
            } catch (e) {
                log.error("Failed to focus JSON path input:", e);
            }
        }, 100);
    }
};

/**
 * Gets form initial values
 * 
 * Utility function that returns properly structured initial values
 * for the HTTP options form with sensible defaults.
 * 
 * @returns {Object} Form initial values object
 * 
 * @example
 * const initialValues = getFormInitialValues();
 * // Used in Form component: initialValues={getFormInitialValues()}
 */
export const getFormInitialValues = () => ({
    sourceMethod: 'GET',
    requestOptions: {
        contentType: 'application/json',
        headers: [],
        queryParams: [],
        body: ''
    },
    jsonFilter: {
        enabled: false,
        path: ''
    },
    refreshOptions: {
        enabled: false,
        type: 'preset',
        interval: 15
    }
});

/**
 * Initializes form structure and defaults
 * 
 * Ensures the form has proper structure and default values for all
 * HTTP options fields, preventing undefined field errors.
 * 
 * @param {Object} form - Form instance
 * @param {Function} setContentType - Content type state setter
 * @param {Function} setJsonFilterEnabled - JSON filter enabled state setter
 * @param {Object} jsonFilterEnabledRef - Ref for JSON filter state
 * @param {Object} jsonFilterPathRef - Ref for JSON filter path
 * @param {Function} setRefreshEnabled - Refresh enabled state setter
 * @param {Object} refreshEnabledRef - Ref for refresh enabled state
 * @param {Function} setRefreshType - Refresh type state setter
 * @param {Object} refreshTypeRef - Ref for refresh type
 * @param {Function} setCustomInterval - Custom interval state setter
 * @param {Object} customIntervalRef - Ref for custom interval
 * 
 * @example
 * initializeFormStructure(form, setContentType, setJsonFilterEnabled, ...refs);
 */
export const initializeFormStructure = (
    form,
    setContentType,
    setJsonFilterEnabled,
    jsonFilterEnabledRef,
    jsonFilterPathRef,
    setRefreshEnabled,
    refreshEnabledRef,
    setRefreshType,
    refreshTypeRef,
    setCustomInterval,
    customIntervalRef
) => {
    try {
        const formValues = form.getFieldsValue(true);

        // Ensure basic form structure exists
        if (!formValues.requestOptions || !formValues.requestOptions.contentType) {
            form.setFieldValue(['requestOptions', 'contentType'], 'application/json');
        }

        if (!Array.isArray(formValues.requestOptions?.headers)) {
            form.setFieldValue(['requestOptions', 'headers'], []);
        }

        if (!formValues.jsonFilter) {
            form.setFieldValue('jsonFilter', { enabled: false, path: '' });
        }

        // Initialize JSON filter state from form
        const jsonFilter = form.getFieldValue('jsonFilter');
        if (jsonFilter) {
            const isEnabled = !!jsonFilter.enabled;
            setJsonFilterEnabled(isEnabled);
            jsonFilterEnabledRef.current = isEnabled;

            if (jsonFilter.path) {
                jsonFilterPathRef.current = jsonFilter.path;
            }
        }

        // Initialize refresh state from form
        const refreshOptions = form.getFieldValue('refreshOptions');
        if (refreshOptions?.enabled) {
            setRefreshEnabled(refreshOptions.enabled);
            refreshEnabledRef.current = refreshOptions.enabled;
            
            if (refreshOptions.type) {
                setRefreshType(refreshOptions.type);
                refreshTypeRef.current = refreshOptions.type;
            }
            
            if (refreshOptions.interval) {
                setCustomInterval(refreshOptions.interval);
                customIntervalRef.current = refreshOptions.interval;
            }
        }

        // Initialize content type from form
        const contentType = form.getFieldValue(['requestOptions', 'contentType']);
        if (contentType) {
            setContentType(contentType);
        }

    } catch (err) {
        log.error("Error initializing form structure:", err);
    }
};