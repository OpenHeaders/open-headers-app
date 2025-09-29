/**
 * Header Extraction Utilities
 * 
 * Comprehensive header extraction system supporting multiple response formats.
 * Implements a fallback hierarchy to maximize header extraction success rate
 * from various API response structures and malformed JSON data.
 * 
 * Extraction Strategy Hierarchy:
 * 1. Direct headers property (ideal case)
 * 2. Raw response JSON parsing
 * 3. Original response string parsing
 * 4. Regex-based extraction for malformed JSON
 * 5. Aggressive pattern matching for edge cases
 * 6. Content-type fallback detection
 * 
 * @module HeaderExtractor
 * @since 3.0.0
 */

/**
 * Extracts HTTP headers from source object using intelligent fallback strategies
 * 
 * Implements a comprehensive extraction hierarchy to handle various response formats
 * from different APIs and proxy configurations. Each strategy is attempted in order
 * until headers are successfully extracted or all methods are exhausted.
 * 
 * @param {Object} source - Source object containing response data
 * @param {Object} [source.headers] - Direct headers object (highest priority)
 * @param {string} [source.rawResponse] - Raw JSON response string
 * @param {string} [source.originalResponse] - Original response data
 * @param {string} [source.sourceContent] - Source content for extraction
 * @returns {Object|null} Extracted headers object or null if extraction fails
 * @example
 * extractHeaders({headers: {'Content-Type': 'application/json'}}) // Returns headers directly
 * extractHeaders({originalResponse: '{"headers":{"Accept":"text/html"}}'}) // Parses from JSON
 */
export function extractHeaders(source) {
    // Check if headers was explicitly cleared (null means error state)
    if (source?.headers === null) {
        return null;
    }

    // First check if there are headers directly in the source
    if (source?.headers) {
        return source.headers;
    }

    // Check for rawResponse property
    if (source?.rawResponse) {
        const rawHeaders = extractFromRawResponse(source.rawResponse);
        if (rawHeaders) return rawHeaders;
    }

    // Try to parse headers from originalResponse if it's a string
    if (source?.originalResponse && typeof source.originalResponse === 'string') {
        const originalHeaders = extractFromOriginalResponse(source.originalResponse);
        if (originalHeaders) return originalHeaders;
    }

    // Check for headers in source content
    if (source?.sourceContent && typeof source.sourceContent === 'string') {
        const contentHeaders = extractFromSourceContent(source.sourceContent);
        if (contentHeaders) return contentHeaders;
    }

    // Manual fallback for common headers
    const fallbackHeaders = generateFallbackHeaders(source);
    if (Object.keys(fallbackHeaders).length > 0) {
        return fallbackHeaders;
    }

    // If we couldn't find headers, return null
    return null;
}

/**
 * Extracts headers from rawResponse property
 * @param {string} rawResponse - Raw response string
 * @returns {Object|null} - Extracted headers or null
 */
function extractFromRawResponse(rawResponse) {
    try {
        const parsed = JSON.parse(rawResponse);
        if (parsed && parsed.headers) {
            return parsed.headers;
        }
    } catch (e) {
        // Failed to parse rawResponse
    }
    return null;
}

/**
 * Extracts headers from originalResponse string
 * @param {string} originalResponse - Original response string
 * @returns {Object|null} - Extracted headers or null
 */
function extractFromOriginalResponse(originalResponse) {
    // First try parsing as JSON
    try {
        const parsedJson = JSON.parse(originalResponse);
        if (parsedJson.headers) {
            return parsedJson.headers;
        }
    } catch (e) {
        // originalResponse is not valid JSON, will try alternate approach
    }

    // Try to extract headers using a more lenient regex approach
    return extractHeadersWithRegex(originalResponse);
}

/**
 * Extracts headers from source content string
 * @param {string} sourceContent - Source content string
 * @returns {Object|null} - Extracted headers or null
 */
function extractFromSourceContent(sourceContent) {
    // Try to find headers in the source content
    if (sourceContent.includes('"headers":')) {
        const regexHeaders = extractHeadersWithRegex(sourceContent);
        if (regexHeaders) return regexHeaders;
    }

    // Try a more aggressive extraction approach for malformed JSON
    return extractHeadersAggressive(sourceContent);
}

/**
 * Extracts headers using regex pattern matching
 * @param {string} content - Content to search
 * @returns {Object|null} - Extracted headers or null
 */
function extractHeadersWithRegex(content) {
    try {
        const headerPattern = /"headers":\s*(\{[^}]+})/;
        const match = content.match(headerPattern);

        if (match && match[1]) {
            try {
                // Try to clean and parse the matched JSON
                const headersText = match[1]
                    .replace(/\\"/g, '"')  // Replace escaped quotes
                    .replace(/([{,])\s*([a-zA-Z0-9_-]+):/g, '$1"$2":'); // Add quotes to keys

                return JSON.parse(headersText);
            } catch (err) {
                // Failed to parse headers from regex match
            }
        }
    } catch (regexErr) {
        // Regex extraction approach failed
    }
    return null;
}

/**
 * Aggressive header extraction for malformed JSON
 * @param {string} content - Content to search
 * @returns {Object|null} - Extracted headers or null
 */
function extractHeadersAggressive(content) {
    try {
        // Look for a larger chunk that might contain the headers
        const fullResponseMatch = content.match(/\{[\s\S]*?"headers"[\s\S]*?}/);
        if (fullResponseMatch) {
            try {
                const fullResponse = JSON.parse(fullResponseMatch[0]);
                if (fullResponse.headers) {
                    return fullResponse.headers;
                }
            } catch (err) {
                // Failed to parse full response match
            }
        }
    } catch (e) {
        // Failed aggressive extraction approach
    }
    return null;
}

/**
 * Generates fallback headers based on content analysis
 * @param {Object} source - Source object
 * @returns {Object} - Fallback headers
 */
function generateFallbackHeaders(source) {
    const fallbackHeaders = {};

    // Check if we can extract content-type from the response
    if (source?.sourceContent?.includes('<!doctype html>') ||
        source?.originalResponse?.includes('<!doctype html>')) {
        fallbackHeaders['Content-Type'] = 'text/html';
    }

    return fallbackHeaders;
}