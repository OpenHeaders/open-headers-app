/**
 * HTTP Options Package
 * 
 * Comprehensive modular package providing all components, utilities, and handlers
 * for HTTP request configuration and testing. This package encapsulates the complete
 * HTTP options system including validation, testing, configuration management,
 * and TOTP integration.
 * 
 * Package Organization:
 * - HttpValidation: Environment variable and TOTP validation with comprehensive field checking
 * - HttpTesting: HTTP request testing, response handling, and content formatting
 * - HttpConfig: Form state management, refresh options, and JSON filter configuration
 * - HttpUtils: TOTP integration, environment effects, and utility functions
 * 
 * Architecture Benefits:
 * - Modular design for better maintainability and testing
 * - Separation of concerns across functional boundaries
 * - Reusable validation and testing components
 * - Centralized package exports for clean imports
 * - Comprehensive documentation and JSDoc coverage
 * 
 * Usage:
 * Import specific functions from this package to build HTTP options functionality.
 * All exports follow consistent naming patterns and provide comprehensive JSDoc.
 * 
 * @package HttpOptions
 * @since 3.0.0
 */

// Validation Functions Exports
// Environment variable validation, TOTP validation, and comprehensive field checking
export {
    validateVariableExists,
    resolveAllVariables,
    validateUrlField,
    validateHttpHeaders,
    validateQueryParameters,
    validateRequestBody,
    validateJsonFilterPath,
    validateAllHttpFields
} from './HttpValidation';

// HTTP Testing and Response Handling Exports
// Request testing, response formatting, content type handling, and status code mapping
export {
    getStatusText,
    formatContentByType,
    formatResponseForDisplay,
    createHttpTestHandler
} from './HttpTesting';

// Configuration and State Management Exports
// Form state management, refresh options, JSON filter configuration, and initialization
export {
    createContentTypeHandler,
    createRefreshToggleHandler,
    createRefreshTypeHandler,
    createCustomIntervalHandler,
    createPresetIntervalHandler,
    createJsonFilterToggleHandler,
    getFormInitialValues,
    initializeFormStructure
} from './HttpConfig';

// Utility Functions and TOTP Integration Exports
// TOTP code generation, timer effects, environment change effects, and imperative handles
export {
    createTotpStateHelper,
    createTotpToggleHandler,
    createTotpSecretHandler,
    createTotpCodeGenerator,
    createTotpTestHandler,
    createTotpTimerEffect,
    createTotpTrackingEffect,
    createEnvironmentChangeEffect,
    createImperativeHandleMethods
} from './HttpUtils';

// UI Component Exports
// Extracted UI components for modular interface composition
export { default as HttpHeadersTab } from './HttpHeadersTab';
export { default as HttpQueryParamsTab } from './HttpQueryParamsTab';
export { default as HttpBodyTab } from './HttpBodyTab';
export { default as HttpOptionsTab } from './HttpOptionsTab';
export { default as JsonFilterCard } from './JsonFilterCard';
export { default as TotpAuthCard } from './TotpAuthCard';
export { default as AutoRefreshCard } from './AutoRefreshCard';
export { default as ResponsePreviewCard } from './ResponsePreviewCard';