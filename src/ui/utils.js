// utils.js - Utility functions for the application

/**
 * Utility to format content for display
 * Shows first N chars, then "..." then last M chars based on limit.
 * If total length is <= limit, just show the original content.
 *
 * @param {string} content - Content to format
 * @param {number} limit - Character limit (default: 25)
 * @returns {string} Formatted content
 */
function formatContent(content, limit = 25) {
    if (!content) {
        return 'No content yet';
    }
    if (content.length <= limit) {
        return content;
    }
    const firstPart = content.slice(0, Math.floor(limit * 0.75));
    const lastPart = content.slice(-Math.floor(limit * 0.25));
    return `${firstPart}...${lastPart}`;
}

/**
 * Format HTTP response for display
 * @param {string} responseJson - JSON string containing response
 * @returns {string} Formatted response with status code and body
 */
function formatHttpResponse(responseJson) {
    try {
        console.log("Formatting HTTP response:", responseJson);

        // Parse the JSON response
        const response = JSON.parse(responseJson);

        // Format with status code and body
        let formattedResponse = `Status Code: ${response.statusCode}\n\n`;

        // Check if response was filtered
        if (response.filteredWith) {
            formattedResponse += `[Filtered with path: ${response.filteredWith}]\n\n`;
        }

        // Add the body
        if (response.body) {
            // Try to parse and pretty-print JSON body if possible
            try {
                // Check if the body is already a JSON string
                const jsonBody = typeof response.body === 'string' && response.body.trim().startsWith('{') ?
                    JSON.parse(response.body) : response.body;

                // If it's an object, pretty print it
                if (typeof jsonBody === 'object' && jsonBody !== null) {
                    formattedResponse += JSON.stringify(jsonBody, null, 2);
                    console.log("Body parsed as JSON and pretty-printed");
                } else {
                    // For primitive values (strings, numbers, booleans)
                    formattedResponse += response.body;
                    console.log("Body is a primitive value, using as-is");
                }
            } catch (e) {
                // Not JSON or JSON parsing failed, just add the raw body
                formattedResponse += response.body;
                console.log("Body is plain text or invalid JSON, using as-is");
            }
        } else {
            formattedResponse += "Empty response body";
            console.log("No body content found");
        }

        return formattedResponse;
    } catch (error) {
        // If parsing fails, return the original content
        console.error("Error formatting HTTP response:", error);
        return responseJson || "No content";
    }
}

// Add these functions to utils.js

/**
 * Extract a value from a JSON object using a dot notation path
 * @param {Object} obj - The JSON object
 * @param {string} path - The path using dot notation (e.g., "root.data.items[0].name")
 * @returns {*} The extracted value or undefined if not found
 */
function getValueByPath(obj, path) {
    if (!obj || !path) {
        return undefined;
    }

    // Replace 'root.' prefix if present
    const normalizedPath = path.startsWith('root.') ? path.substring(5) : path;

    // Handle empty path edge case
    if (!normalizedPath) {
        return obj;
    }

    // Split the path by dots and handle array syntax
    const parts = normalizedPath.split('.');
    let current = obj;

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];

        // Handle array index notation: property[index]
        const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);

        if (arrayMatch) {
            const [_, propName, index] = arrayMatch;

            // Check if property exists
            if (current[propName] === undefined) {
                return undefined;
            }

            // Check if property is an array
            if (!Array.isArray(current[propName])) {
                return undefined;
            }

            // Check if index is in bounds
            const idx = parseInt(index, 10);
            if (idx >= current[propName].length) {
                return undefined;
            }

            current = current[propName][idx];
        } else {
            // Regular property access
            if (current[part] === undefined) {
                return undefined;
            }
            current = current[part];
        }
    }

    return current;
}

/**
 * Apply JSON filter to response body if applicable
 * @param {string} body - The response body (should be JSON)
 * @param {Object} jsonFilter - Filter configuration { enabled, path }
 * @returns {string} Filtered or original body
 */
function applyJsonFilter(body, jsonFilter) {
    // Skip if filter is not enabled or no path specified
    if (!jsonFilter || !jsonFilter.enabled || !jsonFilter.path) {
        return body;
    }

    try {
        // Parse the JSON body
        const jsonObj = JSON.parse(body);

        // Extract the value using the specified path
        const filteredValue = getValueByPath(jsonObj, jsonFilter.path);

        if (filteredValue === undefined) {
            // Path doesn't exist in the JSON
            return `Path '${jsonFilter.path}' not found in response`;
        }

        // Handle different types of values
        if (typeof filteredValue === 'object' && filteredValue !== null) {
            // For objects and arrays, return JSON string
            return JSON.stringify(filteredValue, null, 2);
        } else {
            // For primitives (string, number, boolean), return as is
            return String(filteredValue);
        }
    } catch (error) {
        console.error('Error applying JSON filter:', error);
        return `Error applying filter: ${error.message}`;
    }
}

/**
 * Show a temporary toast notification
 * @param {string} message - Message to display
 * @param {string} type - Type of message ('success', 'error', 'info')
 * @param {number} duration - Duration in milliseconds (default: 2000)
 */
function showToast(message, type = 'info', duration = 2000) {
    // Find toast container or create it if it doesn't exist
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast-message ${type}`;
    toast.textContent = message;

    // Add to container
    container.appendChild(toast);

    // Remove after duration
    setTimeout(() => {
        if (container.contains(toast)) {
            container.removeChild(toast);
        }
    }, duration);
}

// utils.js - Add these TOTP-related functions

/**
 * Convert base32 encoded string to array buffer for Web Crypto API
 * @param {string} base32 - Base32 encoded string
 * @returns {Uint8Array} - Array buffer with decoded data
 */
function base32ToBytes(base32) {
    const base32chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';

    // Normalize input and convert to uppercase
    base32 = base32.toUpperCase().replace(/\s/g, '');

    // Convert each character to 5 bits
    for (let i = 0; i < base32.length; i++) {
        const val = base32chars.indexOf(base32[i]);
        if (val < 0) continue; // Skip invalid chars
        bits += val.toString(2).padStart(5, '0');
    }

    // Convert bits to bytes
    const bytes = new Uint8Array(Math.floor(bits.length / 8));
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(bits.substr(i * 8, 8), 2);
    }

    return bytes;
}

/**
 * Generate a TOTP (Time-based One-Time Password) using Web Crypto API
 * @param {string} secret - TOTP secret key (base32 encoded)
 * @param {number} period - Time period in seconds (default: 30)
 * @param {number} digits - Number of digits in the code (default: 6)
 * @returns {Promise<string>} - The generated TOTP code
 */
async function generateTOTP(secret, period = 30, digits = 6) {
    try {
        if (!secret) {
            console.error('TOTP secret not provided');
            return 'ERROR_NO_SECRET';
        }

        // Convert secret to bytes
        const keyBytes = base32ToBytes(secret);

        // Calculate current time period
        const counter = Math.floor(Date.now() / 1000 / period);

        // Convert counter to bytes (8 bytes, big-endian)
        const counterBytes = new Uint8Array(8);
        let temp = counter;
        for (let i = 7; i >= 0; i--) {
            counterBytes[i] = temp & 0xff;
            temp = Math.floor(temp / 256);
        }

        // Import the key for HMAC
        const key = await crypto.subtle.importKey(
            'raw',
            keyBytes,
            { name: 'HMAC', hash: { name: 'SHA-1' } },
            false,
            ['sign']
        );

        // Sign the counter with the key
        const signature = await crypto.subtle.sign('HMAC', key, counterBytes);
        const hash = new Uint8Array(signature);

        // Get the offset
        const offset = hash[hash.length - 1] & 0xf;

        // Calculate the code
        let code =
            ((hash[offset] & 0x7f) << 24) |
            ((hash[offset + 1] & 0xff) << 16) |
            ((hash[offset + 2] & 0xff) << 8) |
            (hash[offset + 3] & 0xff);

        // Convert to the specified number of digits
        code = code % Math.pow(10, digits);

        // Add leading zeros if necessary
        return code.toString().padStart(digits, '0');
    } catch (error) {
        console.error('Error generating TOTP:', error);
        return 'ERROR';
    }
}

/**
 * Process template strings with special variables
 * @param {string} template - Template string with variables
 * @param {Object} variables - Variables to replace in the template
 * @returns {Promise<string>} - Processed string
 */
async function processTemplate(template, variables = {}) {
    if (!template) return '';

    // Check if there are any TOTP placeholders
    if (!template.includes('_TOTP_CODE')) {
        return template;
    }

    // Replace TOTP variables (_TOTP_CODE, etc.)
    const regex = /_TOTP_CODE(?:\(([^)]+)\))?/g;
    let result = template;
    const matches = template.match(regex);

    if (matches) {
        for (const match of matches) {
            // Extract parameters if provided
            const paramMatch = match.match(/_TOTP_CODE(?:\(([^)]+)\))?/);
            const params = paramMatch && paramMatch[1] ? paramMatch[1] : null;

            // Default values
            let secret = variables.TOTP_SECRET || '';
            let period = 30;
            let digits = 6;

            // Parse parameters if provided
            if (params) {
                const paramArray = params.split(',').map(p => p.trim());
                if (paramArray.length >= 1) secret = paramArray[0];
                if (paramArray.length >= 2) period = parseInt(paramArray[1], 10);
                if (paramArray.length >= 3) digits = parseInt(paramArray[2], 10);
            }

            if (!secret) {
                console.error('TOTP secret not provided');
                result = result.replace(match, 'ERROR_NO_SECRET');
                continue;
            }

            try {
                const code = await generateTOTP(secret, period, digits);
                result = result.replace(match, code);
            } catch (error) {
                console.error('Failed to generate TOTP:', error);
                result = result.replace(match, 'ERROR');
            }
        }
    }

    return result;
}

// Make functions available globally
window.base32ToBytes = base32ToBytes;
window.generateTOTP = generateTOTP;
window.processTemplate = processTemplate;
window.showToast = showToast;
window.formatContent = formatContent;
window.formatHttpResponse = formatHttpResponse;
window.getValueByPath = getValueByPath;
window.applyJsonFilter = applyJsonFilter;