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
export * from './network';
export * from './storage';
export * from './player';
export * from './info';
export * from './shared';

// Convenience exports for main components (most commonly used)
export { default as RecordConsoleTab } from './console/RecordConsoleTab';
export { default as RecordNetworkTab } from './network/RecordNetworkTab';
export { default as RecordStorageTab } from './storage/RecordStorageTab';
export { default as RecordPlayer } from './player/RecordPlayer';
export { default as RecordInfoTab } from './info/RecordInfoTab';
