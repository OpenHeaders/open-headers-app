/**
 * Clipboard Management Utilities
 * 
 * Provides robust clipboard operations with comprehensive error handling,
 * user feedback, and state management for copy operations in the ContentViewer.
 * 
 * Features:
 * - Asynchronous clipboard API with fallback handling
 * - User feedback integration with success/error messages
 * - State management for copy button UI states
 * - Customizable feedback messages
 * - Browser compatibility checks
 * 
 * @module ClipboardManager
 * @since 3.0.0
 */

import { showMessage } from '../../../utils/ui/messageUtil';

/**
 * Handles copying text to clipboard with comprehensive user feedback
 * 
 * Manages the complete copy operation lifecycle including state management,
 * clipboard API interaction, user feedback, and automatic state reset.
 * 
 * @param {string} text - Text content to copy to clipboard
 * @param {Function} setCopyingState - State setter function for copy button UI
 * @param {string} [successMessage='Copied to clipboard'] - Success notification message
 * @param {string} [errorMessage='Failed to copy content'] - Error notification message
 * @example
 * handleCopyToClipboard('Hello World', setCopying, 'Text copied!', 'Copy failed!')
 */
export function handleCopyToClipboard(
    text, 
    setCopyingState, 
    successMessage = 'Copied to clipboard',
    errorMessage = 'Failed to copy content'
) {
    // Activate copying state to update button UI immediately
    setCopyingState(true);

    navigator.clipboard.writeText(text)
        .then(() => {
            // Display success notification to user
            showMessage('success', successMessage);
        })
        .catch(() => {
            // Display error notification on clipboard failure
            showMessage('error', errorMessage);
        })
        .finally(() => {
            // Reset button state after 1 second to show feedback
            setTimeout(() => {
                setCopyingState(false);
            }, 1000);
        });
}

/**
 * Creates a reusable copy handler function with pre-configured state management
 * 
 * Factory function that returns a copy handler with pre-bound state management
 * and custom messages. Useful for creating multiple copy handlers with consistent
 * behavior but different state management functions.
 * 
 * @param {Function} setCopyingState - State setter function for copy button UI
 * @param {string} [successMessage='Copied to clipboard'] - Success notification message
 * @param {string} [errorMessage='Failed to copy content'] - Error notification message
 * @returns {Function} Copy handler function that accepts text parameter
 * @example
 * const copyHandler = createCopyHandler(setCopying, 'JSON copied!');
 * copyHandler('{"key": "value"}'); // Copies JSON and shows custom message
 */
export function createCopyHandler(
    setCopyingState, 
    successMessage = 'Copied to clipboard',
    errorMessage = 'Failed to copy content'
) {
    return (text) => {
        handleCopyToClipboard(text, setCopyingState, successMessage, errorMessage);
    };
}

/**
 * Checks if modern clipboard API is available in current browser
 * 
 * Verifies browser support for the modern navigator.clipboard API
 * before attempting clipboard operations. Used for progressive enhancement
 * and fallback strategies.
 * 
 * @returns {boolean} True if clipboard API is fully supported
 * @example
 * if (isClipboardAvailable()) {
 *     // Use modern clipboard API
 * } else {
 *     // Fallback to older methods or disable feature
 * }
 */
export function isClipboardAvailable() {
    return navigator.clipboard && typeof navigator.clipboard.writeText === 'function';
}