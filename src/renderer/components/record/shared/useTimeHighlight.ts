/**
 * Custom hook for managing time-based highlighting in record tables
 * Determines which entries should be highlighted based on current playback time
 */

interface TimestampedEntry {
    timestamp: number;
}

export const useTimeHighlight = (
    viewMode: string,
    activeTime: number,
    autoHighlight = false,
) => {
    const isCurrentEntry = <T extends TimestampedEntry>(entry: T, allEntries: T[]) => {
        if (!autoHighlight || viewMode !== 'tabs' || activeTime < 0) {
            return false;
        }

        const activeEntries = allEntries.filter(item => item.timestamp <= activeTime);

        if (activeEntries.length === 0) {
            return false;
        }

        const lastActiveEntry = activeEntries[activeEntries.length - 1];
        return entry.timestamp === lastActiveEntry.timestamp;
    };

    const getRowClassName = <T extends TimestampedEntry>(entry: T, allEntries: T[], baseClass = '') => {
        const classes = baseClass ? [baseClass] : [];

        if (!autoHighlight || viewMode !== 'tabs' || activeTime < 0) {
            return classes.join(' ');
        }

        if (entry.timestamp <= activeTime) {
            classes.push('entry-active');

            if (isCurrentEntry(entry, allEntries)) {
                classes.push('entry-current');
            }
        } else {
            classes.push('entry-future');
        }

        return classes.join(' ');
    };

    const isHighlightingActive = autoHighlight && viewMode === 'tabs' && activeTime >= 0;

    return {
        isCurrentEntry,
        getRowClassName,
        isHighlightingActive
    };
};
