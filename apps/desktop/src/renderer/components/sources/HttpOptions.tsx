/**
 * HttpOptions Component
 *
 * Main component for configuring HTTP requests with comprehensive modular architecture.
 * This component has been fully refactored into a modular design with extracted UI components,
 * utilities, handlers, validation, and testing functionality to improve maintainability.
 *
 * Core Features:
 * - HTTP request configuration with method, headers, query params, and body
 * - Real-time environment variable validation and resolution
 * - TOTP integration with code generation and testing
 * - Auto-refresh configuration with preset and custom intervals
 * - JSON response filtering with path-based extraction
 * - Comprehensive HTTP request testing with formatted response display
 *
 * Architecture:
 * - Modular UI components extracted into separate files
 * - Business logic extracted into specialized utility modules
 * - Clean separation of concerns for better maintainability
 * - Comprehensive prop passing for component composition
 *
 * @component
 * @since 3.0.0
 */

import type { FormInstance } from 'antd';
import { Tabs } from 'antd';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useEnvironments, useTotpState } from '@/renderer/contexts';
import { useWorkspaces } from '@/renderer/hooks/useCentralizedWorkspace';
import { useHttp } from '@/renderer/hooks/useHttp';
import type { TestResponseContent } from '@/types/http';

// Import extracted modules and components
import {
  // Configuration functions
  createContentTypeHandler,
  createCustomIntervalHandler,
  createEnvironmentChangeEffect,
  // Testing functions
  createHttpTestHandler,
  createImperativeHandleMethods,
  createJsonFilterToggleHandler,
  createPresetIntervalHandler,
  createRefreshToggleHandler,
  createRefreshTypeHandler,
  createTotpCodeGenerator,
  createTotpSecretHandler,
  // Utility functions
  createTotpStateHelper,
  createTotpTestHandler,
  createTotpTimerEffect,
  createTotpToggleHandler,
  createTotpTrackingEffect,
  HttpBodyTab,
  // UI Components
  HttpHeadersTab,
  HttpOptionsTab,
  HttpQueryParamsTab,
  initializeFormStructure,
  ResponsePreviewCard,
  // Validation functions
  validateVariableExists,
} from './http-options';

interface HttpOptionsProps {
  form: FormInstance;
  sourceId: string;
  onTestResponse?: (response: string) => void;
  onTotpChange?: (enabled: boolean, secret: string) => void;
  initialTotpEnabled?: boolean;
  initialTotpSecret?: string;
  onTestingChange?: (testing: boolean) => void;
}

const HttpOptions = forwardRef(
  (
    {
      form,
      sourceId,
      onTestResponse,
      onTotpChange,
      initialTotpEnabled,
      initialTotpSecret,
      onTestingChange,
    }: HttpOptionsProps,
    ref,
  ) => {
    // Get contexts
    const envContext = useEnvironments();
    const { activeWorkspaceId } = useWorkspaces();
    const http = useHttp();
    const { canUseTotpSecret, getCooldownSeconds, trackTotpSecret, untrackTotpSecret } = useTotpState();

    // Component state
    const [contentType, setContentType] = useState('application/json');
    const [testResponseVisible, setTestResponseVisible] = useState(false);
    const [testResponseContent, setTestResponseContent] = useState<TestResponseContent | null>(null);
    const [_testing, setTesting] = useState(false);
    const [, setRawResponse] = useState<string | null>(null);

    // Source IDs
    const effectiveSourceId = sourceId || `temp-${Date.now()}`;
    const testSourceId = `test-${effectiveSourceId}`;

    // JSON filter state
    const [jsonFilterEnabled, setJsonFilterEnabled] = useState(false);
    const jsonFilterEnabledRef = useRef(false);
    const jsonFilterPathRef = useRef('');

    // Refresh state
    const [refreshEnabled, setRefreshEnabled] = useState(false);
    const [refreshType, setRefreshType] = useState('preset');
    const [customInterval, setCustomInterval] = useState(15);
    const refreshEnabledRef = useRef(false);
    const refreshTypeRef = useRef('preset');
    const customIntervalRef = useRef(15);

    // TOTP state
    const [totpCode, setTotpCode] = useState('------');
    const [totpError, setTotpError] = useState<string | null>(null);
    const [totpTesting, setTotpTesting] = useState(false);
    const [totpPreviewVisible, setTotpPreviewVisible] = useState(false);
    const [timeRemaining, setTimeRemaining] = useState(30);

    // Form initialization
    const [isFormInitialized, setIsFormInitialized] = useState(false);
    const isFormInitializedRef = useRef(false);
    const notifyParentRef = useRef(onTotpChange);
    const lastNotifiedRef = useRef({ enabled: false, secret: '' });

    // Create helper functions
    const getTotpStateFromForm = createTotpStateHelper(form);

    const validateVariableExistsCallback = useCallback(
      (value: string) => {
        return validateVariableExists(value, envContext, form);
      },
      [envContext, form],
    );

    // Create handlers
    const handleContentTypeChange = createContentTypeHandler({ setContentType, form });
    const handleRefreshToggle = createRefreshToggleHandler({
      setRefreshEnabled,
      refreshEnabledRef,
      customIntervalRef,
      refreshTypeRef,
      form,
    });
    const handleRefreshTypeChange = createRefreshTypeHandler({
      setRefreshType,
      refreshTypeRef,
      setCustomInterval,
      customIntervalRef,
      refreshEnabledRef,
      form,
    });
    const handleCustomIntervalChange = createCustomIntervalHandler({
      setCustomInterval,
      customIntervalRef,
      refreshEnabledRef,
      form,
    });
    const handlePresetIntervalChange = createPresetIntervalHandler({
      setCustomInterval,
      customIntervalRef,
      refreshEnabledRef,
      form,
    });
    const handleJsonFilterToggle = createJsonFilterToggleHandler({
      setJsonFilterEnabled,
      jsonFilterEnabledRef,
      jsonFilterPathRef,
      form,
    });
    const handleTotpToggle = createTotpToggleHandler({
      setTotpPreviewVisible,
      setTotpError,
      form,
    });
    const handleTotpSecretChange = createTotpSecretHandler({
      setTotpPreviewVisible,
      setTotpError,
      form,
    });

    // TOTP functions
    const generateTotpCode = createTotpCodeGenerator({
      getTotpStateFromForm,
      setTotpError,
      setTotpTesting,
      setTotpCode,
    });

    const handleTestTotp = createTotpTestHandler({
      getTotpStateFromForm,
      validateVariableExists: validateVariableExistsCallback,
      setTotpError,
      setTotpCode,
      setTotpPreviewVisible,
      generateTotpCode,
    });

    const handleTestRequest = createHttpTestHandler({
      form,
      getTotpStateFromForm,
      envContext,
      http,
      setTesting,
      onTestingChange,
      setTestResponseContent,
      setTestResponseVisible,
      setRawResponse,
      onTestResponse,
      effectiveSourceId,
      testSourceId,
      workspaceId: activeWorkspaceId,
    });

    const imperativeHandleMethods = createImperativeHandleMethods({
      form,
      getTotpStateFromForm,
      isFormInitializedRef,
    });

    // Effects
    useEffect(() => {
      notifyParentRef.current = onTotpChange;
    }, [onTotpChange]);

    const handleEnvironmentChange = createEnvironmentChangeEffect({
      form,
      envContext,
      isFormInitializedRef,
    });
    useEffect(handleEnvironmentChange, [handleEnvironmentChange]);

    const totpTimerEffect = createTotpTimerEffect({
      totpPreviewVisible,
      setTimeRemaining,
      generateTotpCode,
    });
    useEffect(totpTimerEffect, [totpTimerEffect]);

    const totpTrackingEffect = createTotpTrackingEffect({
      getTotpStateFromForm,
      testSourceId,
      trackTotpSecret,
      untrackTotpSecret,
    });
    useEffect(totpTrackingEffect, [totpTrackingEffect]);

    // Form initialization
    useEffect(() => {
      if (isFormInitialized) return;
      initializeFormStructure(
        form,
        setContentType,
        setJsonFilterEnabled,
        jsonFilterEnabledRef,
        jsonFilterPathRef,
        setRefreshEnabled,
        refreshEnabledRef,
        setRefreshType,
        refreshTypeRef,
        setCustomInterval,
        customIntervalRef,
      );
      setIsFormInitialized(true);
      isFormInitializedRef.current = true;
    }, [form, isFormInitialized]);

    // Initialize from props
    useEffect(() => {
      if (initialTotpEnabled !== undefined && initialTotpSecret) {
        form.setFieldsValue({
          enableTOTP: initialTotpEnabled,
          totpSecret: initialTotpSecret,
        });
        const currentRequestOptions = form.getFieldValue('requestOptions') || {};
        if (initialTotpEnabled && initialTotpSecret) {
          form.setFieldsValue({
            requestOptions: { ...currentRequestOptions, totpSecret: initialTotpSecret },
          });
        }
      }
    }, [initialTotpEnabled, initialTotpSecret, form]);

    // Parent notification
    useEffect(() => {
      if (!notifyParentRef.current || !isFormInitializedRef.current) return;
      const { enabled, secret } = getTotpStateFromForm();
      if (lastNotifiedRef.current.enabled !== enabled || lastNotifiedRef.current.secret !== secret) {
        notifyParentRef.current(enabled, secret);
        lastNotifiedRef.current = { enabled, secret };
      }
    }, [getTotpStateFromForm]);

    // Imperative handle
    useImperativeHandle(ref, () => ({
      ...imperativeHandleMethods,
      getJsonFilterState: () => {
        const jsonFilter = form.getFieldValue('jsonFilter');
        return {
          enabled: Boolean(jsonFilter?.enabled === true || jsonFilterEnabled === true),
          path: jsonFilter?.enabled === true || jsonFilterEnabled === true ? (jsonFilter?.path || '').trim() : '',
        };
      },
      forceJsonFilterState: (enabled: boolean, path: string) => {
        const normalizedEnabled = Boolean(enabled);
        const normalizedPath = normalizedEnabled ? path || '' : '';
        setJsonFilterEnabled(normalizedEnabled);
        jsonFilterEnabledRef.current = normalizedEnabled;
        if (path) jsonFilterPathRef.current = path;
        form.setFieldsValue({
          jsonFilter: { enabled: normalizedEnabled, path: normalizedPath },
        });
        return true;
      },
      handleTestRequest: handleTestRequest,
      handleTestRequestWithParams: (
        sourcePath: string,
        sourceMethod: string,
        progressCallback: (current: number, total: number) => void,
        cleanupCallback: () => void,
      ) => handleTestRequest(sourcePath, sourceMethod, progressCallback, cleanupCallback),
    }));

    return (
      <div className="http-options">
        <Tabs
          defaultActiveKey="options"
          type="card"
          size="small"
          style={{ marginBottom: 10 }}
          items={[
            {
              key: 'headers',
              label: 'Headers',
              children: <HttpHeadersTab validateVariableExists={validateVariableExistsCallback} />,
            },
            {
              key: 'queryParams',
              label: 'Query Params',
              children: <HttpQueryParamsTab validateVariableExists={validateVariableExistsCallback} />,
            },
            {
              key: 'body',
              label: 'Body',
              children: (
                <HttpBodyTab
                  contentType={contentType}
                  handleContentTypeChange={handleContentTypeChange}
                  validateVariableExists={validateVariableExistsCallback}
                />
              ),
            },
            {
              key: 'options',
              label: 'Options',
              children: (
                <HttpOptionsTab
                  jsonFilterEnabled={jsonFilterEnabled}
                  handleJsonFilterToggle={handleJsonFilterToggle}
                  validateVariableExists={validateVariableExistsCallback}
                  form={form}
                  handleTotpToggle={handleTotpToggle}
                  handleTotpSecretChange={handleTotpSecretChange}
                  handleTestTotp={handleTestTotp}
                  totpError={totpError}
                  totpTesting={totpTesting}
                  totpPreviewVisible={totpPreviewVisible}
                  totpCode={totpCode}
                  timeRemaining={timeRemaining}
                  testSourceId={testSourceId}
                  canUseTotpSecret={canUseTotpSecret}
                  getCooldownSeconds={getCooldownSeconds}
                  refreshEnabled={refreshEnabled}
                  handleRefreshToggle={handleRefreshToggle}
                  refreshType={refreshType}
                  handleRefreshTypeChange={handleRefreshTypeChange}
                  customInterval={customInterval}
                  handlePresetIntervalChange={handlePresetIntervalChange}
                  handleCustomIntervalChange={handleCustomIntervalChange}
                />
              ),
            },
          ]}
        />

        <ResponsePreviewCard testResponseVisible={testResponseVisible} testResponseContent={testResponseContent} />
      </div>
    );
  },
);

export default HttpOptions;
