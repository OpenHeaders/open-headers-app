/**
 * Source Dependency Checker
 * 
 * Handles dependency validation for HTTP sources including environment variables
 * and TOTP authentication requirements.
 * 
 * This module provides utilities for checking if sources have all required dependencies
 * to function properly. It validates template variables, environment variables, and
 * TOTP authentication configurations.
 * 
 * Key Features:
 * - Environment variable validation with {{VAR}} syntax
 * - TOTP authentication dependency checking
 * - Template variable detection and analysis
 * - Duplicate dependency removal
 * - Missing dependency reporting
 * 
 * Validation Types:
 * - Environment Variables: Checks for {{VARIABLE}} patterns
 * - TOTP Secrets: Validates [[TOTP_CODE]] configuration
 * - Template Detection: Identifies sources using variable templates
 * 
 * @module SourceDependencyChecker
 * @since 3.0.0
 */

/**
 * Checks if source has missing dependencies for activation
 * 
 * Analyzes a source object to identify any missing dependencies that would
 * prevent the source from functioning properly. Returns an array of missing
 * dependency identifiers that can be used for user feedback and state management.
 * 
 * @param {Object} source - Source object to check for dependencies
 * @param {Object} envVars - Available environment variables from context
 * @returns {Array<string>} Array of missing dependency identifiers (e.g., ['env:API_KEY', 'totp:secret'])
 * 
 * @example
 * const missingDeps = checkSourceDependencies(source, { API_KEY: 'value' });
 * // Returns: ['env:MISSING_VAR', 'totp:secret']
 */
export const checkSourceDependencies = (source, envVars) => {
    // Array to collect all missing dependencies
    const missingDeps = [];
    
    // Convert source to string to check for variable patterns
    // This allows checking all source properties for template variables
    const sourceStr = JSON.stringify(source);
    
    // Check for environment variables using {{VAR}} syntax
    // This pattern matches Handlebars-style template variables
    const envVarMatches = sourceStr.match(/{{([^}]+)}}/g);
    if (envVarMatches) {
        envVarMatches.forEach(match => {
            // Extract variable name from {{VAR}} pattern
            const varName = match.slice(2, -2).trim();
            if (!envVars[varName]) {
                // Add to missing dependencies with env: prefix for categorization
                missingDeps.push(`env:${varName}`);
            }
        });
    }
    
    // Check for TOTP code pattern [[TOTP_CODE]]
    // This pattern indicates the source requires TOTP authentication
    if (sourceStr.includes('[[TOTP_CODE]]')) {
        // Validate that TOTP secret is configured and not empty
        const hasTotpSecret = source.requestOptions?.totpSecret && 
            source.requestOptions.totpSecret.trim() !== '';
        if (!hasTotpSecret) {
            // Add TOTP secret requirement to missing dependencies
            missingDeps.push('totp:secret');
        }
    }
    
    // Remove duplicates using Set and return array
    // This ensures each dependency is only listed once
    return [...new Set(missingDeps)];
};

/**
 * Determines if a source uses template variables
 * 
 * Analyzes a source object to detect if it contains template variables,
 * which indicates it's a dynamic source that requires variable resolution.
 * Only checks HTTP sources as other source types don't support templates.
 * 
 * @param {Object} source - Source object to check for template usage
 * @returns {boolean} True if source contains template variables, false otherwise
 * 
 * @example
 * const hasTemplates = isTemplateSource({ sourceType: 'http', url: '{{API_URL}}/data' });
 * // Returns: true
 */
export const isTemplateSource = (source) => {
    // Quick check for template variable usage in source configuration
    // Only HTTP sources support template variables
    if (source.sourceType !== 'http') return false;
    
    // Check if any part of the source contains {{variable}} syntax
    // Convert to string to check all nested properties
    const sourceStr = JSON.stringify(source);
    return sourceStr.includes('{{') && sourceStr.includes('}}');
};