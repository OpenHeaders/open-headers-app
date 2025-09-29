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

import { useTotpState, useEnvironments } from '../../contexts';
import React, { useState, useEffect, useRef } from 'react';
import { Card, Form, Select, Input, Row, Col, Button } from 'antd';
import { useFileSystem } from '../../hooks/useFileSystem';
import HttpOptions from './HttpOptions';
import { createLogger } from '../../utils/error-handling/logger';

// Import extracted modules from source-form package
import {
    validateUrlField,
    SourcePathField,
    AddSourceButton,
    StickyHeader,
    getSourcePathLabel,
    getSourcePathValidationMessage,
    createSourceTypeChangeHandler,
    createFileBrowseHandler,
    createTotpChangeHandler,
    createTestResponseHandler,
    createFormSubmissionHandler,
    createScrollHandler,
    setupScrollListener,
    createEnvironmentChangeHandler,
    createTotpTrackingHandler,
    getFormInitialValues,
    generateTempSourceId,
    createTestSourceId
} from './source-form';

const log = createLogger('SourceForm');
const { Option } = Select;

/**
 * SourceForm component for adding new sources with modular architecture
 * 
 * Provides a comprehensive form interface for creating different types of sources
 * with proper validation, error handling, and user experience optimizations.
 * 
 * @param {Object} props - Component props
 * @param {Function} props.onAddSource - Callback function for adding new sources
 * @returns {JSX.Element} Source form component
 */
const SourceForm = ({ onAddSource }) => {
    // Form and component state
    const [form] = Form.useForm();
    const [sourceType, setSourceType] = useState('file');
    const [filePath, setFilePath] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testProgress, setTestProgress] = useState(null); // { attempt: 1, maxAttempts: 3, startTime: Date.now() }
    const [isSticky, setIsSticky] = useState(false);
    const [totpEnabled, setTotpEnabled] = useState(false);
    const [totpSecret, setTotpSecret] = useState('');

    // Component refs for DOM access and external component interaction
    const formCardRef = useRef(null);
    const httpOptionsRef = useRef(null);
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
        testSourceId
    });

    const handleBrowse = createFileBrowseHandler({
        fileSystem,
        setFilePath,
        form
    });

    const handleTotpChange = createTotpChangeHandler({
        setTotpEnabled,
        setTotpSecret
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
            tempSourceIdRef
        },
        stateSetters: {
            setFilePath,
            setTotpEnabled,
            setTotpSecret,
            setSourceType
        },
        log
    });

    // Create scroll handler for sticky header behavior
    const handleScroll = createScrollHandler({
        formCardRef,
        setIsSticky,
        isSticky,
        headerHeight: 64
    });

    // Setup scroll event listener with cleanup
    useEffect(() => {
        return setupScrollListener(handleScroll);
    }, [handleScroll]);

    // Handle environment changes with form validation
    const handleEnvironmentChange = createEnvironmentChangeHandler({
        form,
        sourceType,
        envContext,
        httpOptionsRef,
        log
    });

    useEffect(handleEnvironmentChange, [
        envContext.activeEnvironment, 
        form, 
        sourceType, 
        envContext.environmentsReady
    ]);

    // Handle TOTP tracking lifecycle
    const handleTotpTracking = createTotpTrackingHandler({
        totpEnabled,
        totpSecret,
        trackTotpSecret,
        untrackTotpSecret,
        testSourceId
    });

    useEffect(handleTotpTracking, [
        totpEnabled, 
        totpSecret, 
        trackTotpSecret, 
        untrackTotpSecret, 
        testSourceId
    ]);

    // Create URL field validator with context dependencies
    const validateUrl = (rule, value) => validateUrlField(
        rule, 
        value, 
        sourceType, 
        envContext, 
        form
    );

    // Render add source button with current state
    const renderAddButton = () => (
        <AddSourceButton
            submitting={submitting}
            testing={testing}
            onSubmit={() => form.submit()}
        />
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
                    <span style={{ fontSize: '11px', marginRight: '6px', color: '#52c41a' }}>
                        •
                    </span>
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
            <StickyHeader
                isVisible={isSticky}
                addButton={renderAddButton()}
            />

            {/* Main form card */}
            <Card
                title="Add Source"
                className="source-form-card"
                size="small"
                ref={formCardRef}
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSubmit}
                    initialValues={getFormInitialValues()}
                    size="small"
                >
                    {/* Common source fields in a compact row */}
                    <Row gutter={16}>
                        <Col span={4}>
                            <Form.Item
                                label="Source Type"
                                name="sourceType"
                                rules={[{ required: true }]}
                            >
                                <Select onChange={handleSourceTypeChange} size="small">
                                    <Option value="file">File</Option>
                                    <Option value="env">Environment Variable</Option>
                                    <Option value="http">HTTP Request</Option>
                                </Select>
                            </Form.Item>
                        </Col>
                        {sourceType === 'http' && (
                            <Col span={3}>
                                <Form.Item
                                    label="Method"
                                    name="sourceMethod"
                                    rules={[{ required: true }]}
                                >
                                    <Select size="small">
                                        <Option value="GET">GET</Option>
                                        <Option value="POST">POST</Option>
                                        <Option value="PUT">PUT</Option>
                                        <Option value="DELETE">DELETE</Option>
                                        <Option value="PATCH">PATCH</Option>
                                    </Select>
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
                                        message: getSourcePathValidationMessage(sourceType)
                                    },
                                    { validator: validateUrl }
                                ]}
                            >
                                <SourcePathField
                                    sourceType={sourceType}
                                    filePath={filePath}
                                    onBrowse={handleBrowse}
                                />
                            </Form.Item>
                        </Col>
                        <Col span={6}>
                            <Form.Item
                                label="Tag (optional)"
                                name="sourceTag"
                            >
                                <Input placeholder="Enter a tag" size="small" />
                            </Form.Item>
                        </Col>
                    </Row>

                    {/* Centralized Action Bar */}
                    <div style={{ 
                        marginTop: '16px', 
                        padding: '12px 0', 
                        borderTop: '1px solid #f0f0f0',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: '12px'
                    }}>
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
                                                    } catch (validationError) {
                                                        // URL validation failed - error will be shown in the form
                                                        return;
                                                    }
                                                    
                                                    if (httpOptionsRef.current && httpOptionsRef.current.handleTestRequestWithParams) {
                                                        const values = form.getFieldsValue();
                                                        
                                                        // Setup progress tracking
                                                        const startTime = Date.now();
                                                        setTestProgress({ attempt: 0, maxAttempts: 0, startTime });
                                                        
                                                        const progressCallback = (attempt, maxAttempts) => {
                                                            setTestProgress({ attempt, maxAttempts, startTime });
                                                        };
                                                        
                                                        const cleanupCallback = () => {
                                                            setTestProgress(null);
                                                        };
                                                        
                                                        httpOptionsRef.current.handleTestRequestWithParams(
                                                            values.sourcePath, 
                                                            values.sourceMethod,
                                                            progressCallback,
                                                            cleanupCallback
                                                        );
                                                    }
                                                }}
                                                loading={testing || hasCooldown}
                                                disabled={hasCooldown}
                                                size="middle"
                                                style={{ 
                                                    minWidth: '110px',
                                                    height: '32px'
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
                        <Form.Item
                            name="httpOptions"
                            style={{ marginBottom: 0, marginTop: '8px' }}
                        >
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