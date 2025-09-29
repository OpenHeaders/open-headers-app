/**
 * Domain Input Handling Module
 * 
 * Manages input processing, validation, and domain manipulation for
 * the domain tags component including paste handling, comma detection,
 * and batch processing capabilities.
 * 
 * Input Features:
 * - Real-time comma detection for automatic domain addition
 * - Clipboard paste handling with multi-domain support
 * - Domain processing with validation and sanitization
 * - Keyboard shortcuts for enhanced user experience
 * - Automatic focus management for seamless interaction
 * 
 * @module DomainInputHandling
 * @since 3.0.0
 */

import { showMessage } from '../../../utils/ui/messageUtil';
import { validateDomain } from './DomainValidation';

/**
 * Processes a single domain input with validation and sanitization
 * 
 * Takes raw domain input, applies validation rules, and returns
 * a clean domain string or empty string if invalid.
 * 
 * @param {string} input - Raw domain input string
 * @returns {string} Processed domain string or empty if invalid
 * 
 * @example
 * const domain = processSingleDomain('  "example.com"  ');
 * // Returns: 'example.com'
 * 
 * @example
 * const domain = processSingleDomain('invalid..domain');
 * // Returns: '' (and shows error message)
 */
export const processSingleDomain = (input) => {
    if (!input) return '';

    // Remove surrounding quotes and trim whitespace
    let domain = input.trim().replace(/^["']|["']$/g, '');

    // Validate the domain using extracted validation logic
    const { valid, message, sanitized } = validateDomain(domain);
    if (!valid) {
        showMessage('error', message);
        return '';
    }

    // Return the sanitized domain
    return sanitized || domain;
};

/**
 * Creates paste event handler for domain input field
 * 
 * Factory function that creates a specialized paste handler supporting
 * both single and multi-domain paste operations with comma separation.
 * 
 * @param {Object} params - Handler configuration
 * @param {Array} params.value - Current domain tags array
 * @param {Function} params.onChange - Domain change callback
 * @param {string} params.inputValue - Current input field value
 * @param {Function} params.setInputValue - Input value setter
 * @param {Object} params.inputRef - Reference to input element
 * @returns {Function} Paste event handler
 * 
 * @example
 * const handlePaste = createPasteHandler({
 *   value: currentDomains,
 *   onChange: updateDomains,
 *   inputValue: currentInput,
 *   setInputValue: setInput,
 *   inputRef: inputRef
 * });
 */
export const createPasteHandler = ({ 
    value, 
    onChange, 
    inputValue, 
    setInputValue, 
    inputRef 
}) => (e) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');

    if (pastedText.includes(',')) {
        // Multi-domain paste: split by comma and process all parts
        const parts = pastedText.split(',').map(part => part.trim()).filter(Boolean);
        const domains = [];

        for (const part of parts) {
            const domain = processSingleDomain(part);
            if (domain) {
                domains.push(domain);
            }
        }

        // Add all valid domains to the list (remove duplicates)
        if (domains.length > 0) {
            const newTags = [...new Set([...value, ...domains])];
            onChange?.(newTags);
        }

        // Clear the input field
        setInputValue('');

        // Keep input focused for continued editing
        setTimeout(() => {
            inputRef.current?.focus();
        }, 0);
    } else {
        // Single domain paste: append to current input
        setInputValue(inputValue + pastedText);
    }
};

/**
 * Creates input change handler with comma detection
 * 
 * Factory function that creates an input change handler supporting
 * automatic domain addition when comma is typed.
 * 
 * @param {Object} params - Handler configuration
 * @param {Array} params.value - Current domain tags array
 * @param {Function} params.onChange - Domain change callback
 * @param {Function} params.setInputValue - Input value setter
 * @param {Object} params.inputRef - Reference to input element
 * @returns {Function} Input change event handler
 * 
 * @example
 * const handleInputChange = createInputChangeHandler({
 *   value: currentDomains,
 *   onChange: updateDomains,
 *   setInputValue: setInput,
 *   inputRef: inputRef
 * });
 */
export const createInputChangeHandler = ({ 
    value, 
    onChange, 
    setInputValue, 
    inputRef 
}) => (e) => {
    const inputValue = e.target.value;

    // Check if user typed a comma for automatic domain addition
    if (inputValue.includes(',')) {
        // Split by comma and process each part
        const parts = inputValue.split(',');
        const domains = [];

        // Process all parts except the last one (which may be incomplete)
        for (let i = 0; i < parts.length - 1; i++) {
            const domain = processSingleDomain(parts[i]);
            if (domain) {
                domains.push(domain);
            }
        }

        // Add valid domains to the list (remove duplicates)
        if (domains.length > 0) {
            const newTags = [...new Set([...value, ...domains])];
            onChange?.(newTags);
        }

        // Keep the last part as the new input value (may be empty or partial)
        const remainingValue = parts[parts.length - 1];
        setInputValue(remainingValue);

        // Keep input focused for continued editing
        setTimeout(() => {
            inputRef.current?.focus();
        }, 0);
    } else {
        // Normal input: just update the value
        setInputValue(inputValue);
    }
};

/**
 * Creates input confirm handler for domain addition
 * 
 * Factory function that creates a handler for confirming domain input
 * when Enter is pressed or input loses focus.
 * 
 * @param {Object} params - Handler configuration
 * @param {Array} params.value - Current domain tags array
 * @param {Function} params.onChange - Domain change callback
 * @param {string} params.inputValue - Current input field value
 * @param {Function} params.setInputVisible - Input visibility setter
 * @param {Function} params.setInputValue - Input value setter
 * @returns {Function} Input confirm handler
 * 
 * @example
 * const handleInputConfirm = createInputConfirmHandler({
 *   value: currentDomains,
 *   onChange: updateDomains,
 *   inputValue: currentInput,
 *   setInputVisible: setVisible,
 *   setInputValue: setInput
 * });
 */
export const createInputConfirmHandler = ({ 
    value, 
    onChange, 
    inputValue, 
    setInputVisible, 
    setInputValue 
}) => () => {
    const domain = processSingleDomain(inputValue);

    if (domain) {
        // Add the new domain (remove duplicates using Set)
        const newTags = [...new Set([...value, domain])];
        onChange?.(newTags);
    }

    // Reset the input state
    setInputVisible(false);
    setInputValue('');
};

/**
 * Creates keyboard event handler for input field
 * 
 * Factory function that creates a comprehensive keyboard handler supporting
 * Enter to confirm, Escape to cancel, and Backspace for domain removal.
 * 
 * @param {Object} params - Handler configuration
 * @param {Array} params.value - Current domain tags array
 * @param {Function} params.onChange - Domain change callback
 * @param {string} params.inputValue - Current input field value
 * @param {Function} params.setInputVisible - Input visibility setter
 * @param {Function} params.setInputValue - Input value setter
 * @param {Function} params.handleInputConfirm - Input confirm handler
 * @param {Object} params.inputRef - Reference to input element
 * @returns {Function} Keyboard event handler
 * 
 * @example
 * const handleKeyPress = createKeyboardHandler({
 *   value: currentDomains,
 *   onChange: updateDomains,
 *   inputValue: currentInput,
 *   setInputVisible: setVisible,
 *   setInputValue: setInput,
 *   handleInputConfirm: confirmHandler,
 *   inputRef: inputRef
 * });
 */
export const createKeyboardHandler = ({ 
    value, 
    onChange, 
    inputValue, 
    setInputVisible, 
    setInputValue, 
    handleInputConfirm, 
    inputRef 
}) => (e) => {
    if (e.key === 'Enter') {
        // Enter key: confirm current input
        handleInputConfirm();
    } else if (e.key === 'Escape') {
        // Escape key: cancel input without saving
        setInputVisible(false);
        setInputValue('');
    } else if (e.key === 'Backspace' && inputValue === '' && value.length > 0) {
        // Backspace on empty input: remove the last domain
        e.preventDefault();
        const removedDomain = value[value.length - 1];
        const newTags = value.slice(0, -1);
        onChange?.(newTags);
        showMessage('info', `Removed domain: ${removedDomain}`, 1);
        
        // Keep input focused for continued editing
        setTimeout(() => {
            inputRef.current?.focus();
        }, 0);
    }
};

/**
 * Creates batch domain processor for multiple domain operations
 * 
 * Factory function that creates a handler for processing multiple domains
 * simultaneously with validation and duplicate removal.
 * 
 * @param {Object} params - Processor configuration
 * @param {Array} params.value - Current domain tags array
 * @param {Function} params.onChange - Domain change callback
 * @returns {Function} Batch processor function
 * 
 * @example
 * const processBatch = createBatchProcessor({
 *   value: currentDomains,
 *   onChange: updateDomains
 * });
 * 
 * processBatch(['example.com', 'test.com', 'invalid..domain']);
 * // Adds valid domains, shows errors for invalid ones
 */
export const createBatchProcessor = ({ value, onChange }) => (domains) => {
    const validDomains = [];
    const errors = [];
    
    for (const domain of domains) {
        const processed = processSingleDomain(domain);
        if (processed) {
            validDomains.push(processed);
        } else {
            errors.push(domain);
        }
    }
    
    // Add valid domains (remove duplicates)
    if (validDomains.length > 0) {
        const newTags = [...new Set([...value, ...validDomains])];
        onChange?.(newTags);
        
        if (validDomains.length > 1) {
            showMessage('success', `Added ${validDomains.length} domains`);
        }
    }
    
    // Report any errors
    if (errors.length > 0) {
        showMessage('warning', `Skipped ${errors.length} invalid domain${errors.length > 1 ? 's' : ''}`);
    }
    
    return { added: validDomains.length, skipped: errors.length };
};