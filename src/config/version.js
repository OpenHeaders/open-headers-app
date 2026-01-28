/**
 * Centralized Version Configuration
 *
 * VERSION TYPES:
 *
 * 1. APP_VERSION - The application release version
 *    - Changes with every release (3.1.0, 3.2.0, etc.)
 *    - Displayed in UI, about dialogs, exports
 *    - Should match package.json version
 *
 * 2. DATA_FORMAT_VERSION - The data schema version
 *    - Only changes on BREAKING schema changes (v3 → v4)
 *    - Used in stored files (rules.json, sources.json, etc.)
 *    - Used in protocol payloads and sync data
 *
 * 3. SUPPORTED_DATA_VERSIONS - Array of data format versions this app can read
 *    - Allows importing data from older app versions
 */

const APP_VERSION = '3.1.4';

const DATA_FORMAT_VERSION = '3.0.0';

const SUPPORTED_DATA_VERSIONS = ['1.0.0', '2.0.0', '3.0.0'];

/**
 * Check if a version is compatible with current data format (same major version)
 * @param {string} version - Version string to check
 * @returns {boolean} - True if version is compatible
 */
function isVersionCompatible(version) {
    if (!version) return false;
    const currentMajor = DATA_FORMAT_VERSION.split('.')[0];
    return version.startsWith(`${currentMajor}.`);
}

module.exports = {
    APP_VERSION,
    DATA_FORMAT_VERSION,
    SUPPORTED_DATA_VERSIONS,
    isVersionCompatible
};
