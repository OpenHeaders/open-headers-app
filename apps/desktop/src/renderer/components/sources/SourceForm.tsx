/**
 * SourceForm Component
 *
 * Main component for adding new sources with comprehensive form handling and validation.
 * This component has been refactored into a modular architecture with extracted utilities,
 * handlers, and field components to improve maintainability and code organization.
 *
 * Core Features:
 * - Multi-source type support (HTTP, file, environment)
 * - Real-time environment variable validation
 * - TOTP integration with HttpOptions component
 * - Sticky header for improved UX during long forms
 * - Comprehensive form validation with detailed error messages
 *
 * Architecture:
 * - Modular design with extracted utilities and handlers
 * - Integration with environment context for variable resolution
 * - TOTP state management with proper tracking and cleanup
 * - File system integration for file source browsing
 *
 * Dependencies:
 * - source-form package: Contains all extracted utilities and handlers
 * - Environment context: Provides variable resolution and change detection
 * - TOTP context: Handles TOTP secret tracking and validation
 * - HttpOptions: Manages HTTP-specific configuration and testing
 *
 * @component
 * @since 3.0.0
 */

import type { SourceType } from '@openheaders/core';
import { Button, Card, Col, Form, Input, Row, Select } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useEnvironments, useTotpState } from '@/renderer/contexts';
import { useFileSystem } from '@/renderer/hooks/useFileSystem';
import { createLogger } from '@/renderer/utils/error-handling/logger';
import HttpOptions from './HttpOptions';
import type { NewSourceData } from './source-form';
// Import extracted modules from source-form package
import {
  AddSourceButton,
  createFileBrowseHandler,
  createFormSubmissionHandler,
  createSourceTypeChangeHandler,
  createTestResponseHandler,
  createTestSourceId,
  createTotpChangeHandler,
  generateTempSourceId,
  getFormInitialValues,
  getSourcePathLabel,
  getSourcePathValidationMessage,
  SourcePathField,
  StickyHeader,
  validateUrlField,
} from './source-form';

const log = createLogger('SourceForm');

/**
 * SourceForm component for adding new sources with modular architecture
 *
 * Provides a comprehensive form interface for creating different types of sources
 * with proper validation, error handling, and user experience optimizations.
 *
 *  props - Component props
 *  props.onAddSource - Callback function for adding new sources
 *  Source form component
 */
interface SourceFormProps {
  onAddSource: (sourceData: NewSourceData) => Promise<boolean>;
}
const SourceForm = ({ onAddSource }: SourceFormProps) => {
  // Form and component state
  const [form] = Form.useForm();
  const [sourceType, setSourceType] = useState<SourceType>('file');
  const [filePath, setFilePath] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testProgress, setTestProgress] = useState<{ attempt: number; maxAttempts: number; startTime: number } | null>(
    null,
  );
  const [isSticky, setIsSticky] = useState(false);
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [totpSecret, setTotpSecret] = useState('');

  // Component refs for DOM access and external component interaction
  const formCardRef = useRef(null);
  const httpOptionsRef = useRef<{
    handleTestRequestWithParams?: (
      sourcePath: string,
      sourceMethod: string,
      progressCallback: (progress: number, maxAttempts: number) => void,
      cleanupCallback: () => void,
    ) => void;
    forceTotpState?: (enabled: boolean, secret: string) => void;
    validateFields?: () => void;
  } | null>(null);
  const tempSourceIdRef = useRef(generateTempSourceId());

  // External service hooks
  const fileSystem = useFileSystem();
  const { trackTotpSecret, untrackTotpSecret, getCooldownSeconds } = useTotpState();
  const envContext = useEnvironments();

  // Generate test source ID for TOTP tracking during HTTP testing
  const testSourceId = createTestSourceId(tempSourceIdRef.current);

  // Create event handlers using extracted factory functions
  const handleSourceTypeChange = createSourceTypeChangeHandler({
    setSourceType,
    setFilePath,
    setTotpEnabled,
    setTotpSecret,
    untrackTotpSecret,
    form,
    testSourceId,
  });

  const handleBrowse = createFileBrowseHandler({
    fileSystem,
    setFilePath,
    form,
  });

  const handleTotpChange = createTotpChangeHandler({
    setTotpEnabled,
    setTotpSecret,
  });

  const handleTestResponse = createTestResponseHandler();

  const handleSubmit = createFormSubmissionHandler({
    setSubmitting,
    form,
    envContext,
    onAddSource,
    untrackTotpSecret,
    testSourceId,
    refs: {
      httpOptionsRef,
      tempSourceIdRef,
    },
    stateSetters: {
      setFilePath,
      setTotpEnabled,
      setTotpSecret,
      setSourceType,
    },
    log,
  });

  // Setup scroll event listener for sticky header behavior
  const isStickyRef = useRef(isSticky);
  isStickyRef.current = isSticky;

  useEffect(() => {
    const headerHeight = 64;
    const onScroll = () => {
      if (!formCardRef.current) return;
      const formCardTop = (formCardRef.current as HTMLElement).getBoundingClientRect().top;
      if (formCardTop <= headerHeight && !isStickyRef.current) {
        setIsSticky(true);
      } else if (formCardTop > headerHeight && isStickyRef.current) {
        setIsSticky(false);
      }
    };
    window.addEventListener('scroll', onScroll);
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Handle environment changes with form validation
  useEffect(() => {
    if (!form || sourceType !== 'http' || !envContext.environmentsReady) return;

    setTimeout(() => {
      const values = form.getFieldsValue();
      const fieldsToValidate: string[] = [];

      if (
        values.sourcePath &&
        typeof values.sourcePath === 'string' &&
        (values.sourcePath.includes('{{') || values.sourcePath.includes('[['))
      ) {
        fieldsToValidate.push('sourcePath');
      }

      if (fieldsToValidate.length > 0) {
        log.debug('[SourceForm] Re-validating URL field after environment change');
        form.validateFields(fieldsToValidate).catch(() => {});
      }

      if (httpOptionsRef.current?.validateFields) {
        log.debug('[SourceForm] Triggering HttpOptions validation after environment change');
        httpOptionsRef.current.validateFields();
      }
    }, 100);
  }, [form, sourceType, envContext.environmentsReady]);

  // Handle TOTP tracking lifecycle
  useEffect(() => {
    if (totpEnabled && totpSecret) {
      trackTotpSecret(testSourceId);
    }
    return () => {
      untrackTotpSecret(testSourceId);
    };
  }, [totpEnabled, totpSecret, testSourceId, trackTotpSecret, untrackTotpSecret]);

  // Create URL field validator with context dependencies
  const validateUrl = (rule: unknown, value: string) => validateUrlField(rule, value, sourceType, envContext, form);

  // Render add source button with current state
  const renderAddButton = () => (
    <AddSourceButton submitting={submitting} testing={testing} onSubmit={() => form.submit()} />
  );

  // Helper function to render test button content
  const renderTestButtonContent = () => {
    if (!testing) {
      return 'Test Request';
    }
    if (!testProgress) {
      return 'Testing...';
    }

    if (testProgress.attempt === 0 || testProgress.attempt === 1) {
      return (
        <>
          <span style={{ fontSize: '11px', marginRight: '6px', color: '#52c41a' }}>•</span>
          Connecting...
        </>
      );
    }

    // For retries: Show current retry number, capped at maxRetries
    const maxRetries = Math.max(1, testProgress.maxAttempts - 1); // At least 1 retry
    const currentRetry = Math.max(1, Math.min(testProgress.attempt - 1, maxRetries));

    return (
      <>
        <span style={{ fontSize: '11px', marginRight: '6px', color: '#fa8c16' }}>
          Retry {currentRetry}/{maxRetries}
        </span>
        Retrying...
      </>
    );
  };

  return (
    <>
      {/* Sticky header that shows when scrolled */}
      <StickyHeader isVisible={isSticky} addButton={renderAddButton()} />

      {/* Main form card */}
      <Card title="Add Source" className="source-form-card" size="small" ref={formCardRef}>
        <Form form={form} layout="vertical" onFinish={handleSubmit} initialValues={getFormInitialValues()} size="small">
          {/* Common source fields in a compact row */}
          <Row gutter={16}>
            <Col span={4}>
              <Form.Item label="Source Type" name="sourceType" rules={[{ required: true }]}>
                <Select
                  onChange={handleSourceTypeChange}
                  size="small"
                  options={[
                    { value: 'file', label: 'File' },
                    { value: 'env', label: 'Environment Variable' },
                    { value: 'http', label: 'HTTP Request' },
                  ]}
                />
              </Form.Item>
            </Col>
            {sourceType === 'http' && (
              <Col span={3}>
                <Form.Item label="Method" name="sourceMethod" rules={[{ required: true }]}>
                  <Select
                    size="small"
                    options={[
                      { value: 'GET', label: 'GET' },
                      { value: 'POST', label: 'POST' },
                      { value: 'PUT', label: 'PUT' },
                      { value: 'DELETE', label: 'DELETE' },
                      { value: 'PATCH', label: 'PATCH' },
                    ]}
                  />
                </Form.Item>
              </Col>
            )}
            <Col span={sourceType === 'http' ? 11 : 14}>
              <Form.Item
                label={getSourcePathLabel(sourceType)}
                name="sourcePath"
                rules={[
                  {
                    required: true,
                    message: getSourcePathValidationMessage(sourceType),
                  },
                  { validator: validateUrl },
                ]}
              >
                <SourcePathField sourceType={sourceType} filePath={filePath} onBrowse={handleBrowse} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="Tag (optional)" name="sourceTag">
                <Input placeholder="Enter a tag" size="small" />
              </Form.Item>
            </Col>
          </Row>

          {/* Centralized Action Bar */}
          <div
            style={{
              marginTop: '16px',
              padding: '12px 0',
              borderTop: '1px solid #f0f0f0',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            {sourceType === 'http' ? (
              // HTTP sources: Show Test Request and Add Source in a row
              <>
                <Form.Item
                  noStyle
                  shouldUpdate={(prevValues, currentValues) =>
                    prevValues.enableTOTP !== currentValues.enableTOTP ||
                    prevValues.totpSecret !== currentValues.totpSecret
                  }
                >
                  {({ getFieldValue }) => {
                    const isEnabled = getFieldValue('enableTOTP');
                    const secret = getFieldValue('totpSecret');
                    const cooldownSeconds = getCooldownSeconds(testSourceId);
                    const hasCooldown = isEnabled && secret && cooldownSeconds > 0;

                    return (
                      <Button
                        type="default"
                        onClick={async (e) => {
                          e.preventDefault();
                          e.stopPropagation();

                          // First validate the URL field
                          try {
                            await form.validateFields(['sourcePath']);
                          } catch (_validationError) {
                            // URL validation failed - error will be shown in the form
                            return;
                          }

                          if (httpOptionsRef.current?.handleTestRequestWithParams) {
                            const values = form.getFieldsValue();

                            // Setup progress tracking
                            const startTime = Date.now();
                            setTestProgress({ attempt: 0, maxAttempts: 0, startTime });

                            const progressCallback = (attempt: number, maxAttempts: number) => {
                              setTestProgress({ attempt, maxAttempts, startTime });
                            };

                            const cleanupCallback = () => {
                              setTestProgress(null);
                            };

                            httpOptionsRef.current.handleTestRequestWithParams(
                              values.sourcePath,
                              values.sourceMethod,
                              progressCallback,
                              cleanupCallback,
                            );
                          }
                        }}
                        loading={testing || hasCooldown}
                        disabled={hasCooldown}
                        size="middle"
                        style={{
                          minWidth: '110px',
                          height: '32px',
                        }}
                      >
                        {renderTestButtonContent()}
                      </Button>
                    );
                  }}
                </Form.Item>

                <div style={{ height: '20px', width: '1px', background: '#d9d9d9' }} />

                <AddSourceButton
                  submitting={submitting}
                  testing={testing}
                  onSubmit={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    form.submit();
                  }}
                />
              </>
            ) : (
              // Non-HTTP sources: Show just the Add Source button, prominently centered
              <AddSourceButton
                submitting={submitting}
                testing={testing}
                onSubmit={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  form.submit();
                }}
              />
            )}
          </div>

          {/* HTTP-specific options */}
          {sourceType === 'http' && (
            <Form.Item name="httpOptions" style={{ marginBottom: 0, marginTop: '8px' }}>
              <HttpOptions
                ref={httpOptionsRef}
                form={form}
                sourceId={tempSourceIdRef.current}
                onTestResponse={handleTestResponse}
                onTotpChange={handleTotpChange}
                onTestingChange={setTesting}
                key={sourceType} // Force remount when source type changes
              />
            </Form.Item>
          )}
        </Form>
      </Card>
    </>
  );
};

export default SourceForm;
