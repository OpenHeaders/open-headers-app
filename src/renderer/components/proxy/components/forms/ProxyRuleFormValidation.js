/**
 * Proxy Rule Form Validation
 * 
 * Validation functions and rules for proxy rule form fields.
 * Provides consistent validation logic across form components.
 */

/**
 * Validate header name field
 * Required for custom headers, not needed for header rule references
 */
export const createHeaderNameValidator = (headerType) => (_, value) => {
    if (headerType === 'custom' && (!value || !value.trim())) {
        return Promise.reject('Header name is required');
    }
    return Promise.resolve();
};

/**
 * Validate header value field
 * Required for static custom headers, not needed for dynamic or reference headers
 */
export const createHeaderValueValidator = (headerType, valueType) => (_, value) => {
    if (headerType === 'custom' && valueType === 'static' && (!value || !value.trim())) {
        return Promise.reject('Header value is required');
    }
    return Promise.resolve();
};

/**
 * Validate rule name field
 * Always required for all rule types
 */
export const validateRuleName = [
    { required: true, message: 'Rule name is required' }
];