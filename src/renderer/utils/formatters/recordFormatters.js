// Utility functions for formatting record data

export const formatDuration = (ms) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${seconds}s`;
};

export const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();

    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');

    return `${day} ${month} ${year} ${hours}:${minutes}:${seconds}`;
};

export const formatConsoleArg = (arg) => {
    if (arg === null) return 'null';
    if (arg === undefined) return 'undefined';

    if (arg.__type === 'Error') {
        return `Error: ${arg.message}`;
    }

    if (arg.__type === 'HTMLElement') {
        return `<${arg.tagName}${arg.id ? '#' + arg.id : ''}${arg.className ? '.' + arg.className : ''}>`;
    }

    if (arg.__type === 'Function') {
        return `ƒ ${arg.name}()`;
    }

    if (typeof arg === 'object') {
        try {
            return JSON.stringify(arg, null, 2);
        } catch (e) {
            return '[Object]';
        }
    }

    return String(arg);
};

export const formatBytes = (bytes) => {
    if (bytes > 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes > 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
};

// Alias for consistency with RecordingsTable
export const formatFileSize = formatBytes;

export const formatMilliseconds = (ms) => {
    if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
    return `${Math.round(ms)} ms`;
};

export const formatRelativeTime = (timestamp) => {
    const totalSeconds = Math.floor(timestamp / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = Math.floor(timestamp % 1000);

    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
};

// New function to format relative time with smaller milliseconds (returns JSX)
export const formatRelativeTimeWithSmallMs = (timestamp) => {
    const totalSeconds = Math.floor(timestamp / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = Math.floor(timestamp % 1000);

    return {
        main: `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`,
        ms: `.${milliseconds.toString().padStart(3, '0')}`
    };
};

// Format absolute time with 24H format and milliseconds
export const format24HTimeWithMs = (absoluteTime) => {
    const hours = absoluteTime.getHours().toString().padStart(2, '0');
    const minutes = absoluteTime.getMinutes().toString().padStart(2, '0');
    const seconds = absoluteTime.getSeconds().toString().padStart(2, '0');
    const milliseconds = absoluteTime.getMilliseconds().toString().padStart(3, '0');

    // Format date as "6 June 2025"
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    const day = absoluteTime.getDate();
    const month = months[absoluteTime.getMonth()];
    const year = absoluteTime.getFullYear();

    return {
        date: `${day} ${month} ${year}`,
        time: `${hours}:${minutes}:${seconds}`,
        ms: `.${milliseconds}`
    };
};

// Format time ago (e.g., "1h 23m 40s ago", "10s ago")
export const formatTimeAgo = (timestamp) => {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 0) return 'Recorded in the future';
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
        const remainingHours = hours % 24;
        const remainingMinutes = minutes % 60;
        const remainingSeconds = seconds % 60;
        return `Recorded ${days}d ${remainingHours}h ${remainingMinutes}m ${remainingSeconds}s ago`;
    }
    
    if (hours > 0) {
        const remainingMinutes = minutes % 60;
        const remainingSeconds = seconds % 60;
        return `Recorded ${hours}h ${remainingMinutes}m ${remainingSeconds}s ago`;
    }
    
    if (minutes > 0) {
        const remainingSeconds = seconds % 60;
        return `Recorded ${minutes}m ${remainingSeconds}s ago`;
    }
    
    return `Recorded ${seconds}s ago`;
};