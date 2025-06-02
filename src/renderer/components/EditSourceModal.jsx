import React, { useState, useEffect, useRef } from 'react';
import { Modal, Form, Input, Select, Button, Space, Tabs, Row, Col, Checkbox } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import HttpOptions from './HttpOptions';
import { showMessage } from '../utils/messageUtil';
import timeManager from '../services/TimeManager';
const { createLogger } = require('../utils/logger');
const log = createLogger('EditSourceModal');

const { Option } = Select;

/**
 * EditSourceModal component for editing existing HTTP sources
 * With integrated TOTP handling and improved state persistence
 */
const EditSourceModal = ({ source, open, onCancel, onSave, refreshingSourceId }) => {
    const [form] = Form.useForm();
    const [refreshNow, setRefreshNow] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testResponse, setTestResponse] = useState(null);
    const [totpEnabled, setTotpEnabled] = useState(false);
    const [totpSecret, setTotpSecret] = useState('');
    const [hasUserEdits, setHasUserEdits] = useState(false);
    const isMountedRef = useRef(true);
    const isInitializedRef = useRef(false);
    const httpOptionsRef = useRef(null);

    // Add ref to preserve form state across rerenders
    const formStateRef = useRef({
        jsonFilter: { enabled: false, path: '' },
        refreshOptions: { enabled: false, interval: 15, type: 'preset' },
        totpEnabled: false,
        totpSecret: '',
        refreshNow: true
    });

    // Store original values for comparison
    const originalValuesRef = useRef({
        interval: 0,
        enabled: false
    });

    // Initialize form when source changes or modal opens
    useEffect(() => {
        if (open && source) {
            log.debug('Initializing EditSourceModal form with source:', source.sourceId);

            // Store original values for comparison
            originalValuesRef.current = {
                interval: source.refreshOptions?.interval || 0,
                enabled: source.refreshOptions?.enabled || false
            };

            // Check for TOTP secret in the source
            const hasTotpSecret = !!(source.requestOptions?.totpSecret);
            const extractedTotpSecret = source.requestOptions?.totpSecret || '';

            log.debug('Source has TOTP secret:', hasTotpSecret,
                hasTotpSecret ? extractedTotpSecret : "none");

            // Update component state for TOTP
            setTotpEnabled(hasTotpSecret);
            setTotpSecret(extractedTotpSecret);

            // Ensure we have proper headers in requestOptions
            const requestOptions = {
                ...source.requestOptions,
                contentType: source.requestOptions?.contentType || 'application/json',
                // Make sure headers is an array even if it's missing or not an array in the source
                headers: Array.isArray(source.requestOptions?.headers)
                    ? source.requestOptions.headers
                    : []
            };

            // Log the headers for debugging
            log.debug('Headers from source:', requestOptions.headers);

            // Prepare jsonFilter with proper type enforcement
            const jsonFilter = {
                enabled: Boolean(source.jsonFilter?.enabled),
                path: source.jsonFilter?.enabled ? (source.jsonFilter.path || '') : ''
            };

            // Map source data to form fields
            const initialValues = {
                sourceType: source.sourceType,
                sourcePath: source.sourcePath,
                sourceTag: source.sourceTag || '',
                sourceMethod: source.sourceMethod || 'GET',
                requestOptions: requestOptions,
                jsonFilter: jsonFilter,
                refreshOptions: {
                    ...source.refreshOptions,
                    enabled: source.refreshOptions?.enabled || false,
                    interval: source.refreshOptions?.interval || 15,
                    type: source.refreshOptions?.type || 'preset'
                },
                // Add TOTP fields directly
                enableTOTP: hasTotpSecret,
                totpSecret: extractedTotpSecret
            };

            // Update our reference to form state
            formStateRef.current = {
                jsonFilter: jsonFilter,
                refreshOptions: initialValues.refreshOptions,
                totpEnabled: hasTotpSecret,
                totpSecret: extractedTotpSecret,
                refreshNow: true // Default checked
            };

            log.debug('Setting form values:', JSON.stringify({
                sourceType: initialValues.sourceType,
                enableTOTP: initialValues.enableTOTP,
                totpSecret: initialValues.totpSecret ? "exists" : "none",
                jsonFilter: initialValues.jsonFilter,
                refreshOptions: initialValues.refreshOptions,
                requestOptions: {
                    ...initialValues.requestOptions,
                    headers: initialValues.requestOptions.headers.length
                }
            }));

            // Set form values
            form.setFieldsValue(initialValues);

            // Reset user edit state when modal opens
            setHasUserEdits(false);

            // Set refreshNow to true by default
            setRefreshNow(true);

            // Mark as initialized after form setup
            isInitializedRef.current = true;

            // Additional debugging to verify form values were set
            setTimeout(() => {
                const enableTOTP = form.getFieldValue('enableTOTP');
                const totpSecret = form.getFieldValue('totpSecret');
                const headers = form.getFieldValue(['requestOptions', 'headers']);
                const jsonFilter = form.getFieldValue('jsonFilter');

                log.debug('Form values after setting:', {
                    enableTOTP,
                    totpSecret: totpSecret ? "exists" : "none",
                    headers: headers ? headers.length + " headers" : "none",
                    jsonFilter
                });
            }, 100);
        }

        return () => {
            isMountedRef.current = false;
        };
    }, [open, source, form]);

    // Add value change detection to track user edits
    const handleFormChange = (changedValues, allValues) => {
        log.debug('Form values changed:', Object.keys(changedValues));

        // Only track changes when the component is initialized
        if (isInitializedRef.current) {
            setHasUserEdits(true);

            // Update our form state reference with changed values
            if (changedValues.jsonFilter) {
                formStateRef.current.jsonFilter = changedValues.jsonFilter;
            }

            if (changedValues.refreshOptions) {
                formStateRef.current.refreshOptions = {
                    ...formStateRef.current.refreshOptions,
                    ...changedValues.refreshOptions
                };
            }

            if (changedValues.hasOwnProperty('enableTOTP')) {
                formStateRef.current.totpEnabled = changedValues.enableTOTP;
            }

            if (changedValues.hasOwnProperty('totpSecret')) {
                formStateRef.current.totpSecret = changedValues.totpSecret;
            }
        }
    };

    // Handle TOTP state changes
    const handleTotpChange = (enabled, secret) => {
        log.debug('TOTP state changed:', enabled, secret);

        // Only update if we're already initialized AND there's an actual change
        if (isInitializedRef.current &&
            (enabled !== totpEnabled ||
                (enabled && secret !== totpSecret))) {
            setTotpEnabled(enabled);
            setTotpSecret(secret);
            setHasUserEdits(true);

            // Update form state reference
            formStateRef.current.totpEnabled = enabled;
            formStateRef.current.totpSecret = secret;
        } else {
            log.debug('Ignoring redundant TOTP change');
        }
    };

    // Direct access to HttpOptions to force TOTP state
    const handleGetHttpOptionsRef = (instance) => {
        if (instance && !httpOptionsRef.current) {  // Only set the ref once
            httpOptionsRef.current = instance;

            // If we have TOTP data from the source, force HttpOptions to show it
            if (source?.requestOptions?.totpSecret) {
                log.debug('Directly setting TOTP in HttpOptions ref');

                // Use a timeout to ensure HttpOptions is fully mounted
                setTimeout(() => {
                    if (instance.forceTotpState) {
                        instance.forceTotpState(true, source.requestOptions.totpSecret);
                    }
                }, 100);
            }

            // If we have headers in the source, make sure they're properly set
            if (source?.requestOptions?.headers && Array.isArray(source.requestOptions.headers)) {
                const headers = source.requestOptions.headers;
                log.debug('Source has headers:', headers);

                // Use a timeout to ensure HttpOptions is fully mounted
                setTimeout(() => {
                    if (instance.forceHeadersState) {
                        instance.forceHeadersState(headers);
                    }
                }, 200);  // Slightly longer timeout than the other force* calls
            }

            // If we have JSON filter data, make sure it's set correctly in the HttpOptions
            if (source?.jsonFilter?.enabled && source?.jsonFilter?.path) {

                // Use a timeout to ensure HttpOptions is fully mounted
                setTimeout(() => {
                    if (instance.forceJsonFilterState) {
                        instance.forceJsonFilterState(true, source.jsonFilter.path);
                    }
                }, 150);
            }
        }
    };

    // Handle form submission
    const handleSubmit = async () => {
        try {
            // First manually check for JSON filter path
            const jsonFilter = form.getFieldValue('jsonFilter');
            if (jsonFilter?.enabled === true && !jsonFilter?.path) {
                // Make the path field visible and mark it as error
                form.setFields([
                    {
                        name: ['jsonFilter', 'path'],
                        errors: ['JSON path is required when filter is enabled']
                    }
                ]);

                // Show error message
                showMessage('error', 'JSON filter is enabled but no path is specified. Please enter a JSON path.');
                return;
            }

            try {
                // Now try to validate the form
                const values = await form.validateFields();

                // Set saving state
                setSaving(true);

                // Always create a clean and normalized jsonFilter object
                const normalizedJsonFilter = {
                    enabled: Boolean(jsonFilter?.enabled),
                    path: jsonFilter?.enabled === true ? (jsonFilter.path || '') : ''
                };

                // Log the normalized JSON filter

                // IMPORTANT NEW PART: Return a promise that resolves with the updated source
                // Get TOTP values - collect from multiple sources
                // First check form values
                let isTotpEnabled = values.enableTOTP === true;
                let totpSecretValue = values.totpSecret || '';

                // Then check component state as an alternative
                if (!isTotpEnabled && totpEnabled) {
                    isTotpEnabled = true;
                    if (!totpSecretValue && totpSecret) {
                        totpSecretValue = totpSecret;
                    }
                }

                // Check if ref is available and has TOTP state
                if (httpOptionsRef.current && httpOptionsRef.current.getTotpState) {
                    const totpState = httpOptionsRef.current.getTotpState();

                    // Override previous values if TOTP is enabled in the ref
                    if (totpState.enabled) {
                        isTotpEnabled = true;
                        if (totpState.secret) {
                            totpSecretValue = totpState.secret;
                        }
                    }
                }


                // Store whether we should refresh now
                const shouldRefreshNow = refreshNow;

                // Prepare source data for update - preserve originalResponse if available
                const sourceData = {
                    sourceId: source.sourceId,
                    sourceType: source.sourceType,
                    sourcePath: values.sourcePath,
                    sourceTag: values.sourceTag || '',
                    sourceMethod: values.sourceMethod || 'GET',
                    requestOptions: {
                        ...source.requestOptions,
                        ...values.requestOptions,
                        headers: values.requestOptions?.headers || source.requestOptions?.headers || [],
                        queryParams: values.requestOptions?.queryParams || source.requestOptions?.queryParams || [],
                        variables: values.requestOptions?.variables || source.requestOptions?.variables || [],
                        body: values.requestOptions?.body || source.requestOptions?.body || null,
                        contentType: values.requestOptions?.contentType || source.requestOptions?.contentType || 'application/json'
                    },
                    // Use normalized jsonFilter object
                    jsonFilter: normalizedJsonFilter,
                    refreshOptions: values.refreshOptions || { enabled: false, interval: 0 },
                    // IMPORTANT: Always pass refreshNow: true to trigger refresh in case we can't do it manually
                    refreshNow: shouldRefreshNow,
                    // Preserve filtering status
                    isFiltered: source.isFiltered || normalizedJsonFilter.enabled,
                    filteredWith: normalizedJsonFilter.enabled ? normalizedJsonFilter.path : source.filteredWith
                };

                // Preserve the original response if it exists
                if (source.originalResponse) {
                    sourceData.originalResponse = source.originalResponse;
                }

                // Explicitly add TOTP values to requestOptions if enabled
                if (isTotpEnabled && totpSecretValue) {
                    sourceData.requestOptions.totpSecret = totpSecretValue;
                } else {
                    // Explicitly remove any existing TOTP secret if TOTP is now disabled
                    if (sourceData.requestOptions.totpSecret) {
                        delete sourceData.requestOptions.totpSecret;
                    }
                }

                // If HttpOptions reference is available, check if we can get newer state for JSON filter and headers
                if (httpOptionsRef.current) {
                    // Check if we can get the JSON filter state
                    if (httpOptionsRef.current.getJsonFilterState) {
                        const jsonFilterState = httpOptionsRef.current.getJsonFilterState();

                        // Additional validation to ensure path exists when enabled
                        if (jsonFilterState.enabled === true && !jsonFilterState.path) {
                            showMessage('error', 'JSON filter is enabled but no path is specified. Please enter a JSON path.');
                            setSaving(false);
                            return;
                        }

                        // Normalize the jsonFilter from the component
                        sourceData.jsonFilter = {
                            enabled: Boolean(jsonFilterState.enabled),
                            path: jsonFilterState.enabled === true ? (jsonFilterState.path || '') : ''
                        };

                        // Update filtering status based on current filter state
                        sourceData.isFiltered = jsonFilterState.enabled;
                        sourceData.filteredWith = jsonFilterState.enabled ? jsonFilterState.path : null;

                    }

                    // Check if we can get the headers directly from the component
                    if (httpOptionsRef.current.getHeadersState) {
                        const headers = httpOptionsRef.current.getHeadersState();
                        if (headers && headers.length > 0) {
                            sourceData.requestOptions.headers = headers;
                        }
                    }

                    // If there's a getVariablesState method, use it to get the latest variables
                    if (httpOptionsRef.current.getVariablesState) {
                        const variables = httpOptionsRef.current.getVariablesState();
                        if (variables && variables.length > 0) {
                            sourceData.requestOptions.variables = variables;
                        }
                    }
                }

                // Final validation check for JSON filter before proceeding
                if (sourceData.jsonFilter.enabled === true && !sourceData.jsonFilter.path) {
                    showMessage('error', 'JSON filter is enabled but no path is specified. Please enter a JSON path.');
                    setSaving(false);
                    return;
                }

                // Ensure URL has protocol
                if (sourceData.sourceType === 'http' && !sourceData.sourcePath.match(/^https?:\/\//i)) {
                    sourceData.sourcePath = 'https://' + sourceData.sourcePath;
                }

                // FIXED: Check if refresh interval or enabled state has changed
                // and only preserve timing if they haven't changed
                const hasIntervalChanged =
                    sourceData.refreshOptions?.interval !== originalValuesRef.current.interval;
                const hasEnabledChanged =
                    sourceData.refreshOptions?.enabled !== originalValuesRef.current.enabled;

                // If refresh interval or enabled status changed, don't preserve timing
                if (!hasIntervalChanged && !hasEnabledChanged &&
                    source.refreshOptions?.nextRefresh &&
                    source.refreshOptions.nextRefresh > timeManager.now()) {
                    if (!sourceData.refreshOptions) {
                        sourceData.refreshOptions = {};
                    }
                    sourceData.refreshOptions.preserveTiming = true;
                } else if (hasIntervalChanged) {
                    // Not preserving timing due to interval change
                    if (sourceData.refreshOptions) {
                        sourceData.refreshOptions.preserveTiming = false;
                    }
                } else if (hasEnabledChanged) {
                    // Not preserving timing due to enabled state change
                    if (sourceData.refreshOptions) {
                        sourceData.refreshOptions.preserveTiming = false;
                    }
                }

                // Call parent save handler
                const success = await onSave(sourceData);

                // Only manually do an additional refresh if necessary
                if (shouldRefreshNow && success) {
                    // Wait a short time for the source update to complete
                    await new Promise(resolve => setTimeout(resolve, 500));
                }

                // Reset saving state to ensure button returns to normal state
                if (isMountedRef.current) {
                    setSaving(false);
                    // Reset test response state
                    setTestResponse(null);
                }

                return success;
            } catch (validationError) {
                // Handle form validation errors separately
                setSaving(false);

                // Check if this is a validation error with fields
                if (validationError.errorFields) {
                    // Check specifically for JSON filter path error
                    const jsonPathError = validationError.errorFields.find(
                        field => field.name[0] === 'jsonFilter' && field.name[1] === 'path'
                    );

                    if (jsonPathError) {
                        showMessage('error', 'JSON filter path is required when filter is enabled.');
                    } else {
                        showMessage('error', 'Please fill in all required fields.');
                    }
                } else {
                    showMessage('error', `Validation error: ${validationError.message || 'Unknown error'}`);
                }

                return false;
            }
        } catch (error) {
            if (isMountedRef.current) {
                showMessage('error', `Failed to update source: ${error.message}`);
                setSaving(false);
            }
            return false;
        }
    };

    // Handle test response from HTTP options
    const handleTestResponse = (response) => {
        setTestResponse(response);

        // Process test response if needed
        if (response) {
            try {
                const parsedResponse = JSON.parse(response);

                if (parsedResponse.body) {
                    // For filtered responses, handle differently
                    if (parsedResponse.filteredWith && form.getFieldValue(['jsonFilter', 'enabled'])) {
                        // Use originalResponse for the original response (supporting multiple formats for backward compatibility)
                        const originalResponse = parsedResponse.originalResponse || parsedResponse.originalBody || parsedResponse.body;
                    }
                }
            } catch (error) {
                // Skip processing if parsing fails
            }
        }
    };

    // Handle refresh checkbox change with improved state preservation
    const handleRefreshNowChange = (e) => {
        const checked = e.target.checked;
        setRefreshNow(checked);

        // Update form state reference
        formStateRef.current.refreshNow = checked;
    };

    // Custom cancel handler that warns about losing changes
    const handleCustomCancel = () => {
        if (hasUserEdits) {
            // You could add a confirmation dialog here if desired
        }
        handleModalCancel();
    };

    // Reset state when modal closes
    const handleModalCancel = () => {
        if (isMountedRef.current) {
            isInitializedRef.current = false;
            setTestResponse(null);
            setHasUserEdits(false);
        }
        onCancel();
    };

    // Only render for HTTP sources
    if (!source || source.sourceType !== 'http') {
        return null;
    }

    return (
        <Modal
            title={
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <EditOutlined style={{ marginRight: 8 }} />
                    Edit HTTP Source
                </div>
            }
            open={open}
            className="edit-source-modal"
            onCancel={handleModalCancel}
            width={800}
            footer={[
                <Button key="cancel" onClick={handleCustomCancel} disabled={saving || refreshingSourceId === source.sourceId}>
                    Cancel
                </Button>,
                <Button
                    key="save"
                    type="primary"
                    onClick={handleSubmit}
                    loading={saving || refreshingSourceId === source.sourceId}
                >
                    {saving
                        ? 'Saving...'
                        : (refreshingSourceId === source.sourceId)
                            ? (refreshNow ? 'Refreshing...' : 'Saving...')
                            : 'Save'}
                </Button>
            ]}
            destroyOnClose={false}
            maskClosable={!saving && !(refreshingSourceId === source.sourceId)}
            closable={!saving && !(refreshingSourceId === source.sourceId)}
            keyboard={!saving && !(refreshingSourceId === source.sourceId)}
        >
            <Form
                form={form}
                layout="vertical"
                initialValues={{
                    enableTOTP: formStateRef.current.totpEnabled,
                    totpSecret: formStateRef.current.totpSecret
                }}
                preserve={false}
                onValuesChange={handleFormChange}
            >
                {/* Common source fields in a compact row */}
                <Row gutter={16}>
                    <Col span={16}>
                        <Form.Item
                            label="URL"
                            name="sourcePath"
                            rules={[{ required: true, message: 'Please enter a URL' }]}
                        >
                            <Input placeholder="Enter URL (e.g., https://example.com)" />
                        </Form.Item>
                    </Col>
                    <Col span={8}>
                        <Form.Item
                            label="Tag (optional)"
                            name="sourceTag"
                        >
                            <Input placeholder="Enter a tag" />
                        </Form.Item>
                    </Col>
                </Row>

                {/* Hidden form field to preserve sourceType */}
                <Form.Item
                    name="sourceType"
                    hidden={true}
                >
                    <Input type="hidden" />
                </Form.Item>

                {/* Extra hidden fields for TOTP state */}
                <Form.Item name="enableTOTP" hidden={true}>
                    <Input type="hidden" />
                </Form.Item>
                <Form.Item name="totpSecret" hidden={true}>
                    <Input type="hidden" />
                </Form.Item>

                {/* HTTP-specific options */}
                <Form.Item
                    label="HTTP Options"
                    name="httpOptions"
                >
                    <HttpOptions
                        ref={handleGetHttpOptionsRef}
                        form={form}
                        onTestResponse={handleTestResponse}
                        onTotpChange={handleTotpChange}
                        initialTotpEnabled={totpEnabled}
                        initialTotpSecret={totpSecret}
                    />
                </Form.Item>

                <Checkbox
                    checked={refreshNow}
                    onChange={handleRefreshNowChange}
                    style={{ marginTop: 16 }}
                    disabled={saving || refreshingSourceId === source.sourceId}
                >
                    Refresh immediately after saving
                </Checkbox>
            </Form>
        </Modal>
    );
};

export default EditSourceModal;