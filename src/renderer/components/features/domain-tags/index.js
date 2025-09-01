/**
 * Domain Tags Package
 * 
 * Comprehensive modular package providing all components, utilities, and handlers
 * for domain tag management. This package encapsulates the complete domain tags
 * system including validation, input handling, display components, and utilities.
 * 
 * Package Organization:
 * - DomainTags: Main component (exported as default)
 * - DomainValidation: Domain pattern validation and sanitization
 * - DomainInputHandling: Input processing, paste handling, and keyboard events
 * - DomainTagDisplay: Tag rendering, editing, and display components
 * - DomainActionButtons: Bulk action buttons (copy all, delete all)
 * - DomainUtils: Utility functions and state management helpers
 * 
 * Architecture Benefits:
 * - Modular design for better maintainability and testing
 * - Separation of concerns across functional boundaries
 * - Reusable validation and input processing components
 * - Centralized package exports for clean imports
 * - Comprehensive documentation and JSDoc coverage
 * 
 * Usage:
 * Import the main component: `import DomainTags from 'features/domain-tags'`
 * Import specific utilities as needed for advanced usage.
 * 
 * @package DomainTags
 * @since 3.0.0
 */

// Main component export
export { default } from './DomainTags';

// Domain Validation Exports
// Domain pattern validation, sanitization, and format checking
export {
    validateDomain,
    validateDomainBatch,
    isWildcardDomain,
    extractBaseDomain
} from './DomainValidation';

// Domain Input Handling Exports
// Input processing, paste handling, comma detection, and keyboard events
export {
    processSingleDomain,
    createPasteHandler,
    createInputChangeHandler,
    createInputConfirmHandler,
    createKeyboardHandler,
    createBatchProcessor
} from './DomainInputHandling';

// Domain Tag Display Component Exports
// Tag rendering, editing, and display components with tooltip support
export {
    DomainTag,
    DomainTagsContainer,
    DomainInputHelp
} from './DomainTagDisplay';

// Domain Action Buttons Exports
// Bulk action buttons and handlers for copy all and delete all operations
export {
    DomainActionButtons,
    DomainActionsHeader,
    createCopyAllHandler,
    createDeleteAllHandler
} from './DomainActionButtons';

// Domain Utilities Exports
// State management helpers, focus utilities, and domain manipulation functions
export {
    removeDomain,
    addDomains,
    createTagCloseHandler,
    createTagEditHandlers,
    focusInput,
    createShowInputHandler,
    formatDomainCount,
    calculateInputWidth,
    validateDomainArray
} from './DomainUtils';