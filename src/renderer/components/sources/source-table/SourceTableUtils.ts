/**
 * Source Table Utilities
 * 
 * Essential utility functions for source table operations including time formatting,
 * content trimming, and debug helpers. These utilities provide consistent formatting
 * and debugging capabilities across the source table implementation.
 * 
 * Core Functions:
 * - Time formatting for human-readable countdown displays
 * - Content trimming for table cell display optimization
 * - Debug logging helpers for refresh state tracking
 * 
 * Usage Context:
 * - Used throughout source table components for consistent formatting
 * - Provides centralized logic for common display operations
 * - Supports debugging and monitoring of refresh operations
 * 
 * @module SourceTableUtils
 * @since 3.0.0
 */

/**
 * Formats time remaining in human-readable format
 * 
 * Converts milliseconds to a user-friendly time format suitable for countdown displays.
 * Automatically adjusts format based on duration (shows hours only when needed).
 * 
 * @param {number} milliseconds - Time in milliseconds to format
 * @returns {string} Formatted time string (e.g., "1h 30m 45s" or "5m 30s")
 * 
 * @example
 * formatTimeRemaining(3661000) // "1h 1m 1s"
 * formatTimeRemaining(300000)  // "5m 0s"
 * formatTimeRemaining(45000)   // "0m 45s"
 */
export const formatTimeRemaining = (milliseconds) => {
    // Convert milliseconds to total seconds for easier calculations
    const totalSeconds = Math.floor(milliseconds / 1000);
    
    // Break down into hours, minutes, and seconds components
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    // Show hours only when duration is 1 hour or more
    // This keeps the display compact for shorter durations
    if (hours > 0) {
        return `${hours}h ${minutes}m ${seconds}s`;
    } else {
        return `${minutes}m ${seconds}s`;
    }
};

/**
 * Trims content for display in table cells
 * 
 * Intelligently truncates content to fit within table cell constraints while
 * preserving important context from both the beginning and end of the content.
 * Uses a middle-ellipsis approach to show both start and end portions.
 * 
 * @param {string} content - Content string to trim for display
 * @returns {string} Trimmed content with ellipsis if needed, or fallback message for empty content
 * 
 * @example
 * trimContent("") // "No content yet"
 * trimContent("short") // "short"
 * trimContent("This is a very long content string that needs trimming") 
 * // "This is a ...g trimming"
 */
export const trimContent = (content) => {
    // Handle empty or null content with user-friendly message
    if (!content) return 'No content yet';

    // If content is short enough, display it completely
    if (content.length <= 30) return content;

    // Use middle-ellipsis pattern to show both beginning and end
    // This is more informative than simple truncation as it preserves
    // context from both ends, which is especially useful for URLs and JSON
    return `${content.substring(0, 10)}...${content.substring(content.length - 10)}`;
};

/**
 * Debug helper for tracking refresh states
 * 
 * Provides structured logging for refresh operations with timestamp and context.
 * Helps track the lifecycle of refresh operations across the source table system.
 * Particularly useful for debugging timing issues and state synchronization.
 * 
 * @param {number} sourceId - Source ID being operated on
 * @param {string} action - Action being performed (e.g., "Manual Refresh Started")
 * @param {Object} data - Additional contextual data to include in log entry
 * @param {Object} log - Logger instance for output
 * @param {Object} timeManager - Time manager instance for timestamp generation
 * 
 * @example
 * debugRefreshState(123, "Manual Refresh Started", { userId: 'user1' }, log, timeManager);
 * // Outputs: [14:30:15] [RefreshTable] Source 123 - Manual Refresh Started: { userId: 'user1' }
 */
export const debugRefreshState = (sourceId, action, data = {}, log, timeManager) => {
    // Extract time portion from ISO string for compact timestamp display
    // Format: HH:MM:SS for easy scanning in debug logs
    const timestamp = timeManager.getDate().toISOString().substring(11, 19);
    
    // Structured log format for consistent debugging across the application
    // Includes timestamp, component context, source ID, action, and additional data
    log.debug(`[${timestamp}] [RefreshTable] Source ${sourceId} - ${action}:`, data);
};