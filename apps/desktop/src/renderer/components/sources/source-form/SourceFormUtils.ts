/**
 * Source Form Utils
 *
 * Utility functions and helpers for source form operations including
 * scroll handling, form state management, and configuration helpers.
 *
 * Utility Categories:
 * - Scroll event handling for sticky header behavior
 * - Form validation trigger utilities
 * - Environment change effect handlers
 * - TOTP tracking and management helpers
 *
 * @module SourceFormUtils
 * @since 3.0.0
 */

import type { SourceType } from '@openheaders/core';
import type { FormInstance } from 'antd';
import type { RefObject } from 'react';

interface LoggerLike {
  debug: (message: string, data?: unknown) => void;
  info: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  error: (message: string, data?: unknown) => void;
}

interface ScrollHandlerParams {
  formCardRef: RefObject<HTMLElement | null>;
  setIsSticky: (sticky: boolean) => void;
  isSticky: boolean;
  headerHeight?: number;
}

interface EnvironmentChangeHandlerParams {
  form: FormInstance;
  sourceType: SourceType;
  envContext: { environmentsReady: boolean };
  httpOptionsRef: RefObject<{ validateFields?: () => void } | null>;
  log: LoggerLike;
}

interface TotpTrackingHandlerParams {
  totpEnabled: boolean;
  totpSecret: string;
  trackTotpSecret: (sourceId: string) => void;
  untrackTotpSecret: (sourceId: string) => void;
  testSourceId: string;
}

interface FormValues {
  sourcePath?: string;
  sourceType?: string;
  sourceName?: string;
  sourceTag?: string;
  sourceMethod?: string;
}

/**
 * Creates scroll event handler for sticky header behavior
 *
 * Factory function that creates a scroll event handler to determine
 * when the form header should become sticky based on scroll position.
 *
 * @param params - Handler parameters
 * @param params.formCardRef - Form card ref for position detection
 * @param params.setIsSticky - Sticky state setter
 * @param params.isSticky - Current sticky state
 * @param params.headerHeight - App header height in pixels (default: 64)
 * @returns Scroll event handler
 *
 * @example
 * const handleScroll = createScrollHandler({
 *   formCardRef,
 *   setIsSticky,
 *   isSticky,
 *   headerHeight: 64
 * });
 */
export const createScrollHandler =
  ({ formCardRef, setIsSticky, isSticky, headerHeight = 64 }: ScrollHandlerParams) =>
  () => {
    // Skip if form card ref is not available
    if (!formCardRef.current) return;

    // Get current position of form card relative to viewport
    const formCardTop = formCardRef.current.getBoundingClientRect().top;

    // Header should become sticky when the form card reaches the app header
    if (formCardTop <= headerHeight && !isSticky) {
      setIsSticky(true);
    } else if (formCardTop > headerHeight && isSticky) {
      setIsSticky(false);
    }
  };

/**
 * Sets up scroll event listener with cleanup
 *
 * Utility function that sets up scroll event listener with proper
 * cleanup and initial position check.
 *
 * @param scrollHandler - Scroll event handler function
 * @returns Cleanup function for removing event listener
 *
 * @example
 * useEffect(() => {
 *   const cleanup = setupScrollListener(handleScroll);
 *   return cleanup;
 * }, [handleScroll]);
 */
export const setupScrollListener = (scrollHandler: () => void) => {
  // Add scroll event listener
  window.addEventListener('scroll', scrollHandler);

  // Run once to check initial position
  scrollHandler();

  // Return cleanup function
  return () => {
    window.removeEventListener('scroll', scrollHandler);
  };
};

/**
 * Creates environment change effect handler
 *
 * Factory function that creates a handler for environment changes
 * with form field validation triggering.
 *
 * @param params - Handler parameters
 * @param params.form - Form instance
 * @param params.sourceType - Current source type
 * @param params.envContext - Environment context
 * @param params.httpOptionsRef - HttpOptions component ref
 * @param params.log - Logger instance
 * @returns Environment change effect handler
 */
export const createEnvironmentChangeHandler =
  ({ form, sourceType, envContext, httpOptionsRef, log }: EnvironmentChangeHandlerParams) =>
  () => {
    // Only handle changes for HTTP sources when environments are ready
    if (!form || sourceType !== 'http' || !envContext.environmentsReady) return;

    // Small delay to ensure environment state is fully updated
    setTimeout(() => {
      // Get all form values to check for environment variables
      const values = form.getFieldsValue();
      const fieldsToValidate = [];

      // Check URL for environment variables or TOTP codes
      if (
        values.sourcePath &&
        typeof values.sourcePath === 'string' &&
        (values.sourcePath.includes('{{') || values.sourcePath.includes('[['))
      ) {
        fieldsToValidate.push('sourcePath');
      }

      // Validate fields that contain variables
      if (fieldsToValidate.length > 0) {
        log.debug('[SourceForm] Re-validating URL field after environment change');
        form.validateFields(fieldsToValidate).catch(() => {
          // Ignore validation errors, we just want to update the UI
        });
      }

      // Always trigger HttpOptions validation if it exists
      // HttpOptions will check its own fields for variables
      if (httpOptionsRef.current?.validateFields) {
        log.debug('[SourceForm] Triggering HttpOptions validation after environment change');
        httpOptionsRef.current.validateFields();
      }
    }, 100);
  };

/**
 * Creates TOTP tracking effect handler
 *
 * Factory function that creates a handler for TOTP tracking lifecycle
 * with proper cleanup on component unmount.
 *
 * @param params - Handler parameters
 * @param params.totpEnabled - TOTP enabled state
 * @param params.totpSecret - TOTP secret value
 * @param params.trackTotpSecret - TOTP tracking function
 * @param params.untrackTotpSecret - TOTP untracking function
 * @param params.testSourceId - Test source ID for tracking
 * @returns TOTP tracking effect handler with cleanup
 */
export const createTotpTrackingHandler =
  ({ totpEnabled, totpSecret, trackTotpSecret, untrackTotpSecret, testSourceId }: TotpTrackingHandlerParams) =>
  () => {
    // Track TOTP source when enabled and secret is available
    if (totpEnabled && totpSecret) {
      trackTotpSecret(testSourceId);
    }

    // Return cleanup function for component unmount
    return () => {
      untrackTotpSecret(testSourceId);
    };
  };

/**
 * Gets form initial values
 *
 * Utility function that returns the initial values for the form
 * with sensible defaults for all source types.
 *
 * @returns Initial form values
 *
 * @example
 * const initialValues = getFormInitialValues();
 * // Returns: { sourceType: 'file', sourceMethod: 'GET', ... }
 */
export const getFormInitialValues = () => ({
  sourceType: 'file',
  sourceMethod: 'GET',
  requestOptions: {
    contentType: 'application/json',
  },
});

/**
 * Validates fields containing template variables
 *
 * Utility function that checks if form fields contain template variables
 * and returns a list of fields that need validation.
 *
 * @param values - Form values to check
 * @returns Array of field names that contain template variables
 *
 * @example
 * const fields = getFieldsWithTemplateVariables(formValues);
 * // Returns: ['sourcePath', 'headers.0.value']
 */
export const getFieldsWithTemplateVariables = (values: FormValues): string[] => {
  const fieldsToValidate = [];

  // Check URL for environment variables or TOTP codes
  if (values.sourcePath && (values.sourcePath.includes('{{') || values.sourcePath.includes('[['))) {
    fieldsToValidate.push('sourcePath');
  }

  return fieldsToValidate;
};

/**
 * Generates temporary source ID
 *
 * Utility function that generates a unique temporary source ID
 * for new sources before they are saved.
 *
 * @param prefix - Prefix for the ID (default: 'new-source')
 * @returns Generated temporary source ID
 *
 * @example
 * const tempId = generateTempSourceId();
 * // Returns: "new-source-1640995200000"
 * const testId = generateTempSourceId('test');
 * // Returns: "test-1640995200000"
 */
export const generateTempSourceId = (prefix = 'new-source') => {
  return `${prefix}-${Date.now()}`;
};

/**
 * Creates test source ID from temporary source ID
 *
 * Utility function that creates a test-specific source ID for
 * TOTP tracking during HTTP testing operations.
 *
 * @param tempSourceId - Temporary source ID
 * @returns Test source ID with test prefix
 *
 * @example
 * const testId = createTestSourceId('new-source-123');
 * // Returns: "test-new-source-123"
 */
export const createTestSourceId = (tempSourceId: string): string => {
  return `test-${tempSourceId}`;
};

/**
 * Debounces validation function calls
 *
 * Utility function that debounces validation calls to prevent
 * excessive validation during rapid user input.
 *
 * @param validationFn - Validation function to debounce
 * @param delay - Debounce delay in milliseconds (default: 300)
 * @returns Debounced validation function
 *
 * @example
 * const debouncedValidation = debounceValidation(validateField, 500);
 * debouncedValidation(fieldValue);
 */
export const debounceValidation = (validationFn: (...args: unknown[]) => void, delay = 300) => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  return (...args: unknown[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      validationFn(...args);
    }, delay);
  };
};
