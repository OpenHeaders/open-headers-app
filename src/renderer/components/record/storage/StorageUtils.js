/**
 * Storage Utilities
 * 
 * Utilities for storage action types, colors, and formatting
 * Extracted from RecordStorageTab for reusability
 */

/**
 * Get color for storage action type
 * @param {string} action - Storage action ('set', 'remove', 'clear')
 * @returns {string} Ant Design color name
 */
export const getActionColor = (action) => {
    if (!action || typeof action !== 'string') {
        return 'default';
    }
    
    switch (action) {
        case 'set': return 'green';
        case 'remove': return 'red';
        case 'clear': return 'orange';
        default: return 'default';
    }
};

/**
 * Get color for storage type
 * @param {string} type - Storage type ('localStorage', 'sessionStorage', 'cookie')
 * @returns {string} Ant Design color name
 */
export const getTypeColor = (type) => {
    if (!type || typeof type !== 'string') {
        return 'default';
    }
    
    switch (type) {
        case 'localStorage': return 'blue';
        case 'sessionStorage': return 'green';
        case 'cookie': return 'orange';
        default: return 'default';
    }
};

/**
 * Format storage value for display
 * @param {any} value - Storage value to format
 * @returns {string} Formatted value string
 */
export const formatValue = (value) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value, null, 2);
        } catch (error) {
            console.warn('Failed to stringify object:', error);
            return '[Object]';
        }
    }
    try {
        return String(value);
    } catch (error) {
        console.warn('Failed to convert value to string:', error);
        return '[Invalid Value]';
    }
};

/**
 * Get tooltip text for storage action
 * @param {string} action - Storage action
 * @returns {string} Tooltip description
 */
export const getActionTooltip = (action) => {
    const tooltips = {
        'set': 'Storage value was created or updated',
        'remove': 'Storage value was deleted',
        'clear': 'All storage entries were deleted at once'
    };
    return tooltips[action] || 'Storage action';
};

/**
 * Get tooltip text for storage type
 * @param {string} type - Storage type
 * @returns {string} Tooltip description
 */
export const getTypeTooltip = (type) => {
    const tooltips = {
        'localStorage': 'Persistent storage that survives browser restarts',
        'sessionStorage': 'Temporary storage cleared when the tab closes',
        'cookie': 'Small data sent with HTTP requests'
    };
    return tooltips[type] || 'Storage type';
};