/**
 * Custom hook for managing time-based highlighting in record tables
 * Determines which entries should be highlighted based on current playback time
 * 
 * @param {Object} record - The record data
 * @param {string} viewMode - Current view mode ('tabs', etc.)
 * @param {number} activeTime - Current playback time
 * @param {boolean} autoHighlight - Whether auto-highlighting is enabled
 * @param {string} timestampProperty - Property name for timestamp (default: 'timestamp')
 * @returns {Object} Highlighting utilities and state
 */
export const useTimeHighlight = (
    record, 
    viewMode, 
    activeTime, 
    autoHighlight = false, 
    timestampProperty = 'timestamp'
) => {
    /**
     * Check if a record entry is currently active based on timestamp
     * @param {Object} entry - Record entry to check
     * @param {Array} allEntries - All entries for comparison
     * @returns {boolean} Whether this entry is the current active entry
     */
    const isCurrentEntry = (entry, allEntries) => {
        if (!autoHighlight || viewMode !== 'tabs' || activeTime < 0) {
            return false;
        }

        const activeEntries = allEntries.filter(
            item => item[timestampProperty] <= activeTime
        );
        
        if (activeEntries.length === 0) {
            return false;
        }

        const lastActiveEntry = activeEntries[activeEntries.length - 1];
        return entry[timestampProperty] === lastActiveEntry[timestampProperty];
    };

    /**
     * Generate CSS classes for table row based on highlight state
     * @param {Object} entry - Record entry
     * @param {Array} allEntries - All entries for comparison
     * @param {string} baseClass - Base CSS class name
     * @returns {string} Space-separated CSS class names
     */
    const getRowClassName = (entry, allEntries, baseClass = '') => {
        const classes = baseClass ? [baseClass] : [];

        if (!autoHighlight || viewMode !== 'tabs' || activeTime < 0) {
            return classes.join(' ');
        }

        if (entry[timestampProperty] <= activeTime) {
            classes.push('entry-active');
            
            if (isCurrentEntry(entry, allEntries)) {
                classes.push('entry-current');
            }
        } else {
            classes.push('entry-future');
        }

        return classes.join(' ');
    };

    /**
     * Check if highlighting is active
     */
    const isHighlightingActive = autoHighlight && viewMode === 'tabs' && activeTime >= 0;

    return {
        isCurrentEntry,
        getRowClassName,
        isHighlightingActive
    };
};