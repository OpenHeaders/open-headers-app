/**
 * Type definitions and validation utilities for environment variables
 */

/**
 * Regular expression for variable template syntax: {{VARIABLE_NAME}}
 */
export const VARIABLE_TEMPLATE_REGEX = /{{(\w+)}}/g;

/**
 * Validation pattern for environment variable names
 * Must be uppercase letters and numbers, optionally separated by underscores
 */
export const VARIABLE_NAME_PATTERN = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;

/**
 * Validation pattern for environment names
 * Alphanumeric characters, dashes, and underscores only
 */
export const ENVIRONMENT_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;


/**
 * Default validation rules for environment variable names
 */
export const VARIABLE_NAME_RULES = [
  { required: true, message: 'Please enter variable name' },
  { 
    pattern: VARIABLE_NAME_PATTERN, 
    message: 'Must be uppercase with underscores (e.g., API_URL, AUTH_TOKEN)' 
  }
];

/**
 * Default validation rules for environment names
 */
export const ENVIRONMENT_NAME_RULES = [
  { required: true, message: 'Please enter environment name' },
  { 
    pattern: ENVIRONMENT_NAME_PATTERN, 
    message: 'Only alphanumeric, dash and underscore allowed' 
  }
];

/**
 * Default validation rules for variable values
 */
export const VARIABLE_VALUE_RULES = [
  { required: true, message: 'Please enter value' }
];