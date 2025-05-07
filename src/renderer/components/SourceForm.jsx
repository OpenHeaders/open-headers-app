import React, { useState, useEffect, useRef } from 'react';
import { Card, Form, Select, Input, Button, Row, Col, Divider, Tabs } from 'antd';
import { PlusOutlined, LoadingOutlined } from '@ant-design/icons';
import { useFileSystem } from '../hooks/useFileSystem';
import HttpOptions from './HttpOptions';
import { showMessage } from '../utils/messageUtil';

const { Option } = Select;

/**
 * SourceForm component for adding new sources with compact layout only
 */
const SourceForm = ({ onAddSource }) => {
    const [form] = Form.useForm();
    const [sourceType, setSourceType] = useState('file');
    const [filePath, setFilePath] = useState('');
    const [testResponse, setTestResponse] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [isSticky, setIsSticky] = useState(false);
    const [testResponseHeaders, setTestResponseHeaders] = useState(null);
    const [totpEnabled, setTotpEnabled] = useState(false);
    const [totpSecret, setTotpSecret] = useState('');

    const formCardRef = useRef(null);
    const fileSystem = useFileSystem();

    // Handle TOTP changes from HttpOptions
    const handleTotpChange = (enabled, secret) => {
        setTotpEnabled(enabled);
        setTotpSecret(secret);
        console.log("SourceForm updated TOTP state:", enabled, secret);
    };

    // Setup scroll event listener to detect when to make header sticky
    useEffect(() => {
        const handleScroll = () => {
            if (!formCardRef.current) return;

            const formCardTop = formCardRef.current.getBoundingClientRect().top;
            const headerHeight = 64; // App header height

            // Header should become sticky when the form card reaches the app header
            if (formCardTop <= headerHeight && !isSticky) {
                setIsSticky(true);
            } else if (formCardTop > headerHeight && isSticky) {
                setIsSticky(false);
            }
        };

        window.addEventListener('scroll', handleScroll);

        // Run once to check initial position
        handleScroll();

        return () => {
            window.removeEventListener('scroll', handleScroll);
        };
    }, [isSticky]);

    // Handle source type change
    const handleSourceTypeChange = (value) => {
        setSourceType(value);
        setFilePath('');
        setTestResponse(null);
        form.resetFields(['sourcePath', 'sourceTag']);
    };

    // Handle file browse button click
    const handleBrowse = async () => {
        try {
            const selectedPath = await fileSystem.selectFile();
            if (selectedPath) {
                setFilePath(selectedPath);
                form.setFieldsValue({ sourcePath: selectedPath });
            }
        } catch (error) {
            showMessage('error', `Failed to select file: ${error.message}`);
        }
    };

    // Handle form submission with loading state
    const handleSubmit = async (values) => {
        try {
            setSubmitting(true);
            console.log("Form submitted with values:", values);

            // Check if JSON filter is enabled but missing a path
            if (values.jsonFilter?.enabled && !values.jsonFilter?.path) {
                form.setFields([{
                    name: ['jsonFilter', 'path'],
                    errors: ['JSON path is required when filter is enabled']
                }]);
                showMessage('error', 'JSON filter is enabled but no path is specified');
                setSubmitting(false);
                return;
            }

            // Prepare source data
            const sourceData = {
                sourceType: values.sourceType,
                sourcePath: values.sourcePath,
                sourceTag: values.sourceTag || ''
            };

            // Add HTTP-specific properties
            if (values.sourceType === 'http') {
                sourceData.sourceMethod = values.sourceMethod || 'GET';

                // Make a deep copy of request options to avoid reference issues
                sourceData.requestOptions = JSON.parse(JSON.stringify(values.requestOptions || {}));

                // Ensure headers and queryParams are properly formatted
                if (!sourceData.requestOptions.headers) {
                    sourceData.requestOptions.headers = [];
                }

                if (!sourceData.requestOptions.queryParams) {
                    sourceData.requestOptions.queryParams = [];
                }

                console.log("Request options being sent:", JSON.stringify(sourceData.requestOptions, null, 2));

                // Check if we have headers
                if (sourceData.requestOptions.headers && sourceData.requestOptions.headers.length > 0) {
                    console.log("Headers being sent:", JSON.stringify(sourceData.requestOptions.headers, null, 2));
                }

                sourceData.jsonFilter = values.jsonFilter || { enabled: false, path: '' };
                sourceData.refreshOptions = values.refreshOptions || { interval: 0 };

                // Add TOTP if enabled
                if (totpEnabled && totpSecret) {
                    sourceData.requestOptions.totpSecret = totpSecret;
                    console.log("Adding TOTP secret to request options");
                }

                // If we have test response, extract content and original response
                if (testResponse) {
                    try {
                        const parsedResponse = JSON.parse(testResponse);

                        // Include headers if they were extracted from the test response
                        if (testResponseHeaders) {
                            sourceData.headers = testResponseHeaders;
                            console.log('Setting headers from test response:', testResponseHeaders);
                        } else if (parsedResponse.headers) {
                            sourceData.headers = parsedResponse.headers;
                            console.log('Setting headers from parsed response:', parsedResponse.headers);
                        }

                        if (parsedResponse.body) {
                            // For filtered responses, handle differently
                            if (parsedResponse.filteredWith && sourceData.jsonFilter?.enabled) {
                                sourceData.initialContent = parsedResponse.body; // This is already filtered

                                // Use originalResponse for the original response (supporting multiple formats for backward compatibility)
                                sourceData.originalResponse = parsedResponse.originalResponse || parsedResponse.originalBody || parsedResponse.body;

                                console.log('Setting filtered content and original response:',
                                    'filtered:', sourceData.initialContent.substring(0, 50) + '...',
                                    'original:', sourceData.originalResponse.substring(0, 50) + '...');
                            } else {
                                // For non-filtered responses
                                sourceData.initialContent = parsedResponse.body;
                                sourceData.originalResponse = parsedResponse.body;
                                console.log('Setting initial originalResponse from test response:',
                                    parsedResponse.body.substring(0, 50) + '...');
                            }

                            // Include headers if they exist in the response
                            if (parsedResponse.headers) {
                                sourceData.headers = parsedResponse.headers;
                                console.log('Setting headers from test response:', parsedResponse.headers);
                            }
                        }
                    } catch (error) {
                        console.error("Error parsing test response:", error);
                        // Use raw response if parsing fails
                        sourceData.initialContent = testResponse;
                        sourceData.originalResponse = testResponse;

                        // Try to include raw response for potential header extraction
                        sourceData.rawResponse = testResponse;
                    }
                }

                // Ensure URL has protocol
                if (!sourceData.sourcePath.match(/^https?:\/\//i)) {
                    sourceData.sourcePath = 'https://' + sourceData.sourcePath;
                }
            }

            console.log("Calling onAddSource with:", JSON.stringify(sourceData, null, 2));

            // Call parent handler to add source
            const success = await onAddSource(sourceData);

            if (success) {
                // Reset form on success
                form.resetFields();
                setFilePath('');
                setTestResponse(null);
                setTotpEnabled(false);
                setTotpSecret('');
            }
        } catch (error) {
            showMessage('error', `Failed to add source: ${error.message}`);
        } finally {
            setSubmitting(false);
        }
    };

    // Handle HTTP test response
    const handleTestResponse = (response) => {
        setTestResponse(response);

        // Try to extract headers from the response
        try {
            const parsedResponse = JSON.parse(response);
            if (parsedResponse.headers) {
                console.log('Extracted headers from test response:', parsedResponse.headers);
                setTestResponseHeaders(parsedResponse.headers);
            }
        } catch (e) {
            console.error('Error parsing test response headers:', e);
        }
    };

    // Render different form fields based on source type
    const renderSourcePathField = () => {
        switch (sourceType) {
            case 'file':
                return (
                    <Input
                        value={filePath}
                        placeholder="Select a file"
                        readOnly
                        size="small"
                        addonAfter={
                            <Button type="link" onClick={handleBrowse} style={{ padding: 0 }}>
                                Browse
                            </Button>
                        }
                    />
                );

            case 'env':
                return (
                    <Input
                        placeholder="Enter environment variable name"
                        size="small"
                    />
                );

            case 'http':
                return (
                    <Input
                        placeholder="Enter URL (e.g., https://example.com)"
                        size="small"
                    />
                );

            default:
                return null;
        }
    };

    // Render the add button with appropriate icon based on submitting state
    const renderAddButton = () => (
        <Button
            type="primary"
            htmlType="submit"
            icon={submitting ? <LoadingOutlined /> : <PlusOutlined />}
            onClick={() => form.submit()}
            loading={submitting}
            size="small"
        >
            {submitting ? 'Adding...' : 'Add Source'}
        </Button>
    );

    // Render the sticky header separately when in sticky mode
    const renderStickyHeader = () => {
        if (!isSticky) return null;

        return (
            <div className="source-form-sticky-header">
                <div className="sticky-header-content">
                    <div className="title">Add Source</div>
                    {renderAddButton()}
                </div>
            </div>
        );
    };

    return (
        <>
            {/* Sticky header that shows when scrolled */}
            {renderStickyHeader()}

            {/* Main form card */}
            <Card
                title="Add Source"
                className="source-form-card"
                size="small"
                ref={formCardRef}
                extra={renderAddButton()}
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSubmit}
                    initialValues={{
                        sourceType: 'file',
                        sourceMethod: 'GET',
                        requestOptions: {
                            contentType: 'application/json'
                        }
                    }}
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
                        <Col span={14}>
                            <Form.Item
                                label={sourceType === 'file' ? 'File Path' : (sourceType === 'env' ? 'Variable Name' : 'URL')}
                                name="sourcePath"
                                rules={[{ required: true, message: `Please enter ${sourceType === 'file' ? 'a file path' : (sourceType === 'env' ? 'a variable name' : 'a URL')}` }]}
                            >
                                {renderSourcePathField()}
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

                    {/* HTTP-specific options */}
                    {sourceType === 'http' && (
                        <>
                            <Divider style={{ margin: '12px 0' }} />
                            <Form.Item
                                label="HTTP Options"
                                name="httpOptions"
                            >
                                <HttpOptions
                                    form={form}
                                    onTestResponse={handleTestResponse}
                                    onTotpChange={handleTotpChange}
                                />
                            </Form.Item>
                        </>
                    )}
                </Form>
            </Card>
        </>
    );
};

export default SourceForm;