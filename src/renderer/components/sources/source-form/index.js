/**
 * Source Form Package
 * 
 * Comprehensive modular package providing all components, utilities, and handlers
 * for source form functionality. This package encapsulates the complete source
 * creation system including field validation, form handlers, field components,
 * and utility functions.
 * 
 * Package Organization:
 * - SourceFormValidation: Field validation logic with environment and TOTP support
 * - SourceFormFields: Reusable form field components and rendering utilities
 * - SourceFormHandlers: Event handlers and business logic factories
 * - SourceFormUtils: Utility functions for scroll handling and state management
 * 
 * Architecture Benefits:
 * - Modular design for better maintainability and testing
 * - Separation of concerns across functional boundaries
 * - Reusable components with clear interfaces
 * - Centralized package exports for clean imports
 * 
 * Usage:
 * Import specific functions from this package to build source form functionality.
 * All exports follow consistent naming patterns and provide comprehensive JSDoc.
 * 
 * @package SourceForm
 * @since 3.0.0
 */

// Validation Functions Exports
// Functions for validating form fields with environment and TOTP support
export {
    validateUrlField,
    validateEnvironmentVariables,
    validateTotpPlaceholders,
    validateHttpHeaders,
    validateQueryParameters,
    validateRequestBody,
    validateJsonFilterPath,
    validateTotpSecret,
    validateAllHttpFields
} from './SourceFormValidation';

// Form Field Components Exports
// Reusable form field components and rendering utilities
export {
    SourcePathField,
    AddSourceButton,
    StickyHeader,
    getSourcePathLabel,
    getSourcePathValidationMessage
} from './SourceFormFields';

// Event Handler Factory Exports
// Factory functions for creating form event handlers
export {
    createSourceTypeChangeHandler,
    createFileBrowseHandler,
    createTotpChangeHandler,
    createTestResponseHandler,
    createFormSubmissionHandler
} from './SourceFormHandlers';

// Utility Functions Exports
// Helper functions for scroll handling, state management, and form utilities
export {
    createScrollHandler,
    setupScrollListener,
    createEnvironmentChangeHandler,
    createTotpTrackingHandler,
    getFormInitialValues,
    getFieldsWithTemplateVariables,
    generateTempSourceId,
    createTestSourceId,
    debounceValidation
} from './SourceFormUtils';