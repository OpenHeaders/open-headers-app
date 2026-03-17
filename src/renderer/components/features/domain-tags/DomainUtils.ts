/**
 * Domain Utilities Module
 * 
 * Provides utility functions and helpers for domain tag management
 * including tag manipulation, focus management, and state utilities.
 * 
 * Utility Features:
 * - Tag array manipulation with duplicate removal
 * - Focus management for input elements
 * - Domain formatting and display utilities
 * - State management helpers for complex operations
 * - Event handler factory functions
 * 
 * @module DomainUtils
 * @since 3.0.0
 */

/**
 * Removes a domain from the tags array
 * 
 * Creates a new array with the specified domain removed,
 * maintaining immutability for React state updates.
 * 
 * @param {Array} domains - Current domain tags array
 * @param {string} domainToRemove - Domain to remove from array
 * @returns {Array} New array without the removed domain
 * 
 * @example
 * const newDomains = removeDomain(['a.com', 'b.com', 'c.com'], 'b.com');
 * // Returns: ['a.com', 'c.com']
 */
export const removeDomain = (domains, domainToRemove) => {
    return domains.filter(domain => domain !== domainToRemove);
};

/**
 * Adds domains to the tags array with duplicate removal
 * 
 * Creates a new array with new domains added, automatically
 * removing duplicates using Set functionality.
 * 
 * @param {Array} currentDomains - Current domain tags array
 * @param {Array|string} newDomains - New domain(s) to add
 * @returns {Array} New array with added domains (no duplicates)
 * 
 * @example
 * const updated = addDomains(['a.com'], ['b.com', 'a.com', 'c.com']);
 * // Returns: ['a.com', 'b.com', 'c.com']
 */
export const addDomains = (currentDomains, newDomains) => {
    const domainsToAdd = Array.isArray(newDomains) ? newDomains : [newDomains];
    return [...new Set([...currentDomains, ...domainsToAdd])];
};

/**
 * Creates tag close handler
 * 
 * Factory function that creates a handler for removing individual
 * domain tags with proper state updates.
 * 
 * @param {Array} domains - Current domain tags array
 * @param {Function} onChange - Domain change callback function
 * @returns {Function} Tag close handler
 * 
 * @example
 * const handleClose = createTagCloseHandler(domains, setDomains);
 * handleClose('example.com'); // Removes example.com from domains
 */
export const createTagCloseHandler = (domains, onChange) => (domainToRemove) => {
    const newTags = removeDomain(domains, domainToRemove);
    onChange?.(newTags);
};

/**
 * Creates tag edit handlers for inline editing
 * 
 * Factory function that creates handlers for tag editing operations
 * including start edit, change, confirm, and keyboard events.
 * 
 * @param {Object} params - Handler configuration
 * @param {Function} params.setEditIndex - Edit index state setter
 * @param {Function} params.setEditValue - Edit value state setter
 * @returns {Object} Object containing edit handler functions
 * 
 * @example
 * const {
 *   handleEdit,
 *   handleEditChange,
 *   handleEditConfirm,
 *   handleEditKeyDown
 * } = createTagEditHandlers({
 *   setEditIndex,
 *   setEditValue
 * });
 */
export const createTagEditHandlers = ({
    setEditIndex,
    setEditValue
}) => {
    const handleEdit = (index, tag) => {
        setEditIndex(index);
        setEditValue(tag);
    };

    const handleEditChange = (e) => {
        setEditValue(e.target.value);
    };

    const handleEditConfirm = () => {
        // Note: This would need validation logic from DomainInputHandling
        // For now, just reset edit state
        setEditIndex(-1);
        setEditValue('');
    };

    const handleEditKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleEditConfirm();
        } else if (e.key === 'Escape') {
            setEditIndex(-1);
            setEditValue('');
        }
    };

    return {
        handleEdit,
        handleEditChange,
        handleEditConfirm,
        handleEditKeyDown
    };
};

/**
 * Manages focus for input elements
 * 
 * Utility function for managing focus timing and element focus
 * with proper error handling for React refs.
 * 
 * @param {Object} inputRef - React ref to input element
 * @param {number} delay - Delay in milliseconds before focusing (default: 0)
 * 
 * @example
 * focusInput(inputRef, 100); // Focus input after 100ms
 */
export const focusInput = (inputRef, delay = 0) => {
    setTimeout(() => {
        try {
            inputRef.current?.focus();
        } catch (error) {
            console.warn('Failed to focus input element:', error);
        }
    }, delay);
};

/**
 * Creates input visibility toggle handler
 * 
 * Factory function that creates a handler for showing the domain
 * input field with automatic focus management.
 * 
 * @param {Function} setInputVisible - Input visibility state setter
 * @param {Object} inputRef - React ref to input element
 * @returns {Function} Show input handler
 * 
 * @example
 * const showInput = createShowInputHandler(setVisible, inputRef);
 * showInput(); // Shows input and focuses it
 */
export const createShowInputHandler = (setInputVisible, inputRef) => () => {
    setInputVisible(true);
    focusInput(inputRef);
};

/**
 * Formats domain count for display messages
 * 
 * Creates properly pluralized messages for domain count displays
 * and user feedback messaging.
 * 
 * @param {number} count - Number of domains
 * @param {string} action - Action being performed (default: 'domain')
 * @returns {string} Formatted count message
 * 
 * @example
 * formatDomainCount(1, 'copied'); // '1 domain copied'
 * formatDomainCount(5, 'added');  // '5 domains added'
 */
export const formatDomainCount = (count, action = 'domain') => {
    const plural = count !== 1 ? 's' : '';
    return `${count} ${action}${plural}`;
};

/**
 * Calculates optimal input width based on content
 * 
 * Dynamically calculates input field width based on content length
 * with minimum and maximum width constraints.
 * 
 * @param {string} content - Input content to measure
 * @param {number} minWidth - Minimum width in pixels (default: 80)
 * @param {number} maxWidth - Maximum width in pixels (default: 400)
 * @param {number} charWidth - Average character width in pixels (default: 8)
 * @returns {number} Calculated width in pixels
 * 
 * @example
 * const width = calculateInputWidth('example.com', 100, 300);
 * // Returns appropriate width for the domain length
 */
export const calculateInputWidth = (content, minWidth = 80, maxWidth = 400, charWidth = 8) => {
    const calculatedWidth = (content?.length || 0) * charWidth + 20;
    return Math.min(maxWidth, Math.max(minWidth, calculatedWidth));
};

/**
 * Validates domain array for consistency
 * 
 * Checks domain array for common issues like duplicates,
 * empty values, and invalid formats.
 * 
 * @param {Array} domains - Domain array to validate
 * @returns {Object} Validation result with issues found
 * 
 * @example
 * const result = validateDomainArray(['a.com', '', 'a.com', 'b.com']);
 * // Returns: { valid: false, issues: ['duplicates', 'empty'] }
 */
export const validateDomainArray = (domains) => {
    const issues = [];
    
    // Check for duplicates
    const unique = new Set(domains);
    if (unique.size !== domains.length) {
        issues.push('duplicates');
    }
    
    // Check for empty values
    if (domains.some(domain => !domain || !domain.trim())) {
        issues.push('empty');
    }
    
    // Check for invalid characters (basic check)
    if (domains.some(domain => typeof domain !== 'string')) {
        issues.push('invalid_type');
    }
    
    return {
        valid: issues.length === 0,
        issues,
        duplicateCount: domains.length - unique.size,
        emptyCount: domains.filter(d => !d || !d.trim()).length
    };
};