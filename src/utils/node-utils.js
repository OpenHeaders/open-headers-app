// node-utils.js - Utility functions for Node.js environment
const crypto = require('crypto');

/**
 * Convert a base32 encoded string to buffer
 * @param {string} base32 - Base32 encoded string
 * @returns {Buffer} - Buffer containing the decoded data
 */
function base32ToBuffer(base32) {
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
    const bytes = [];
    for (let i = 0; i < bits.length; i += 8) {
        const chunk = bits.substr(i, 8);
        if (chunk.length === 8) {
            bytes.push(parseInt(chunk, 2));
        }
    }

    return Buffer.from(bytes);
}

/**
 * Generate a TOTP code using Node.js crypto
 * @param {string} secret - TOTP secret key (base32 encoded)
 * @param {number} period - Time period in seconds (default: 30)
 * @param {number} digits - Number of digits in code (default: 6)
 * @returns {string} - TOTP code
 */
function generateTOTP(secret, period = 30, digits = 6) {
    try {
        if (!secret) {
            console.error('TOTP secret not provided');
            return 'ERROR_NO_SECRET';
        }

        // Convert secret to buffer
        const key = base32ToBuffer(secret);

        // Calculate counter value based on current time
        const counter = Math.floor(Date.now() / 1000 / period);

        // Create buffer for counter (8 bytes, big-endian)
        const counterBuf = Buffer.alloc(8);
        let temp = counter;
        for (let i = counterBuf.length - 1; i >= 0; i--) {
            counterBuf[i] = temp & 0xff;
            temp = Math.floor(temp / 256);
        }

        // Calculate HMAC-SHA1
        const hmac = crypto.createHmac('sha1', key);
        const hash = hmac.update(counterBuf).digest();

        // Dynamic truncation
        const offset = hash[hash.length - 1] & 0xf;

        // Calculate code value
        let code =
            ((hash[offset] & 0x7f) << 24) |
            ((hash[offset + 1] & 0xff) << 16) |
            ((hash[offset + 2] & 0xff) << 8) |
            (hash[offset + 3] & 0xff);

        // Truncate to the specified number of digits
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
 * @returns {string} - Processed string
 */
function processTemplate(template, variables = {}) {
    if (!template) return '';

    // Replace TOTP variables (_TOTP_CODE, etc.)
    return template.replace(/_TOTP_CODE(?:\(([^)]+)\))?/g, (match, params) => {
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
            return 'ERROR_NO_SECRET';
        }

        try {
            return generateTOTP(secret, period, digits);
        } catch (error) {
            console.error('Failed to generate TOTP:', error);
            return 'ERROR';
        }
    });
}

/**
 * Process TOTP variables in any data structure
 * @param {any} data - Data to process
 * @param {Object} variables - Variables for TOTP generation
 * @returns {any} - Processed data
 */
function processTOTPVariables(data, variables = {}) {
    if (!data) return data;

    // Helper function to process a string
    const processString = (str) => {
        if (typeof str !== 'string') return str;
        return processTemplate(str, variables);
    };

    // Process different types of data
    if (typeof data === 'string') {
        return processString(data);
    } else if (Array.isArray(data)) {
        return data.map(item => processTOTPVariables(item, variables));
    } else if (typeof data === 'object' && data !== null) {
        const result = {};
        for (const key in data) {
            result[key] = processTOTPVariables(data[key], variables);
        }
        return result;
    }

    return data;
}

module.exports = {
    generateTOTP,
    processTemplate,
    processTOTPVariables
};