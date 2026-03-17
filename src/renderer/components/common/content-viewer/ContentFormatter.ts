/**
 * Content Formatting Utilities
 * 
 * Provides robust content formatting capabilities for the ContentViewer component.
 * Handles various content types with graceful error handling and fallback mechanisms.
 * 
 * Features:
 * - Automatic JSON detection and prettification with 2-space indentation
 * - Safe parsing with comprehensive error handling
 * - Content type detection for proper formatting
 * - Fallback messages for empty or invalid content
 * - Support for both objects and string content
 * 
 * @module ContentFormatter
 * @since 3.0.0
 */

/**
 * Formats content for display with intelligent JSON prettification
 * 
 * Automatically detects JSON content and formats it with proper indentation.
 * Falls back to original content if JSON parsing fails or if content is not JSON.
 * 
 * @param {*} content - Content to format (string, object, or any type)
 * @returns {string} Formatted content with proper indentation or fallback message
 * @example
 * formatContent('{"name":"John","age":30}') // Returns prettified JSON
 * formatContent('plain text') // Returns 'plain text'
 * formatContent('') // Returns 'No content available'
 */
export function formatContent(content) {
    try {
        // Detect JSON-like content by checking if it starts with { or [
        if (
            typeof content === 'string' &&
            (content.trim().startsWith('{') || content.trim().startsWith('['))
        ) {
            try {
                // Attempt to parse and re-stringify with 2-space indentation
                const parsed = JSON.parse(content);
                return JSON.stringify(parsed, null, 2);
            } catch (parseError) {
                // JSON parsing failed, return content as-is to preserve original format
                return content;
            }
        }
        // Return content as-is or show fallback message for empty content
        return content || 'No content available';
    } catch (error) {
        // Unexpected error during formatting, return safe fallback
        return content || 'No content available';
    }
}

/**
 * Formats JSON string specifically for API response display
 * 
 * Designed for formatting raw API response data with enhanced error handling.
 * Handles both JSON objects/arrays and non-JSON content like HTML responses.
 * 
 * @param {string} jsonString - Raw response string to format
 * @returns {string} Formatted JSON with 2-space indentation or original content
 * @example
 * formatJson('{"status":"ok","data":[1,2,3]}') // Returns prettified JSON
 * formatJson('<!DOCTYPE html>') // Returns original HTML
 * formatJson('') // Returns 'No response content available'
 */
export function formatJson(jsonString) {
    try {
        if (typeof jsonString !== 'string' || !jsonString.trim()) {
            return 'No response content available';
        }

        // Detect JSON format and attempt to prettify
        if (jsonString.trim().startsWith('{') || jsonString.trim().startsWith('[')) {
            try {
                const parsed = JSON.parse(jsonString);
                return JSON.stringify(parsed, null, 2);
            } catch (parseError) {
                // JSON parsing failed, return original content (might be malformed JSON)
                return jsonString;
            }
        }

        // Content is not JSON format (could be HTML, plain text, etc.)
        return jsonString;
    } catch (error) {
        // Unexpected error during processing
        return jsonString || 'Invalid content';
    }
}

/**
 * Determines if content appears to be JSON format
 * 
 * Performs a lightweight check to identify JSON-like content without parsing.
 * Used for conditional formatting and UI display logic.
 * 
 * @param {*} content - Content to analyze for JSON characteristics
 * @returns {boolean} True if content starts with { or [ (JSON indicators)
 * @example
 * isJsonContent('{"key":"value"}') // Returns true
 * isJsonContent('[1,2,3]') // Returns true
 * isJsonContent('plain text') // Returns false
 * isJsonContent('') // Returns false
 */
export function isJsonContent(content) {
    if (typeof content !== 'string' || !content.trim()) {
        return false;
    }
    
    return content.trim().startsWith('{') || content.trim().startsWith('[');
}

/**
 * Safely parses JSON content with comprehensive error handling
 * 
 * Attempts to parse JSON content while gracefully handling parsing errors.
 * Returns the original content if parsing fails, ensuring no data loss.
 * 
 * @param {string} content - JSON string to parse safely
 * @returns {*} Parsed JavaScript object/array or original content if parsing fails
 * @example
 * safeJsonParse('{"name":"John"}') // Returns {name: "John"}
 * safeJsonParse('invalid json') // Returns 'invalid json'
 * safeJsonParse('') // Returns ''
 */
export function safeJsonParse(content) {
    try {
        if (typeof content === 'string' && content.trim()) {
            return JSON.parse(content);
        }
    } catch (parseError) {
        // JSON parsing failed, return original content to preserve data
    }
    return content;
}