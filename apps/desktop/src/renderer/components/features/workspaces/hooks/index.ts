/**
 * Workspace Hooks
 *
 * Centralized exports for all workspace-related hooks.
 * This provides a clean interface for importing hooks from different categories.
 */

// Specialized hooks by category
export * from './git';
export * from './sync';
// Main orchestrator hook
export { useWorkspaceActions } from './useWorkspaceActions';
export * from './workspace';
