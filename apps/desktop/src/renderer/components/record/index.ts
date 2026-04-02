/**
 * Record Components Module
 *
 * Centralized exports for all record-related components
 * This provides a clean interface for importing record components
 *
 * Usage:
 * ```js
 * // Import specific components
 * import { RecordConsoleTab } from './components/record/console';
 * import { RecordNetworkTab } from './components/record/network';
 * import { useSearchFilter, TimestampCell } from './components/record/shared';
 *
 * // Import from main record module
 * import { RecordConsoleTab, RecordNetworkTab } from './components/record';
 * ```
 */

// Export modular components by category
export * from './console';
// Convenience exports for main components (most commonly used)
export { default as RecordConsoleTab } from './console/RecordConsoleTab';
export * from './info';
export { default as RecordInfoTab } from './info/RecordInfoTab';
export * from './network';
export { default as RecordNetworkTab } from './network/RecordNetworkTab';
export * from './player';
export { default as RecordPlayer } from './player/RecordPlayer';
export * from './shared';
export * from './storage';
export { default as RecordStorageTab } from './storage/RecordStorageTab';
