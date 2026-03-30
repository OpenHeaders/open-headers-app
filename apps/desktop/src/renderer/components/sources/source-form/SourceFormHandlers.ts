/**
 * Source Form Handlers
 *
 * Event handlers and business logic for source form operations including
 * form submission, field changes, file browsing, and HTTP testing.
 *
 * Handler Categories:
 * - Form submission with comprehensive validation
 * - Source type change handling with state cleanup
 * - File selection and browsing for file sources
 * - TOTP state management and tracking
 * - Test response handling for HTTP sources
 *
 * Handler Features:
 * - Comprehensive error handling with user feedback
 * - State cleanup and form reset on type changes
 * - Integration with external services (file system, TOTP)
 * - Loading state management for async operations
 *
 * @module SourceFormHandlers
 * @since 3.0.0
 */

import type {
  JsonFilter,
  NewSourceData,
  RefreshOptions,
  SourceMethod,
  SourceRequestOptions,
  SourceType,
} from '@openheaders/core';
import type { RefObject } from 'react';
import type { FormInstance } from 'antd';
import { showMessage } from '@/renderer/utils/ui/messageUtil';
import type { EnvironmentContextLike } from '@/types/http';
import { validateAllHttpFields } from './SourceFormValidation';

interface SourceTypeChangeParams {
  setSourceType: (value: SourceType) => void;
  setFilePath: (path: string) => void;
  setTotpEnabled: (enabled: boolean) => void;
  setTotpSecret: (secret: string) => void;
  untrackTotpSecret: (sourceId: string) => void;
  form: FormInstance;
  testSourceId: string;
}

interface FileBrowseParams {
  fileSystem: { selectFile: () => Promise<string | null> };
  setFilePath: (path: string) => void;
  form: FormInstance;
}

interface TotpChangeParams {
  setTotpEnabled: (enabled: boolean) => void;
  setTotpSecret: (secret: string) => void;
}

interface HttpOptionsRef {
  forceTotpState?: (enabled: boolean, secret: string) => void;
}

interface SourceFormValues {
  sourceType: SourceType;
  sourcePath: string;
  sourceMethod?: SourceMethod;
  sourceTag?: string;
  requestOptions?: SourceRequestOptions;
  jsonFilter?: JsonFilter;
  refreshOptions?: RefreshOptions;
}

interface FormSubmissionParams {
  setSubmitting: (submitting: boolean) => void;
  form: FormInstance;
  envContext: EnvironmentContextLike;
  onAddSource: (sourceData: NewSourceData) => Promise<boolean>;
  untrackTotpSecret: (sourceId: string) => void;
  testSourceId: string;
  refs: {
    httpOptionsRef: RefObject<HttpOptionsRef | null>;
    tempSourceIdRef: RefObject<string>;
  };
  stateSetters: {
    setFilePath: (path: string) => void;
    setTotpEnabled: (enabled: boolean) => void;
    setTotpSecret: (secret: string) => void;
    setSourceType: (type: SourceType) => void;
  };
  log: { debug: (message: string, data?: unknown) => void; error: (message: string, data?: unknown) => void };
}

interface SuccessfulSubmissionParams {
  untrackTotpSecret: (sourceId: string) => void;
  testSourceId: string;
  form: FormInstance;
  refs: {
    httpOptionsRef: RefObject<HttpOptionsRef | null>;
    tempSourceIdRef: RefObject<string>;
  };
  stateSetters: {
    setFilePath: (path: string) => void;
    setTotpEnabled: (enabled: boolean) => void;
    setTotpSecret: (secret: string) => void;
    setSourceType: (type: SourceType) => void;
  };
}

/**
 * Creates source type change handler
 *
 * Factory function that creates a handler for source type changes with
 * proper state cleanup and form field reset.
 *
 * @param params - Handler parameters
 * @param params.setSourceType - Source type state setter
 * @param params.setFilePath - File path state setter
 * @param params.setTotpEnabled - TOTP enabled state setter
 * @param params.setTotpSecret - TOTP secret state setter
 * @param params.untrackTotpSecret - TOTP untracking function
 * @param params.form - Form instance
 * @param params.testSourceId - Test source ID for TOTP tracking
 * @returns Source type change handler
 */
export const createSourceTypeChangeHandler =
  ({
    setSourceType,
    setFilePath,
    setTotpEnabled,
    setTotpSecret,
    untrackTotpSecret,
    form,
    testSourceId,
  }: SourceTypeChangeParams) =>
  (value: SourceType) => {
    // Update source type state
    setSourceType(value);

    // Reset related state
    setFilePath('');

    // Reset form fields that are specific to source type
    form.resetFields(['sourcePath', 'sourceTag']);

    // Reset TOTP state when switching away from HTTP
    if (value !== 'http') {
      setTotpEnabled(false);
      setTotpSecret('');
      // Untrack the TOTP source
      untrackTotpSecret(testSourceId);
    }
  };

/**
 * Creates file browse handler
 *
 * Factory function that creates a handler for file browsing operations
 * with error handling and form field updates.
 *
 * @param params - Handler parameters
 * @param params.fileSystem - File system service
 * @param params.setFilePath - File path state setter
 * @param params.form - Form instance
 * @returns File browse handler
 */
export const createFileBrowseHandler =
  ({ fileSystem, setFilePath, form }: FileBrowseParams) =>
  async () => {
    try {
      // Open file selection dialog
      const selectedPath = await fileSystem.selectFile();
      if (selectedPath) {
        // Update state and form field
        setFilePath(selectedPath);
        form.setFieldsValue({ sourcePath: selectedPath });
      }
    } catch (error) {
      showMessage('error', `Failed to select file: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

/**
 * Creates TOTP change handler
 *
 * Factory function that creates a handler for TOTP configuration changes
 * from the HttpOptions component.
 *
 * @param params - Handler parameters
 * @param params.setTotpEnabled - TOTP enabled state setter
 * @param params.setTotpSecret - TOTP secret state setter
 * @returns TOTP change handler
 */
export const createTotpChangeHandler =
  ({ setTotpEnabled, setTotpSecret }: TotpChangeParams) =>
  (enabled: boolean, secret: string) => {
    setTotpEnabled(enabled);
    setTotpSecret(secret);
  };

/**
 * Creates test response handler
 *
 * Factory function that creates a handler for HTTP test responses
 * with basic logging for debugging purposes.
 *
 * @returns Test response handler
 */
export const createTestResponseHandler = () => (response: unknown) => {
  // Test response is handled by HttpOptions component
  // This callback exists for potential future use and debugging
  console.debug('Test response received:', response);
};

/**
 * Creates form submission handler
 *
 * Factory function that creates a comprehensive form submission handler
 * with validation, data preparation, and error handling.
 *
 * @param params - Handler parameters
 * @param params.setSubmitting - Submitting state setter
 * @param params.form - Form instance
 * @param params.envContext - Environment context
 * @param params.onAddSource - Source addition callback
 * @param params.untrackTotpSecret - TOTP untracking function
 * @param params.testSourceId - Test source ID for TOTP tracking
 * @param params.refs - Ref objects for form components
 * @param params.stateSetters - State setter functions
 * @param params.log - Logger instance
 * @returns Form submission handler
 */
export const createFormSubmissionHandler =
  ({
    setSubmitting,
    form,
    envContext,
    onAddSource,
    untrackTotpSecret,
    testSourceId,
    refs,
    stateSetters,
    log,
  }: FormSubmissionParams) =>
  async (values: SourceFormValues) => {
    try {
      setSubmitting(true);

      // Check if JSON filter is enabled but missing a path
      if (values.jsonFilter?.enabled && !values.jsonFilter?.path) {
        form.setFields([
          {
            name: ['jsonFilter', 'path'],
            errors: ['JSON path is required when filter is enabled'],
          },
        ]);
        showMessage('error', 'JSON filter is enabled but no path is specified');
        setSubmitting(false);
        return;
      }

      // For HTTP sources, validate all fields that might contain template variables
      if (values.sourceType === 'http') {
        const validationError = validateAllHttpFields(form, values, envContext);
        if (validationError) {
          showMessage('error', validationError.message);
          setSubmitting(false);
          return;
        }
      }

      // Prepare source data with type-specific processing
      const sourceData = prepareSourceData(values, form, log);

      // Call parent handler to add source
      const success = await onAddSource(sourceData);

      if (success) {
        // Clean up and reset form on successful submission
        await handleSuccessfulSubmission({
          untrackTotpSecret,
          testSourceId,
          form,
          refs,
          stateSetters,
        });
      }
    } catch (error) {
      showMessage('error', `Failed to add source: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSubmitting(false);
    }
  };

/**
 * Prepares source data for submission
 *
 * Transforms form values into the appropriate source data structure
 * with type-specific processing and data validation.
 *
 * @param values - Form values
 * @param form - Form instance
 * @param log - Logger instance
 * @returns Prepared source data
 */
const prepareSourceData = (
  values: SourceFormValues,
  form: FormInstance,
  log: { debug: (message: string, data?: unknown) => void },
): NewSourceData => {
  // Prepare basic source data
  const sourceData: NewSourceData = {
    sourceType: values.sourceType,
    sourcePath: values.sourcePath,
    sourceTag: values.sourceTag || '',
  };

  // Add HTTP-specific properties
  if (values.sourceType === 'http') {
    sourceData.sourceMethod = values.sourceMethod || 'GET';

    // Make a deep copy of request options to avoid reference issues
    const requestOptions: SourceRequestOptions = JSON.parse(JSON.stringify(values.requestOptions || {}));

    // Ensure TOTP secret is preserved from form if not already present
    if (!requestOptions.totpSecret) {
      const formRequestOptions = form.getFieldValue('requestOptions');
      if (formRequestOptions?.totpSecret) {
        requestOptions.totpSecret = formRequestOptions.totpSecret;
        log.debug('[SourceForm] Added TOTP secret from form requestOptions');
      }
    }

    // Ensure required arrays are initialized
    if (!requestOptions.headers) {
      requestOptions.headers = [];
    }

    if (!requestOptions.queryParams) {
      requestOptions.queryParams = [];
    }

    sourceData.requestOptions = requestOptions;

    // Add form-specific configurations
    sourceData.jsonFilter = values.jsonFilter || { enabled: false };
    sourceData.refreshOptions = values.refreshOptions || { enabled: false };

    // Mark source as needing initial fetch
    sourceData.needsInitialFetch = true;

    // Ensure URL has protocol
    if (!sourceData.sourcePath.match(/^https?:\/\//i)) {
      sourceData.sourcePath = `https://${sourceData.sourcePath}`;
    }
  }

  return sourceData;
};

/**
 * Handles successful form submission cleanup
 *
 * Performs cleanup operations after successful source addition including
 * form reset, state cleanup, and component resets.
 *
 * @param params - Cleanup parameters
 * @param params.untrackTotpSecret - TOTP untracking function
 * @param params.testSourceId - Test source ID
 * @param params.form - Form instance
 * @param params.refs - Component refs
 * @param params.stateSetters - State setter functions
 */
const handleSuccessfulSubmission = async ({
  untrackTotpSecret,
  testSourceId,
  form,
  refs,
  stateSetters,
}: SuccessfulSubmissionParams) => {
  // Untrack TOTP source before resetting
  untrackTotpSecret(testSourceId);

  // Reset form and state
  form.resetFields();
  stateSetters.setFilePath('');
  stateSetters.setTotpEnabled(false);
  stateSetters.setTotpSecret('');

  // Reset source type to default
  stateSetters.setSourceType('file');

  // Force reset HttpOptions if it exists
  if (refs.httpOptionsRef.current?.forceTotpState) {
    refs.httpOptionsRef.current.forceTotpState(false, '');
  }

  // Generate new temporary sourceId for next use
  refs.tempSourceIdRef.current = `new-source-${Date.now()}`;
};
