/**
 * Source Table Package
 * 
 * Comprehensive modular package providing all components, utilities, and handlers
 * for source table functionality. This package encapsulates the complete source
 * management system including dependency checking, refresh management, column
 * configuration, and event handling.
 * 
 * Package Organization:
 * - SourceDependencyChecker: Environment and TOTP dependency validation
 * - SourceRefreshManager: Refresh status display and timing management  
 * - SourceTableColumns: Table column definitions and rendering logic
 * - SourceTableHandlers: Event handlers and business logic factories
 * - SourceTableUtils: Common utilities for formatting and debugging
 * 
 * Architecture Benefits:
 * - Modular design for better maintainability and testing
 * - Separation of concerns across functional boundaries
 * - Reusable components with clear interfaces
 * - Centralized package exports for clean imports
 * 
 * Usage:
 * Import specific functions from this package to build source table functionality.
 * All exports follow consistent naming patterns and provide comprehensive JSDoc.
 * 
 * @package SourceTable
 * @since 3.0.0
 */

// Dependency Management Exports
// Functions for checking and validating source dependencies
export { checkSourceDependencies, isTemplateSource } from './SourceDependencyChecker';

// Utility Functions Exports  
// Common utilities for formatting and debugging operations
export { formatTimeRemaining, trimContent, debugRefreshState } from './SourceTableUtils';

// Refresh Management Exports
// Functions for managing refresh status display and state updates
export { 
    getRefreshStatusText, 
    updateRefreshDisplayStates, 
    cleanupDisplayStates 
} from './SourceRefreshManager';

// Column Configuration Exports
// Table column definitions and rendering logic
export { createSourceTableColumns } from './SourceTableColumns';

// Event Handler Exports
// Factory functions for creating source table event handlers
export { 
    createSaveSourceHandler,
    createRefreshSourceHandler, 
    createRemoveSourceHandler,
    createModalHandlers
} from './SourceTableHandlers';