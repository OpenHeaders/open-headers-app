/**
 * Workspace Hooks
 * 
 * Centralized exports for all workspace-related hooks.
 * This provides a clean interface for importing hooks from different categories.
 */

// Main orchestrator hook
export { useWorkspaceActions } from './useWorkspaceActions';

// Specialized hooks by category
export * from './git';
export * from './workspace';
export * from './sync';