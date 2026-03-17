/**
 * Proxy Format Utilities
 * 
 * Utility functions for formatting data in proxy components.
 * Includes byte formatting, text truncation, and display helpers.
 */

/**
 * Format bytes to human-readable string
 * 
 * Converts byte values to human-readable format with appropriate units.
 * Used for displaying cache sizes and memory usage.
 * 
 * @param {number} bytes - Number of bytes to format
 * @returns {string} Formatted string with units (B, KB, MB, GB)
 */
export const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Truncate long header values for table display
 * 
 * Shows first 10 and last 10 characters for values longer than 23 chars.
 * Used in table displays to prevent layout issues with long values.
 * 
 * @param {string} value - Header value to truncate
 * @returns {string} Truncated value with ellipsis
 */
export const truncateValue = (value) => {
    if (!value) return '';
    if (value.length <= 23) return value;
    return `${value.substring(0, 10)}...${value.substring(value.length - 10)}`;
};

/**
 * Truncate domain names for display
 * 
 * Truncates domain names that are too long for table display.
 * Maintains readability while preventing layout overflow.
 * 
 * @param {string} domain - Domain name to truncate
 * @param {number} maxLength - Maximum length before truncation (default: 18)
 * @returns {string} Truncated domain with ellipsis if needed
 */
export const truncateDomain = (domain, maxLength = 18) => {
    if (!domain) return '';
    return domain.length > maxLength ? `${domain.substring(0, maxLength)}...` : domain;
};