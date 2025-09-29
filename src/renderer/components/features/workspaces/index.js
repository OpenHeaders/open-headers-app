/**
 * Workspaces Package
 * 
 * A comprehensive and well-organized set of components for managing workspace configurations.
 * This package provides functionality for creating, editing, and managing both
 * personal and team workspaces with Git synchronization capabilities.
 * 
 * Package Structure:
 * - components/: UI components for workspace management
 * - hooks/: Custom hooks organized by functionality (git, workspace, sync)
 * - utils/: Utility functions for workspace operations
 * - constants/: Shared constants and configurations
 * 
 * Features:
 * - Personal workspace management (local storage)
 * - Team workspace management (Git-based sync)
 * - Multiple authentication methods (SSH, tokens, basic auth)
 * - Git repository connection testing
 * - Automatic Git installation support
 * - Workspace cloning and synchronization
 * - Real-time sync status monitoring
 * 
 * Architecture:
 * - Modular hook system with specialized responsibilities
 * - Clean separation of concerns (UI, business logic, utilities)
 * - Comprehensive error handling and user feedback
 * - Scalable and maintainable codebase structure
 */

// Main components
export * from './components';

// Hooks
export * from './hooks';

// Utilities and constants
export * from './utils';
export * from './constants';

// Default export is the main component
export { default } from './components/Workspaces';
