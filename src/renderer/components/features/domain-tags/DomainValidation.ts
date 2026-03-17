/**
 * Domain Validation Module
 * 
 * Provides comprehensive domain pattern validation and sanitization
 * for domain tags component with support for various domain formats.
 * 
 * Validation Features:
 * - Standard domain format validation with regex patterns
 * - Wildcard domain support (*.example.com, *://example.com/*)
 * - IP address validation with optional port numbers
 * - Localhost and loopback address support
 * - Protocol prefix handling (http://, https://)
 * - Path suffix handling for URL patterns
 * 
 * @module DomainValidation
 * @since 3.0.0
 */

/**
 * Validates domain pattern and returns validation result with sanitized value
 * 
 * Performs comprehensive validation for various domain formats including
 * standard domains, wildcard patterns, IP addresses, and special cases.
 * 
 * @param {string} domain - Domain pattern to validate
 * @returns {Object} Validation result object
 * @returns {boolean} returns.valid - Whether the domain is valid
 * @returns {string} returns.message - Error message if invalid
 * @returns {string} returns.sanitized - Sanitized domain value if valid
 * 
 * @example
 * // Standard domain
 * const result = validateDomain('example.com');
 * // { valid: true, sanitized: 'example.com' }
 * 
 * @example
 * // Wildcard domain
 * const result = validateDomain('*.example.com');
 * // { valid: true, sanitized: '*.example.com' }
 * 
 * @example
 * // IP address with port
 * const result = validateDomain('192.168.1.1:8080');
 * // { valid: true, sanitized: '192.168.1.1:8080' }
 * 
 * @example
 * // Invalid domain
 * const result = validateDomain('invalid..domain');
 * // { valid: false, message: 'Invalid domain pattern' }
 */
export const validateDomain = (domain) => {
    // Check for empty or whitespace-only input
    if (!domain || !domain.trim()) {
        return { valid: false, message: 'Domain cannot be empty' };
    }

    // Allow environment variable patterns
    if (domain.includes('{{') || domain.includes('}}')) {
        // Basic check for balanced braces
        const openCount = (domain.match(/\{\{/g) || []).length;
        const closeCount = (domain.match(/\}\}/g) || []).length;
        
        if (openCount !== closeCount) {
            return { valid: false, message: 'Invalid environment variable syntax - unmatched braces' };
        }
        
        // Allow domains that contain environment variables
        return { valid: true, sanitized: domain.trim() };
    }

    // Basic domain pattern validation - matches standard domain format
    // Allows optional wildcard prefix (*.domain.com) and standard domain components
    const domainPattern = /^(\*\.)?[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    
    // Allow wildcard patterns for flexible domain matching
    // Supports patterns like *, *://example.com/*, and /*
    if (domain === '*' || domain.includes('*://') || domain.includes('/*')) {
        return { valid: true, sanitized: domain.trim() };
    }
    
    // IP address validation with optional port number
    // Matches IPv4 addresses like 192.168.1.1 or 192.168.1.1:8080
    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/;
    if (ipPattern.test(domain)) {
        return { valid: true, sanitized: domain.trim() };
    }
    
    // Special case handling for localhost and loopback addresses
    // Supports localhost, localhost:port, and 127.0.0.1 variations
    if (domain.startsWith('localhost') || domain === '127.0.0.1') {
        return { valid: true, sanitized: domain.trim() };
    }
    
    // Extract domain part from full URLs by removing protocol and path
    // Handles cases like https://example.com/path -> example.com
    const domainOnly = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    
    // Validate extracted domain against standard pattern, allowing wildcards
    if (!domainPattern.test(domainOnly) && !domain.includes('*')) {
        return { valid: false, message: 'Invalid domain pattern' };
    }
    
    // Return valid result with sanitized (trimmed) domain
    return { valid: true, sanitized: domain.trim() };
};

/**
 * Validates and sanitizes a batch of domain patterns
 * 
 * Processes multiple domains and returns both valid and invalid results
 * for batch validation scenarios with detailed error reporting.
 * 
 * @param {string[]} domains - Array of domain patterns to validate
 * @returns {Object} Batch validation result
 * @returns {string[]} returns.valid - Array of valid sanitized domains
 * @returns {Object[]} returns.invalid - Array of invalid domain objects with errors
 * 
 * @example
 * const result = validateDomainBatch(['example.com', 'invalid..domain', '*.test.com']);
 * // {
 * //   valid: ['example.com', '*.test.com'],
 * //   invalid: [{ domain: 'invalid..domain', message: 'Invalid domain pattern' }]
 * // }
 */
export const validateDomainBatch = (domains) => {
    const valid = [];
    const invalid = [];
    
    for (const domain of domains) {
        const { valid: isValid, sanitized, message } = validateDomain(domain);
        if (isValid) {
            valid.push(sanitized);
        } else {
            invalid.push({ domain, message });
        }
    }
    
    return { valid, invalid };
};

/**
 * Checks if a domain pattern is a wildcard pattern
 * 
 * Determines whether a domain uses wildcard matching syntax
 * for conditional handling in UI and validation flows.
 * 
 * @param {string} domain - Domain pattern to check
 * @returns {boolean} True if domain contains wildcard patterns
 * 
 * @example
 * isWildcardDomain('*.example.com'); // true
 * isWildcardDomain('example.com');   // false
 * isWildcardDomain('*://test.com/*'); // true
 */
export const isWildcardDomain = (domain) => {
    return domain && (domain.includes('*') || domain === '*');
};

/**
 * Extracts the base domain from a domain pattern
 * 
 * Removes protocols, wildcards, and paths to get the core domain
 * for display and comparison purposes.
 * 
 * @param {string} domain - Domain pattern to extract from
 * @returns {string} Base domain without prefixes or suffixes
 * 
 * @example
 * extractBaseDomain('https://www.example.com/path'); // 'www.example.com'
 * extractBaseDomain('*.example.com');                // 'example.com'
 * extractBaseDomain('*://test.com/*');               // 'test.com'
 */
export const extractBaseDomain = (domain) => {
    if (!domain) return '';
    
    // Remove protocol prefixes
    let cleaned = domain.replace(/^https?:\/\//, '');
    
    // Remove wildcard prefixes
    cleaned = cleaned.replace(/^\*\./, '');
    cleaned = cleaned.replace(/^\*:\/\//, '');
    
    // Remove path suffixes
    cleaned = cleaned.replace(/\/.*$/, '');
    cleaned = cleaned.replace(/\/\*$/, '');
    
    return cleaned;
};