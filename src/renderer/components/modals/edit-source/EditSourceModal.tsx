import React, { useState, useEffect, useRef } from 'react';
import { Modal, Form } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import { useTotpState, useEnvironments } from '../../../contexts';
import { showMessage } from '../../../utils';
import EditSourceForm from './EditSourceForm';
import EditSourceModalFooter from './EditSourceModalFooter';
import FormSubmissionHandler from './form-submission-handler';

import { createLogger } from '../../../utils/error-handling/logger';
import type { Source, SourceHeader } from '../../../../types/source';
import type { EditSourceFormValues } from './form-submission-handler';
const log = createLogger('EditSourceModal');

interface HttpOptionsRef {
    validateFields?: () => void;
    forceTotpState?: (enabled: boolean, secret: string) => void;
    forceHeadersState?: (headers: Partial<SourceHeader>[]) => void;
    forceJsonFilterState?: (enabled: boolean, path: string) => void;
    getTotpState?: () => { enabled: boolean; secret?: string };
    getJsonFilterState?: () => { enabled: boolean; path?: string };
    getHeadersState?: () => SourceHeader[];
}

interface EditSourceModalProps {
    source: Source | null;
    open: boolean;
    onCancel: () => void;
    onSave: (sourceData: Source & { refreshNow: boolean }) => Promise<boolean>;
    refreshingSourceId: string | null;
}

const EditSourceModal = ({ source, open, onCancel, onSave, refreshingSourceId }: EditSourceModalProps) => {
    // Form instance
    const [form] = Form.useForm();
    
    // Component state
    const [refreshNow, setRefreshNow] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [totpEnabled, setTotpEnabled] = useState(false);
    const [totpSecret, setTotpSecret] = useState('');
    const [hasUserEdits, setHasUserEdits] = useState(false);
    
    // Component refs
    const isMountedRef = useRef(true);
    const isInitializedRef = useRef(false);
    const httpOptionsRef = useRef<HttpOptionsRef | null>(null);
    
    // Context hooks
    const {
        canUseTotpSecret,
        getCooldownSeconds,
        trackTotpSecret,
        untrackTotpSecret
    } = useTotpState();
    
    const envContext = useEnvironments();

    // Form state preservation across rerenders
    const formStateRef = useRef({
        jsonFilter: { enabled: false, path: '' },
        refreshOptions: { enabled: false, interval: 15, type: 'preset' },
        totpEnabled: false,
        totpSecret: '',
        refreshNow: true
    });

    // Original values for comparison during save
    const originalValuesRef = useRef({
        interval: 0,
        enabled: false
    });

    /**
     * Initializes form data when source changes or modal opens
     * Populates form fields with source data and sets up initial state
     */
    useEffect(() => {
        if (open && source) {

            // Store original values for comparison
            originalValuesRef.current = {
                interval: source.refreshOptions?.interval || 0,
                enabled: source.refreshOptions?.enabled || false
            };

            // Extract TOTP configuration
            const hasTotpSecret = !!(source.requestOptions?.totpSecret);
            const extractedTotpSecret = source.requestOptions?.totpSecret || '';


            // Update component state for TOTP
            setTotpEnabled(hasTotpSecret);
            setTotpSecret(extractedTotpSecret);

            // Prepare request options with proper defaults
            const requestOptions = {
                ...source.requestOptions,
                contentType: source.requestOptions?.contentType || 'application/json',
                headers: Array.isArray(source.requestOptions?.headers)
                    ? source.requestOptions.headers
                    : []
            };

            // Prepare JSON filter with type enforcement
            const jsonFilter = {
                enabled: Boolean(source.jsonFilter?.enabled),
                path: source.jsonFilter?.enabled ? (source.jsonFilter.path || '') : ''
            };

            // Prepare initial form values
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
                enableTOTP: hasTotpSecret,
                totpSecret: extractedTotpSecret
            };

            // Update form state reference
            formStateRef.current = {
                jsonFilter: jsonFilter,
                refreshOptions: initialValues.refreshOptions,
                totpEnabled: hasTotpSecret,
                totpSecret: extractedTotpSecret,
                refreshNow: true
            };


            // Set form values
            form.setFieldsValue(initialValues);

            // Reset component state
            setHasUserEdits(false);
            setRefreshNow(true);
            isInitializedRef.current = true;

        }

        return () => {
            isMountedRef.current = false;
        };
    }, [open, source, form]);

    /**
     * Tracks form value changes to detect user edits
     * Updates form state reference and marks component as having user edits
     */
    const handleFormChange = (changedValues: Partial<EditSourceFormValues>) => {
        if (isInitializedRef.current) {
            setHasUserEdits(true);

            // Update form state reference with changed values
            if (changedValues.jsonFilter) {
                formStateRef.current.jsonFilter = {
                    enabled: changedValues.jsonFilter.enabled,
                    path: changedValues.jsonFilter.path || ''
                };
            }

            if (changedValues.refreshOptions) {
                formStateRef.current.refreshOptions = {
                    ...formStateRef.current.refreshOptions,
                    ...changedValues.refreshOptions
                };
            }

            if (changedValues.enableTOTP !== undefined) {
                formStateRef.current.totpEnabled = changedValues.enableTOTP;
            }

            if (changedValues.totpSecret !== undefined) {
                formStateRef.current.totpSecret = changedValues.totpSecret;
            }
        }
    };

    /**
     * Handles TOTP state changes from HttpOptions component
     * Updates component state and marks as having user edits
     */
    const handleTotpChange = (enabled: boolean, secret: string) => {

        if (isInitializedRef.current &&
            (enabled !== totpEnabled || (enabled && secret !== totpSecret))) {
            setTotpEnabled(enabled);
            setTotpSecret(secret);
            setHasUserEdits(true);

            // Update form state reference
            formStateRef.current.totpEnabled = enabled;
            formStateRef.current.totpSecret = secret;
        }
    };

    /**
     * Tracks TOTP source in context for cooldown management
     */
    useEffect(() => {
        if (source && source.sourceId && totpEnabled && totpSecret) {
            trackTotpSecret(source.sourceId);
        }
        
        return () => {
            if (source && source.sourceId) {
                untrackTotpSecret(source.sourceId);
            }
        };
    }, [source, totpEnabled, totpSecret, trackTotpSecret, untrackTotpSecret]);
    
    /**
     * Re-validates form when environment changes
     * Ensures environment variables are properly validated
     */
    useEffect(() => {
        if (open && form && source && source.sourceType === 'http' && 
            envContext.environmentsReady && isInitializedRef.current) {
            
            setTimeout(() => {
                if (!hasUserEdits) {
                    return;
                }
                
                // Re-validate URL field if it contains variables
                const urlValue = form.getFieldValue('sourcePath');
                if (urlValue && typeof urlValue === 'string' && 
                    (urlValue.includes('{{') || urlValue.includes('[['))) {
                    form.validateFields(['sourcePath']);
                }
                
                // Trigger HttpOptions validation if available
                if (httpOptionsRef.current?.validateFields) {
                    httpOptionsRef.current.validateFields();
                }
            }, 100);
        }
    }, [envContext.activeEnvironment, envContext.environmentsReady, open, form, source, hasUserEdits]);

    /**
     * Handles HttpOptions component reference and initial state setup
     * Sets up TOTP state and headers when HttpOptions is mounted
     */
    const handleGetHttpOptionsRef = (instance: HttpOptionsRef | null) => {
        if (instance && !httpOptionsRef.current) {
            httpOptionsRef.current = instance;

            // Set up TOTP state if present in source
            if (source?.requestOptions?.totpSecret) {
                const totpSecretValue = source.requestOptions.totpSecret;
                setTimeout(() => {
                    if (instance.forceTotpState) {
                        instance.forceTotpState(true, totpSecretValue);
                    }
                }, 150);
            }

            // Set up headers if present in source
            if (source?.requestOptions?.headers && Array.isArray(source.requestOptions.headers)) {
                const headersValue = source.requestOptions.headers;
                setTimeout(() => {
                    if (instance.forceHeadersState) {
                        instance.forceHeadersState(headersValue);
                    }
                }, 50);
            }

            // Set up JSON filter if present in source
            if (source?.jsonFilter?.enabled && source?.jsonFilter?.path) {
                const jsonFilterPath = source.jsonFilter.path;
                setTimeout(() => {
                    if (instance.forceJsonFilterState) {
                        instance.forceJsonFilterState(true, jsonFilterPath);
                    }
                }, 200);
            }
        }
    };

    /**
     * Handles form submission with comprehensive validation and data preparation
     * Manages TOTP cooldown checks and calls parent save handler
     */
    const handleSubmit = async () => {
        if (!source) return false;
        try {
            // Check TOTP cooldown if refresh is enabled
            if (refreshNow && totpEnabled && totpSecret && source.sourceId &&
                !canUseTotpSecret(source.sourceId)) {
                const cooldownSeconds = getCooldownSeconds(source.sourceId);
                showMessage('warning', 
                    `TOTP code was recently used. Please wait ${cooldownSeconds} seconds before saving with refresh enabled, or uncheck "Refresh immediately after saving".`);
                return;
            }

            setSaving(true);

            // Use FormSubmissionHandler for complex validation and data preparation
            const submissionHandler = new FormSubmissionHandler(
                form, 
                source, 
                envContext, 
                httpOptionsRef, 
                originalValuesRef
            );

            // Set additional state for handler
            submissionHandler.totpEnabled = totpEnabled;
            submissionHandler.totpSecret = totpSecret;

            const sourceData = await submissionHandler.handleSubmission(refreshNow);

            // Call parent save handler
            const success = await onSave(sourceData);

            // Handle post-save refresh if needed
            if (refreshNow && success) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            // Reset saving state
            if (isMountedRef.current) {
                setSaving(false);
            }

            return success;
        } catch (error: unknown) {
            if (isMountedRef.current) {
                setSaving(false);

                // Handle validation errors
                const validationError = error as { errorFields?: Array<{ name: string[] }>; message?: string };
                if (validationError.errorFields) {
                    const jsonPathError = validationError.errorFields.find(
                        (field: { name: string[] }) => field.name[0] === 'jsonFilter' && field.name[1] === 'path'
                    );

                    if (jsonPathError) {
                        showMessage('error', 'JSON filter path is required when filter is enabled.');
                    } else {
                        showMessage('error', 'Please fill in all required fields.');
                    }
                } else {
                    showMessage('error', `Failed to update source: ${validationError.message ?? 'Unknown error'}`);
                }
            }
            return false;
        }
    };

    /**
     * Handles test response from HttpOptions component
     * Processes the response for display purposes
     */
    const handleTestResponse = (response: string | null) => {
        if (response) {
            try {
                const parsedResponse = JSON.parse(response);
                if (parsedResponse.body && parsedResponse.filteredWith && 
                    form.getFieldValue(['jsonFilter', 'enabled'])) {
                    // Response processing for filtered results
                    // Original response handling is preserved for backward compatibility
                }
            } catch (error) {
                // Skip processing if parsing fails
            }
        }
    };

    /**
     * Handles refresh checkbox state changes
     * Updates component state and form state reference
     */
    const handleRefreshNowChange = (e: { target: { checked: boolean } }) => {
        const checked = e.target.checked;
        setRefreshNow(checked);
        formStateRef.current.refreshNow = checked;
    };

    /**
     * Handles modal cancellation with user edit warning
     * Resets component state and calls parent cancel handler
     */
    const handleCustomCancel = () => {
        if (hasUserEdits) {
            // Could add confirmation dialog here if desired
        }
        handleModalCancel();
    };

    /**
     * Resets component state when modal closes
     * Cleans up refs and state variables
     */
    const handleModalCancel = () => {
        if (isMountedRef.current) {
            isInitializedRef.current = false;
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
            footer={
                <EditSourceModalFooter
                    source={source}
                    saving={saving}
                    testing={testing}
                    refreshingSourceId={refreshingSourceId}
                    totpEnabled={totpEnabled}
                    totpSecret={totpSecret}
                    refreshNow={refreshNow}
                    canUseTotpSecret={canUseTotpSecret}
                    getCooldownSeconds={getCooldownSeconds}
                    onCancel={handleCustomCancel}
                    onSave={handleSubmit}
                />
            }
            destroyOnClose={false}
            maskClosable={!saving && !testing && !(refreshingSourceId === source.sourceId)}
            closable={!saving && !testing && !(refreshingSourceId === source.sourceId)}
            keyboard={!saving && !testing && !(refreshingSourceId === source.sourceId)}
        >
            <EditSourceForm
                form={form}
                source={source}
                envContext={envContext}
                totpEnabled={totpEnabled}
                totpSecret={totpSecret}
                refreshNow={refreshNow}
                refreshingSourceId={refreshingSourceId}
                saving={saving}
                onFormChange={handleFormChange}
                onTotpChange={handleTotpChange}
                onTestResponse={handleTestResponse}
                onTestingChange={setTesting}
                onRefreshNowChange={handleRefreshNowChange}
                onGetHttpOptionsRef={handleGetHttpOptionsRef}
            />
        </Modal>
    );
};

export default EditSourceModal;