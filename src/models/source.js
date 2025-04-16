// source.js - Source data model

/**
 * Represents a source to be monitored
 */
class Source {
    /**
     * Create a new source
     * @param {Object} data - Source data
     * @param {number} data.sourceId - Unique identifier
     * @param {string} data.sourceType - Type of source ('file', 'env', 'http')
     * @param {string} data.sourcePath - Path, variable name, or URL
     * @param {string} data.sourceTag - Optional tag
     * @param {string} data.sourceMethod - HTTP method (for HTTP sources)
     * @param {string} data.sourceContent - Current content
     * @param {Object} data.requestOptions - HTTP request options (headers, queryParams, body)
     * @param {Object} data.jsonFilter - JSON filter options { enabled, path }
     * @param {Object} data.refreshOptions - Refresh options for HTTP sources
     * @param {number} data.refreshOptions.interval - Refresh interval in minutes (0 for no auto-refresh)
     * @param {number} data.refreshOptions.lastRefresh - Timestamp of last refresh
     * @param {number} data.refreshOptions.nextRefresh - Timestamp of next scheduled refresh
     * @param {string} data.originalJson - Original JSON response for HTTP sources
     * @param {string} data.totpSecret - TOTP secret for authentication (optional)
     */
    constructor(data) {
        this.sourceId = data.sourceId;
        this.sourceType = data.sourceType;
        this.sourcePath = data.sourcePath;
        this.sourceTag = data.sourceTag || '';
        this.sourceMethod = data.sourceMethod || '';
        this.sourceContent = data.sourceContent || '';

        // Store original JSON for HTTP sources (for viewing later)
        this.originalJson = data.originalJson || '';

        // Initialize requestOptions but ensure jsonFilter is not present in it
        this.requestOptions = { ...(data.requestOptions || {}) };

        // If jsonFilter exists in requestOptions, remove it to avoid duplication
        if (this.requestOptions.jsonFilter) {
            delete this.requestOptions.jsonFilter;
        }

        // Set the jsonFilter property directly from data
        this.jsonFilter = data.jsonFilter || { enabled: false, path: '' };

        // Store TOTP secret if provided
        if (data.totpSecret || (data.requestOptions && data.requestOptions.totpSecret)) {
            this.totpSecret = data.totpSecret || data.requestOptions.totpSecret;

            // If TOTP secret exists in requestOptions, ensure it's available at the top level too
            if (data.requestOptions && data.requestOptions.totpSecret) {
                this.totpSecret = data.requestOptions.totpSecret;
            }
        } else {
            this.totpSecret = null;
        }

        // Initialize refresh options with defaults
        this.refreshOptions = data.refreshOptions || {
            interval: 0, // 0 means no auto-refresh
            lastRefresh: Date.now(),
            nextRefresh: 0 // 0 means no next refresh scheduled
        };
    }

    /**
     * Create a unique key for this source
     * @returns {string} Unique key
     */
    getKey() {
        if (this.sourceType === 'http') {
            return `${this.sourceType}:${this.sourceMethod}:${this.sourcePath}`;
        }
        return `${this.sourceType}:${this.sourcePath}`;
    }

    /**
     * Update the content of this source
     * @param {string} content - New content
     * @param {string} originalJson - Original JSON response (for HTTP sources)
     */
    updateContent(content, originalJson = null) {
        // Update the content
        this.sourceContent = content;

        // Store the original JSON if provided and not empty
        if (originalJson !== null && originalJson !== undefined) {
            this.originalJson = originalJson;
            console.log(`Updated originalJson (${originalJson.length} chars)`);
        }

        // Update refresh timestamps for HTTP sources with auto-refresh
        if (this.sourceType === 'http' &&
            this.refreshOptions &&
            this.refreshOptions.interval > 0) {

            const now = Date.now();
            this.refreshOptions.lastRefresh = now;
            this.refreshOptions.nextRefresh = now + (this.refreshOptions.interval * 60 * 1000);

            console.log(`Updated refresh schedule: Next refresh at ${new Date(this.refreshOptions.nextRefresh).toLocaleTimeString()}`);
        }
    }

    /**
     * Get formatted time until next refresh
     * @returns {string} Time until next refresh
     */
    getNextRefreshText() {
        if (!this.refreshOptions || this.refreshOptions.interval <= 0 || !this.refreshOptions.nextRefresh) {
            return 'No auto-refresh';
        }

        const now = Date.now();
        const timeUntil = this.refreshOptions.nextRefresh - now;

        if (timeUntil <= 0) {
            return 'Refresh pending...';
        }

        // Format the remaining time
        const minutes = Math.floor(timeUntil / (60 * 1000));
        const seconds = Math.floor((timeUntil % (60 * 1000)) / 1000);

        if (minutes > 0) {
            return `Refreshes in ${minutes}m ${seconds}s`;
        } else {
            return `Refreshes in ${seconds}s`;
        }
    }

    /**
     * Convert the source to a plain object
     * @returns {Object} Plain object representation
     */
    toJSON() {
        return {
            sourceId: this.sourceId,
            sourceType: this.sourceType,
            sourcePath: this.sourcePath,
            sourceTag: this.sourceTag,
            sourceMethod: this.sourceMethod,
            sourceContent: this.sourceContent,
            // Ensure originalJson is included even if it's empty
            originalJson: this.originalJson || '',
            requestOptions: {
                ...this.requestOptions,
                // Include TOTP secret in requestOptions
                totpSecret: this.totpSecret
            },
            jsonFilter: this.jsonFilter,  // Make sure this is included
            refreshOptions: this.refreshOptions,
            // Include TOTP secret at the top level too
            totpSecret: this.totpSecret
        };
    }

    /**
     * Create a Source instance from plain object
     * @param {Object} data - Plain object data
     * @returns {Source} Source instance
     */
    static fromJSON(data) {
        return new Source(data);
    }
}

module.exports = Source;