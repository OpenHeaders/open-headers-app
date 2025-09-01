/**
 * Index file for environments package
 * Exports the main Environments component as default and all utilities
 */

// Main component export
export { default } from './Environments';

// Individual component exports for advanced usage
export { default as EnvironmentSelector } from './EnvironmentSelector';
export { default as VariableTable } from './VariableTable';
export { default as EditableCell } from './EditableCell';
export { default as SecretInput } from './SecretInput';
export { CreateEnvironmentModal, AddVariableModal } from './EnvironmentModals';
export { MissingVariablesAlert, TutorialInfo, VariableUsageSummary } from './EnvironmentInfo';

// Utility exports
export * from './EnvironmentTypes';
export * from './EnvironmentUtils';