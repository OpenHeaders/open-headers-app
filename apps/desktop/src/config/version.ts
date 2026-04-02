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
 *    - Only changes on BREAKING schema changes (v3 -> v4)
 *    - Used in stored files (rules.json, sources.json, etc.)
 *    - Used in protocol payloads and sync data
 *
 * 3. SUPPORTED_DATA_VERSIONS - Array of data format versions this app can read
 *    - Allows importing data from older app versions
 */

const APP_VERSION: string = '3.1.8';

const DATA_FORMAT_VERSION: string = '3.0.0';

const SUPPORTED_DATA_VERSIONS: string[] = ['1.0.0', '2.0.0', '3.0.0'];

/**
 * Check if a version is compatible with current data format (same major version)
 */
function isVersionCompatible(version: string): boolean {
  if (!version) return false;
  const currentMajor = DATA_FORMAT_VERSION.split('.')[0];
  return version.startsWith(`${currentMajor}.`);
}

export { APP_VERSION, DATA_FORMAT_VERSION, isVersionCompatible, SUPPORTED_DATA_VERSIONS };

export default {
  APP_VERSION,
  DATA_FORMAT_VERSION,
  SUPPORTED_DATA_VERSIONS,
  isVersionCompatible,
};
