import React, { useState, useEffect, useImperativeHandle, forwardRef, useRef, useCallback } from 'react';
import { Tabs, Form, Input, Select, Button, Card, Space, Radio, InputNumber, Switch, Row, Col, Typography, Tooltip, theme, Alert, Progress } from 'antd';
import { PlusOutlined, MinusCircleOutlined, CopyOutlined } from '@ant-design/icons';
import { useHttp } from '../hooks/useHttp';
import JsonFilter from './JsonFilter';
import { showMessage, successMessage } from '../utils/messageUtil';
import { createLogger } from '../utils/logger';
import timeManager from '../services/TimeManager';
import { useTotpState } from '../contexts/TotpContext';
import { useTheme } from '../contexts/ThemeContext';

const log = createLogger('HttpOptions');

const { Option } = Select;
const { TextArea } = Input;
const { Text } = Typography;

/**
 * HttpOptions component for configuring HTTP requests with compact layout
 * With integrated TOTP Authentication - now with ref forwarding and improved state persistence
 */
const HttpOptions = forwardRef(({ form, sourceId, onTestResponse, onTotpChange, initialTotpEnabled, initialTotpSecret, onTestingChange }, ref) => {
    // Get current theme from context
    const { isDarkMode } = useTheme();
    const { token } = theme.useToken();
    
    // Component state
    const [contentType, setContentType] = useState('application/json');
    const [testResponseVisible, setTestResponseVisible] = useState(false);
    const [testResponseContent, setTestResponseContent] = useState('');
    const [testing, setTesting] = useState(false);
    
    // Generate a temporary source ID for new sources
    const tempSourceIdRef = useRef(sourceId || `temp-${Date.now()}`);
    const effectiveSourceId = sourceId || tempSourceIdRef.current;
    
    // Use TOTP context
    const {
        canUseTotpSecret,
        getCooldownSeconds,
        startTestingWithTotp,
        endTestingWithTotp,
        checkIfRequestUsesTotp,
        trackTotpSecret,
        untrackTotpSecret
    } = useTotpState();

    // State for JSON filtering with ref for persistence
    const [jsonFilterEnabled, setJsonFilterEnabled] = useState(false);
    const jsonFilterEnabledRef = useRef(false);
    const jsonFilterPathRef = useRef('');

    // State for refresh options with refs for persistence
    const [refreshEnabled, setRefreshEnabled] = useState(false);
    const [refreshType, setRefreshType] = useState('preset');
    const [customInterval, setCustomInterval] = useState(15);
    const refreshEnabledRef = useRef(false);
    const refreshTypeRef = useRef('preset');
    const customIntervalRef = useRef(15);

    const [rawResponse, setRawResponse] = useState(null);

    // Simplified TOTP state - UI only, form is source of truth
    const [totpCode, setTotpCode] = useState('------');
    const [totpError, setTotpError] = useState(null);
    const [totpTesting, setTotpTesting] = useState(false);
    const [totpPreviewVisible, setTotpPreviewVisible] = useState(false);
    const [timeRemaining, setTimeRemaining] = useState(30);
    const [codeJustGenerated, setCodeJustGenerated] = useState(false);

    const [isFormInitialized, setIsFormInitialized] = useState(false);

    // Store the callback in a ref to avoid dependency cycles
    const notifyParentRef = useRef(onTotpChange);

    // Helper to get TOTP state from form (single source of truth)
    const getTotpStateFromForm = useCallback(() => {
        const formEnabled = form.getFieldValue('enableTOTP');
        const formSecret = form.getFieldValue('totpSecret');
        const requestOptionsTotpSecret = form.getFieldValue(['requestOptions', 'totpSecret']);
        
        const secret = formSecret || requestOptionsTotpSecret || '';
        const enabled = Boolean(formEnabled && secret);
        
        return { enabled, secret };
    }, [form]);

    // Custom hooks
    const http = useHttp();

    // Update callback ref when onTotpChange changes
    useEffect(() => {
        notifyParentRef.current = onTotpChange;
    }, [onTotpChange]);

    // Add effect to properly initialize and maintain the JSON filter state
    useEffect(() => {
        if (!form || !isFormInitialized) return;

        const formJsonFilter = form.getFieldValue('jsonFilter');
        if (formJsonFilter?.enabled !== undefined && formJsonFilter.enabled !== jsonFilterEnabled) {
            log.debug(`[HttpOptions] Syncing jsonFilterEnabled state with form: ${formJsonFilter.enabled}`);
            setJsonFilterEnabled(formJsonFilter.enabled);
            jsonFilterEnabledRef.current = formJsonFilter.enabled;

            // Store the path in the ref if it exists
            if (formJsonFilter.path) {
                jsonFilterPathRef.current = formJsonFilter.path;
                log.debug(`[HttpOptions] Storing JSON filter path in ref: ${formJsonFilter.path}`);
            }
        }
    }, [form, jsonFilterEnabled, isFormInitialized]);

    // Expose methods via ref to the parent component
    useImperativeHandle(ref, () => ({
        // Method to force TOTP state directly
        forceTotpState: (enabled, secret) => {
            log.debug(`[HttpOptions] forceTotpState called with enabled=${enabled}, secret=${secret ? "exists" : "none"}`);

            // Update form values - form is the single source of truth
            form.setFieldsValue({
                enableTOTP: enabled,
                totpSecret: secret || ''
            });

            // Always update requestOptions to match
            const currentRequestOptions = form.getFieldValue('requestOptions') || {};
            
            const updatedRequestOptions = {
                headers: currentRequestOptions.headers || [],
                queryParams: currentRequestOptions.queryParams || [],
                variables: currentRequestOptions.variables || [],
                contentType: currentRequestOptions.contentType || 'application/json',
                body: currentRequestOptions.body || '',
                ...currentRequestOptions
            };

            if (enabled && secret) {
                updatedRequestOptions.totpSecret = secret;
                log.debug("[HttpOptions] Added TOTP secret to requestOptions via forceTotpState");
            } else if (updatedRequestOptions.totpSecret) {
                delete updatedRequestOptions.totpSecret;
                log.debug("[HttpOptions] Removed TOTP secret from requestOptions via forceTotpState");
            }
            
            form.setFieldsValue({ requestOptions: updatedRequestOptions });

            return true;
        },

        // Simplified getTotpState using form as source of truth
        getTotpState: () => {
            const state = getTotpStateFromForm();
            log.debug(`[HttpOptions] getTotpState returning: enabled=${state.enabled}, secret=${state.secret ? "exists" : "none"}`);
            return state;
        },

        // Method to force sync form fields directly - especially for debugging
        syncFormState: () => {
            // Get all current form values for debugging
            const allValues = form.getFieldsValue(true);
            log.debug('[HttpOptions] Current form values:', {
                requestOptions: allValues.requestOptions,
                jsonFilter: allValues.jsonFilter
            });
        },

        // In the useImperativeHandle section:
        forceHeadersState: (headers) => {
            log.debug(`[HttpOptions] forceHeadersState called with ${headers?.length || 0} headers`);

            // Update form values
            if (Array.isArray(headers) && headers.length > 0) {
                form.setFieldValue(['requestOptions', 'headers'], headers);
                log.debug('[HttpOptions] Directly set headers in form:', headers);
            }

            return true;
        },

        getHeadersState: () => {
            // Get the current headers from the form
            const headers = form.getFieldValue(['requestOptions', 'headers']);
            return Array.isArray(headers) ? headers : [];
        },

        // Method to get variables state
        getVariablesState: () => {
            // Get the current variables from the form
            const variables = form.getFieldValue(['requestOptions', 'variables']);

            // Log what we're returning for debugging
            log.debug('[HttpOptions] Getting variables state:', variables);

            return Array.isArray(variables) ? variables : [];
        },

        // Method to force variables state
        forceVariablesState: (variables) => {
            log.debug(`[HttpOptions] forceVariablesState called with ${variables?.length || 0} variables`);

            // Update form values
            if (Array.isArray(variables) && variables.length > 0) {
                form.setFieldValue(['requestOptions', 'variables'], variables);
                log.debug('[HttpOptions] Directly set variables in form:', variables);
            }

            return true;
        },

        getJsonFilterState: () => {
            // First check the direct Form value (most accurate)
            const jsonFilter = form.getFieldValue('jsonFilter');

            // Debug log
            log.debug('[HttpOptions] Current JSON filter in form:', jsonFilter);
            log.debug('[HttpOptions] Current jsonFilterEnabled state:', jsonFilterEnabled);

            // FIXED: Create a clean, normalized object with explicit boolean
            // Combine both form and component state to get the most accurate state
            const result = {
                // Use strict boolean conversion
                enabled: Boolean(jsonFilter?.enabled === true || jsonFilterEnabled === true),
                // Only include path if enabled
                path: (jsonFilter?.enabled === true || jsonFilterEnabled === true) ?
                    (jsonFilter?.path || '').trim() : ''
            };

            // Log the final state being returned
            log.debug('[HttpOptions] Returning normalized JSON filter state:',
                JSON.stringify(result));

            return result;
        },

        // Method to explicitly sync JSON filter state
        forceJsonFilterState: (enabled, path) => {
            log.debug(`[HttpOptions] forceJsonFilterState called with enabled=${enabled}, path=${path}`);

            // Normalize the values
            const normalizedEnabled = Boolean(enabled);
            const normalizedPath = normalizedEnabled ? (path || '') : '';

            // Update component state and ref
            setJsonFilterEnabled(normalizedEnabled);
            jsonFilterEnabledRef.current = normalizedEnabled;

            // Always store the path in the ref, even when disabling
            if (path) {
                jsonFilterPathRef.current = path;
                log.debug(`[HttpOptions] Storing forced path in ref: ${path}`);
            }

            // Update form values
            form.setFieldsValue({
                jsonFilter: {
                    enabled: normalizedEnabled,
                    path: normalizedPath
                }
            });

            log.debug(`[HttpOptions] JSON filter state forced to: enabled=${normalizedEnabled}, path=${normalizedPath}`);
            return true;
        }
    }));

    // Initialize form with props when component mounts
    useEffect(() => {
        if (initialTotpEnabled !== undefined && initialTotpSecret) {
            log.debug(`[HttpOptions] Initializing form from props: enabled=${initialTotpEnabled}, secret=${initialTotpSecret ? "exists" : "none"}`);
            
            // Set form values directly - form is source of truth
            form.setFieldsValue({
                enableTOTP: initialTotpEnabled,
                totpSecret: initialTotpSecret
            });

            // Ensure requestOptions has the TOTP secret if enabled
            const currentRequestOptions = form.getFieldValue('requestOptions') || {};
            if (initialTotpEnabled && initialTotpSecret) {
                form.setFieldsValue({
                    requestOptions: {
                        ...currentRequestOptions,
                        totpSecret: initialTotpSecret
                    }
                });
            }
        }
    }, [initialTotpEnabled, initialTotpSecret, form]);

    // Force form field structure - this helps ensure the form fields are always properly structured
    useEffect(() => {
        if (!form) return;

        try {
            // Get current values from form (which may be incomplete)
            const currentValues = form.getFieldsValue(true);

            // Check for headers
            if (currentValues.requestOptions) {
                if (!Array.isArray(currentValues.requestOptions.headers)) {
                    log.debug('[HttpOptions] Fixing missing headers in form');
                    form.setFieldValue(['requestOptions', 'headers'], []);
                }

                // Check for variables
                if (!Array.isArray(currentValues.requestOptions.variables)) {
                    log.debug('[HttpOptions] Fixing missing variables in form');
                    form.setFieldValue(['requestOptions', 'variables'], []);
                }
            }
        } catch (err) {
            log.error('Error fixing form structure:', err);
        }
    }, [form]);

    // Initialize form structure and defaults
    useEffect(() => {
        if (isFormInitialized) return;

        try {
            const formValues = form.getFieldsValue(true);

            // Ensure basic form structure exists
            if (!formValues.requestOptions || !formValues.requestOptions.contentType) {
                form.setFieldValue(['requestOptions', 'contentType'], 'application/json');
            }

            if (!Array.isArray(formValues.requestOptions?.headers)) {
                form.setFieldValue(['requestOptions', 'headers'], []);
            }

            if (!Array.isArray(formValues.requestOptions?.variables)) {
                form.setFieldValue(['requestOptions', 'variables'], []);
            }

            if (!formValues.jsonFilter) {
                form.setFieldValue('jsonFilter', { enabled: false, path: '' });
            }

            // Initialize JSON filter state from form
            const jsonFilter = form.getFieldValue('jsonFilter');
            if (jsonFilter) {
                const isEnabled = !!jsonFilter.enabled;
                setJsonFilterEnabled(isEnabled);
                jsonFilterEnabledRef.current = isEnabled;

                if (jsonFilter.path) {
                    jsonFilterPathRef.current = jsonFilter.path;
                }
            }

            // Initialize refresh state from form
            const refreshOptions = form.getFieldValue('refreshOptions');
            if (refreshOptions?.enabled) {
                setRefreshEnabled(refreshOptions.enabled);
                refreshEnabledRef.current = refreshOptions.enabled;
                
                if (refreshOptions.type) {
                    setRefreshType(refreshOptions.type);
                    refreshTypeRef.current = refreshOptions.type;
                }
                
                if (refreshOptions.interval) {
                    setCustomInterval(refreshOptions.interval);
                    customIntervalRef.current = refreshOptions.interval;
                }
            }

            // Initialize content type from form
            const contentType = form.getFieldValue(['requestOptions', 'contentType']);
            if (contentType) {
                setContentType(contentType);
            }

            setIsFormInitialized(true);
            log.debug("[HttpOptions] Form initialization complete");
        } catch (err) {
            log.error("Error initializing HttpOptions:", err);
        }
    }, [form, isFormInitialized]);

    // Notify parent of TOTP changes based on form values
    const lastNotifiedRef = useRef({ enabled: false, secret: '' });
    
    useEffect(() => {
        if (!notifyParentRef.current || !isFormInitialized) return;

        const { enabled, secret } = getTotpStateFromForm();
        
        // Only notify if values have changed
        if (lastNotifiedRef.current.enabled !== enabled || lastNotifiedRef.current.secret !== secret) {
            log.debug(`[HttpOptions] Notifying parent of TOTP change: enabled=${enabled}, secret=${secret ? "exists" : "none"}`);
            notifyParentRef.current(enabled, secret);
            lastNotifiedRef.current = { enabled, secret };
        }
    }, [getTotpStateFromForm, isFormInitialized]);

    // Update parent callback ref when it changes
    useEffect(() => {
        notifyParentRef.current = onTotpChange;
    }, [onTotpChange]);

    // Helper function to get status text based on status code
    const getStatusText = (statusCode) => {
        const statusTexts = {
            // 1xx - Informational
            100: 'Continue',
            101: 'Switching Protocols',
            102: 'Processing',
            103: 'Early Hints',

            // 2xx - Success
            200: 'OK',
            201: 'Created',
            202: 'Accepted',
            203: 'Non-Authoritative Information',
            204: 'No Content',
            205: 'Reset Content',
            206: 'Partial Content',
            207: 'Multi-Status',
            208: 'Already Reported',
            226: 'IM Used',

            // 3xx - Redirection
            300: 'Multiple Choices',
            301: 'Moved Permanently',
            302: 'Found',
            303: 'See Other',
            304: 'Not Modified',
            305: 'Use Proxy',
            307: 'Temporary Redirect',
            308: 'Permanent Redirect',

            // 4xx - Client Errors
            400: 'Bad Request',
            401: 'Unauthorized',
            402: 'Payment Required',
            403: 'Forbidden',
            404: 'Not Found',
            405: 'Method Not Allowed',
            406: 'Not Acceptable',
            407: 'Proxy Authentication Required',
            408: 'Request Timeout',
            409: 'Conflict',
            410: 'Gone',
            411: 'Length Required',
            412: 'Precondition Failed',
            413: 'Payload Too Large',
            414: 'URI Too Long',
            415: 'Unsupported Media Type',
            416: 'Range Not Satisfiable',
            417: 'Expectation Failed',
            418: "I'm a teapot",
            421: 'Misdirected Request',
            422: 'Unprocessable Entity',
            423: 'Locked',
            424: 'Failed Dependency',
            425: 'Too Early',
            426: 'Upgrade Required',
            428: 'Precondition Required',
            429: 'Too Many Requests',
            431: 'Request Header Fields Too Large',
            451: 'Unavailable For Legal Reasons',

            // 5xx - Server Errors
            500: 'Internal Server Error',
            501: 'Not Implemented',
            502: 'Bad Gateway',
            503: 'Service Unavailable',
            504: 'Gateway Timeout',
            505: 'HTTP Version Not Supported',
            506: 'Variant Also Negotiates',
            507: 'Insufficient Storage',
            508: 'Loop Detected',
            510: 'Not Extended',
            511: 'Network Authentication Required'
        };

        return statusTexts[statusCode] || 'Unknown Status';
    };

    // Helper function to format content based on content type
    const formatContentByType = (content, headers) => {
        if (!content) return "No content";

        try {
            // Check content type from headers
            const contentType = headers && headers['content-type'] ?
                headers['content-type'].toLowerCase() : '';

            // Format JSON
            if ((contentType.includes('application/json') || contentType.includes('json')) ||
                (typeof content === 'string' && (content.trim().startsWith('{') || content.trim().startsWith('[')))) {
                try {
                    const jsonObject = typeof content === 'string' ? JSON.parse(content) : content;
                    return (
                        <div className="formatted-json">
                            {JSON.stringify(jsonObject, null, 2)}
                        </div>
                    );
                } catch (e) {
                    // If JSON parsing fails, display as plain text
                    return content;
                }
            }

            // Format HTML with syntax highlighting
            if (contentType.includes('html')) {
                return (
                    <div className="formatted-html">
                        {content}
                    </div>
                );
            }

            // Format XML with syntax highlighting
            if (contentType.includes('xml')) {
                return (
                    <div className="formatted-xml">
                        {content}
                    </div>
                );
            }

            // Plain text or other types
            return content;
        } catch (error) {
            return content;
        }
    };

    const handleContentTypeChange = (value) => {
        setContentType(value);
        form.setFieldsValue({
            requestOptions: {
                ...form.getFieldValue('requestOptions'),
                contentType: value
            }
        });
    };

    // Handle refresh enabled toggle with improved state persistence
    const handleRefreshToggle = (checked) => {
        log.debug("[HttpOptions] Refresh toggle changed to:", checked);

        // Update both state and ref
        setRefreshEnabled(checked);
        refreshEnabledRef.current = checked;

        // Get current refresh options from form
        const currentRefreshOptions = form.getFieldValue('refreshOptions') || {};

        // Update form values while preserving existing settings
        form.setFieldsValue({
            refreshOptions: {
                ...currentRefreshOptions,
                enabled: checked,
                // Preserve the existing interval and type even when toggling off
                interval: currentRefreshOptions.interval || customIntervalRef.current,
                type: currentRefreshOptions.type || refreshTypeRef.current
            }
        });

        // Log the update
        log.debug("[HttpOptions] Updated refresh options in form:",
            JSON.stringify(form.getFieldValue('refreshOptions')));
    };

    // Handle refresh type change with improved state persistence
    const handleRefreshTypeChange = (e) => {
        const newType = e.target.value;
        log.debug("[HttpOptions] Refresh type changed to:", newType);

        // Update both state and ref
        setRefreshType(newType);
        refreshTypeRef.current = newType;

        // Get current refresh options to preserve values
        const currentRefreshOptions = form.getFieldValue('refreshOptions') || {};

        // IMPORTANT BUG FIX: Preserve the enabled flag when switching refresh types
        const isCurrentlyEnabled = currentRefreshOptions.enabled === true || refreshEnabledRef.current === true;

        // If switching to preset, find closest preset value when needed
        let intervalValue = currentRefreshOptions.interval || customIntervalRef.current;

        if (newType === 'preset') {
            const presetValues = [1, 5, 15, 30, 60, 120, 360, 720, 1440];
            if (!presetValues.includes(intervalValue)) {
                // Find the closest preset value
                const closest = presetValues.reduce((prev, curr) => {
                    return (Math.abs(curr - intervalValue) < Math.abs(prev - intervalValue) ? curr : prev);
                }, presetValues[0]);

                intervalValue = closest;
                setCustomInterval(intervalValue);
                customIntervalRef.current = intervalValue;
            }
        }

        // Update form values while preserving other settings
        form.setFieldsValue({
            refreshOptions: {
                ...currentRefreshOptions,
                type: newType,
                interval: intervalValue,
                // FIXED: Explicitly preserve the enabled state rather than letting it default
                enabled: isCurrentlyEnabled
            }
        });

        // Log the update
        log.debug("[HttpOptions] Updated refresh type in form:",
            JSON.stringify(form.getFieldValue('refreshOptions')));
    };

    // Handle custom interval change with improved state persistence
    const handleCustomIntervalChange = (value) => {
        // Ensure value is a positive number
        const interval = value > 0 ? value : 1;
        log.debug("[HttpOptions] Custom interval changed to:", interval);

        // Update both state and ref
        setCustomInterval(interval);
        customIntervalRef.current = interval;

        // Get current refresh options to preserve values
        const currentRefreshOptions = form.getFieldValue('refreshOptions') || {};

        // IMPORTANT BUG FIX: Preserve the enabled flag
        const isCurrentlyEnabled = currentRefreshOptions.enabled === true || refreshEnabledRef.current === true;

        // Update form values while preserving other settings
        form.setFieldsValue({
            refreshOptions: {
                ...currentRefreshOptions,
                interval: interval,
                // Ensure refresh type is set to custom
                type: 'custom',
                // FIXED: Explicitly preserve the current enabled state
                enabled: isCurrentlyEnabled
            }
        });

        // Log the update
        log.debug("[HttpOptions] Updated custom interval in form:",
            JSON.stringify(form.getFieldValue('refreshOptions')));
    };

    // Handle preset interval change with improved state persistence
    const handlePresetIntervalChange = (value) => {
        log.debug("[HttpOptions] Preset interval changed to:", value);

        // Update state and ref for consistency
        setCustomInterval(value); // We use the same state for both preset and custom
        customIntervalRef.current = value;

        // Get current refresh options to preserve values
        const currentRefreshOptions = form.getFieldValue('refreshOptions') || {};

        // IMPORTANT: Preserve the existing enabled state
        const isCurrentlyEnabled = currentRefreshOptions.enabled === true || refreshEnabledRef.current === true;

        // Update form values while preserving other settings
        form.setFieldsValue({
            refreshOptions: {
                ...currentRefreshOptions,
                interval: value,
                type: 'preset',
                // FIXED: Explicitly preserve the enabled state
                enabled: isCurrentlyEnabled
            }
        });

        // Log the update
        log.debug("[HttpOptions] Updated preset interval in form:",
            JSON.stringify(form.getFieldValue('refreshOptions')));
    };

    // Handle JSON filter toggle with improved state persistence
    const handleJsonFilterToggle = (enabled) => {
        log.debug(`[HttpOptions] JSON filter toggle changed to: ${enabled}`);

        // Update both state and ref
        setJsonFilterEnabled(enabled);
        jsonFilterEnabledRef.current = enabled;

        // Get current jsonFilter form value
        let currentJsonFilter = form.getFieldValue('jsonFilter') || { enabled: false, path: '' };

        // When disabling, always save the current path to our ref
        if (!enabled && currentJsonFilter.path) {
            jsonFilterPathRef.current = currentJsonFilter.path;
            log.debug(`[HttpOptions] Saved JSON filter path before disabling: ${currentJsonFilter.path}`);
        }

        // When enabling, decide which path to use (current form path, saved ref path, or empty)
        let pathToUse = '';
        if (enabled) {
            // First try the current form path
            if (currentJsonFilter.path) {
                pathToUse = currentJsonFilter.path;
                log.debug(`[HttpOptions] Using current form path: ${pathToUse}`);
            }
            // Then try the saved ref path
            else if (jsonFilterPathRef.current) {
                pathToUse = jsonFilterPathRef.current;
                log.debug(`[HttpOptions] Restoring saved path: ${pathToUse}`);
            }
        }

        // Create a clean object with explicit boolean type for enabled
        const updatedJsonFilter = {
            enabled: Boolean(enabled), // Ensure it's a boolean
            path: enabled ? pathToUse : '' // Only include path if enabled
        };

        // Update form values with the clean object
        form.setFieldsValue({
            jsonFilter: updatedJsonFilter
        });

        log.debug("[HttpOptions] Updated JSON filter in form:",
            JSON.stringify(form.getFieldValue('jsonFilter')));

        // If enabled but no path is set, focus the path input after a small delay
        if (enabled && !updatedJsonFilter.path) {
            setTimeout(() => {
                try {
                    // Try to find and focus the JSON path input
                    const pathInput = document.querySelector('input[id$="-jsonFilter-path"]');
                    if (pathInput) {
                        pathInput.focus();
                    }
                } catch (e) {
                    log.error("Failed to focus JSON path input:", e);
                }
            }, 100);
        }
    };

    // Handle TOTP toggle with form as source of truth
    const handleTotpToggle = (checked) => {
        log.debug("[HttpOptions] TOTP toggle changed to:", checked);

        setTotpPreviewVisible(false);
        setTotpError(null);

        // Update form values - form is source of truth
        form.setFieldsValue({ enableTOTP: checked });

        // Update requestOptions to match
        const currentRequestOptions = form.getFieldValue('requestOptions') || {};
        const currentSecret = form.getFieldValue('totpSecret');
        
        const updatedRequestOptions = {
            headers: currentRequestOptions.headers || [],
            queryParams: currentRequestOptions.queryParams || [],
            variables: currentRequestOptions.variables || [],
            contentType: currentRequestOptions.contentType || 'application/json',
            body: currentRequestOptions.body || '',
            ...currentRequestOptions
        };

        if (checked && currentSecret) {
            // Add secret to requestOptions if enabled and secret exists
            updatedRequestOptions.totpSecret = currentSecret;
            log.debug("[HttpOptions] Added TOTP secret to requestOptions");
        } else if (!checked && updatedRequestOptions.totpSecret) {
            // Remove secret from requestOptions if disabled
            delete updatedRequestOptions.totpSecret;
            log.debug("[HttpOptions] Removed TOTP secret from requestOptions");
        }
        
        form.setFieldsValue({ requestOptions: updatedRequestOptions });
    };

    // Handle TOTP secret change with form as source of truth
    const handleTotpSecretChange = (e) => {
        const newSecret = e.target.value;
        log.debug("[HttpOptions] TOTP secret changed to:", newSecret ? "exists" : "none");

        setTotpPreviewVisible(false);
        setTotpError(null);

        // Update form values - form is source of truth
        form.setFieldsValue({ totpSecret: newSecret });

        // Update requestOptions if TOTP is enabled
        const isEnabled = form.getFieldValue('enableTOTP');
        if (isEnabled) {
            const currentRequestOptions = form.getFieldValue('requestOptions') || {};
            
            const updatedRequestOptions = {
                headers: currentRequestOptions.headers || [],
                queryParams: currentRequestOptions.queryParams || [],
                variables: currentRequestOptions.variables || [],
                contentType: currentRequestOptions.contentType || 'application/json',
                body: currentRequestOptions.body || '',
                ...currentRequestOptions
            };

            if (newSecret) {
                updatedRequestOptions.totpSecret = newSecret;
            } else if (updatedRequestOptions.totpSecret) {
                delete updatedRequestOptions.totpSecret;
            }
            
            form.setFieldsValue({ requestOptions: updatedRequestOptions });
            log.debug("[HttpOptions] Updated TOTP secret in requestOptions");
        }
    };

    // Generate TOTP code using form values
    const generateTotpCode = async () => {
        try {
            const { secret } = getTotpStateFromForm();
            
            if (!secret) {
                setTotpError('Please enter a secret key');
                return;
            }

            setTotpError(null);
            setTotpTesting(true);

            // Normalize secret for better compatibility
            const normalizedSecret = secret.replace(/\s/g, '').replace(/=/g, '');

            log.debug(`[HttpOptions] Generating TOTP with secret`);

            // Use the window.generateTOTP function
            const totpCode = await window.generateTOTP(normalizedSecret, 30, 6, 0);

            if (totpCode === 'ERROR') {
                setTotpError('Failed to generate code. Check your secret key.');
                setTotpCode('ERROR');
            } else {
                setTotpCode(totpCode);
                // Trigger animation for new code
                setCodeJustGenerated(true);
                setTimeout(() => setCodeJustGenerated(false), 300);
            }
        } catch (error) {
            log.error('Error generating TOTP:', error);
            setTotpError(`Error: ${error.message}`);
            setTotpCode('ERROR');
        } finally {
            setTotpTesting(false);
        }
    };

    // Test TOTP button handler
    const handleTestTotp = async () => {
        const { secret } = getTotpStateFromForm();
        
        if (!secret) {
            setTotpError('Please enter a secret key');
            setTotpCode('NO SECRET');
            return;
        }

        setTotpPreviewVisible(true);
        await generateTotpCode();
    };

    // Update timer and regenerate code when needed
    useEffect(() => {
        if (!totpPreviewVisible) return;

        // Function to calculate time remaining in current period
        const calculateTimeRemaining = () => {
            const secondsInPeriod = 30;
            const currentSeconds = Math.floor(timeManager.now() / 1000);
            const secondsRemaining = secondsInPeriod - (currentSeconds % secondsInPeriod);
            return secondsRemaining;
        };

        // Track the last period to avoid multiple regenerations
        let lastPeriod = Math.floor(timeManager.now() / 1000 / 30);

        // Initial timer setup
        setTimeRemaining(calculateTimeRemaining());

        // Set up interval for countdown and code regeneration
        const timer = setInterval(() => {
            const remaining = calculateTimeRemaining();
            setTimeRemaining(remaining);
            
            // Check if we've entered a new 30-second period
            const currentPeriod = Math.floor(timeManager.now() / 1000 / 30);
            if (currentPeriod !== lastPeriod) {
                lastPeriod = currentPeriod;
                generateTotpCode();
            }
        }, 100); // Update every 100ms for smoother countdown

        return () => clearInterval(timer);
    }, [totpPreviewVisible]); // Remove totpSecret dependency since we get it from form now

    // Track TOTP source in context
    useEffect(() => {
        const { enabled, secret } = getTotpStateFromForm();
        
        if (enabled && secret && effectiveSourceId) {
            trackTotpSecret(effectiveSourceId);
        }
        
        // Cleanup on unmount
        return () => {
            if (effectiveSourceId) {
                untrackTotpSecret(effectiveSourceId);
            }
        };
    }, [getTotpStateFromForm, effectiveSourceId, trackTotpSecret, untrackTotpSecret]);

    // Format response for display - Professional format
    const formatResponseForDisplay = (responseJson) => {
        try {
            const response = JSON.parse(responseJson);
            return response;
        } catch (error) {
            return {
                statusCode: 0,
                error: "Failed to parse response",
                body: responseJson || "No content"
            };
        }
    };

    // Handle test request
    const handleTestRequest = async () => {
        const { enabled: totpEnabled, secret: totpSecret } = getTotpStateFromForm();
        
        try {
            // Check TOTP cooldown first
            if (totpEnabled && totpSecret && !canUseTotpSecret(effectiveSourceId)) {
                const cooldownSeconds = getCooldownSeconds(effectiveSourceId);
                showMessage('warning', `TOTP code was recently used. Please wait ${cooldownSeconds} seconds before making another request.`);
                return;
            }

            // Get current form values
            const values = form.getFieldsValue();
            if (!values.sourcePath) {
                showMessage('error', 'Please enter a URL');
                return;
            }

            // Ensure URL has protocol
            let url = values.sourcePath;
            if (!url.match(/^https?:\/\//i)) {
                url = 'https://' + url;
                form.setFieldsValue({ sourcePath: url });
            }

            // CRITICAL: Ensure that form structure is complete
            if (!values.requestOptions) {
                values.requestOptions = {};
            }

            if (!Array.isArray(values.requestOptions.headers)) {
                values.requestOptions.headers = [];
                log.debug("[HttpOptions] Fixed missing headers array in form");
            }

            // IMPORTANT FIX: Also check for queryParams array
            if (!Array.isArray(values.requestOptions.queryParams)) {
                values.requestOptions.queryParams = [];
                log.debug("[HttpOptions] Fixed missing queryParams array in form");
            }

            // CRITICAL FIX: Ensure variables array is included and properly copied
            if (!Array.isArray(values.requestOptions.variables)) {
                // Get variables directly from the form field
                const formVariables = form.getFieldValue(['requestOptions', 'variables']);
                values.requestOptions.variables = Array.isArray(formVariables)
                    ? JSON.parse(JSON.stringify(formVariables)) // Deep copy to avoid reference issues
                    : [];
                log.debug("[HttpOptions] Fixed missing variables array, found variables:",
                    values.requestOptions.variables.length);
            }

            if (!values.jsonFilter) {
                values.jsonFilter = { enabled: false, path: '' };
                log.debug("[HttpOptions] Fixed missing jsonFilter in form");
            }

            // DEBUGGING: Log the complete variables array
            log.debug("[HttpOptions] Variables for HTTP request:",
                JSON.stringify(values.requestOptions.variables));

            // Check if JSON filter is enabled but missing a path
            if (values.jsonFilter?.enabled === true && !values.jsonFilter?.path) {
                showMessage('error', 'JSON filter is enabled but no path is specified. Please enter a JSON path.');
                return;
            }

            // Show loading
            setTesting(true);
            if (onTestingChange) {
                onTestingChange(true);
            }
            setTestResponseVisible(false);
            
            // Check if request uses TOTP and notify context
            const usesTotp = checkIfRequestUsesTotp(url, values.sourceMethod || 'GET', values.requestOptions);
            if (usesTotp && totpSecret && effectiveSourceId) {
                startTestingWithTotp(effectiveSourceId);
            }

            // Get content type from form
            const formContentType = form.getFieldValue(['requestOptions', 'contentType']);
            const contentType = formContentType || values.requestOptions?.contentType || 'application/json';
            
            log.debug("[HttpOptions] Content type from form:", formContentType);
            log.debug("[HttpOptions] Content type from values:", values.requestOptions?.contentType);
            log.debug("[HttpOptions] Final content type:", contentType);
            
            // Prepare request options with defaults to ensure complete structure
            const requestOptions = {
                queryParams: {},
                headers: [],  // Keep as array initially for variable substitution
                body: null,
                contentType: contentType,
                // CRITICAL: Include the variables array explicitly
                variables: values.requestOptions.variables || []
            };

            // Log the headers directly from the form for debugging
            const formHeaders = form.getFieldValue(['requestOptions', 'headers']);
            log.debug("[HttpOptions] Headers direct from form:", formHeaders);

            // IMPORTANT FIX: Also log queryParams directly from the form
            const formQueryParams = form.getFieldValue(['requestOptions', 'queryParams']);
            log.debug("[HttpOptions] Query params direct from form:", formQueryParams);

            // IMPORTANT FIX: Log variables directly from the form
            const formVariables = form.getFieldValue(['requestOptions', 'variables']);
            log.debug("[HttpOptions] Variables direct from form:", formVariables);

            // Add query params if defined - FIX: Use formQueryParams directly
            if (Array.isArray(formQueryParams) && formQueryParams.length > 0) {
                log.debug("[HttpOptions] Explicitly using query params from form field");
                formQueryParams.forEach(param => {
                    if (param && param.key) {
                        requestOptions.queryParams[param.key] = param.value || '';
                        log.debug(`[HttpOptions] Added query param from form: ${param.key} = ${param.value || ''}`);
                    }
                });
            } else if (values.requestOptions?.queryParams && Array.isArray(values.requestOptions.queryParams)) {
                values.requestOptions.queryParams.forEach(param => {
                    if (param && param.key) {
                        requestOptions.queryParams[param.key] = param.value || '';
                        log.debug(`[HttpOptions] Added query param: ${param.key} = ${param.value || ''}`);
                    }
                });
            }
            log.debug("[HttpOptions] Query params after formatting:", requestOptions.queryParams);

            // CHANGED: Keep headers as array format for variable substitution
            log.debug("[HttpOptions] Full requestOptions from form:", JSON.stringify(values.requestOptions || {}, null, 2));
            log.debug("[HttpOptions] Headers from form:", values.requestOptions?.headers);

            // CHANGED: Pass headers as array to preserve variable references
            if (Array.isArray(formHeaders) && formHeaders.length > 0) {
                log.debug("[HttpOptions] Explicitly using headers from form field as array");
                requestOptions.headers = JSON.parse(JSON.stringify(formHeaders)); // Deep copy
                log.debug(`[HttpOptions] Added ${requestOptions.headers.length} headers as array`);
            } else if (values.requestOptions?.headers && Array.isArray(values.requestOptions.headers)) {
                requestOptions.headers = JSON.parse(JSON.stringify(values.requestOptions.headers));
                log.debug(`[HttpOptions] Added headers from values as array`);
            }
            log.debug("[HttpOptions] Headers after formatting (array):", requestOptions.headers);

            // CRITICAL FIX: Make sure variables are explicitly included in the requestOptions
            if (Array.isArray(formVariables) && formVariables.length > 0) {
                log.debug("[HttpOptions] Explicitly using variables from form field");
                // Deep copy the variables to avoid reference issues
                requestOptions.variables = JSON.parse(JSON.stringify(formVariables));
                log.debug(`[HttpOptions] Added ${requestOptions.variables.length} variables to request options`);
            }

            // Add body if applicable
            if (['POST', 'PUT', 'PATCH'].includes(values.sourceMethod)) {
                // Get body from form - it might be at the top level or in requestOptions
                const formBody = form.getFieldValue(['requestOptions', 'body']);
                const requestBody = formBody || values.requestOptions?.body || null;
                
                log.debug("[HttpOptions] Body from form field:", formBody);
                log.debug("[HttpOptions] Body from values:", values.requestOptions?.body);
                
                if (requestBody) {
                    requestOptions.body = requestBody;
                    log.debug("[HttpOptions] Added body to request options");
                } else {
                    log.debug("[HttpOptions] No body found for request");
                }
            }

            // Add TOTP secret if enabled
            if (totpEnabled && totpSecret) {
                requestOptions.totpSecret = totpSecret;
                log.debug("[HttpOptions] Adding TOTP secret to request");
                // Note: TOTP usage is recorded by useHttp hook when the actual request is made
            }

            // Add JSON filter from form values - properly check both enabled flag and state
            log.debug("[HttpOptions] JSON Filter from form:", values.jsonFilter);

            // Create a new jsonFilter object ensuring we check the form state correctly
            const jsonFilter = { enabled: false, path: '' };

            // Check if jsonFilter is enabled in the form
            if (values.jsonFilter && values.jsonFilter.enabled === true && values.jsonFilter.path) {
                jsonFilter.enabled = true;
                jsonFilter.path = values.jsonFilter.path;
                log.debug(`[HttpOptions] JSON Filter is ENABLED with path: ${values.jsonFilter.path}`);
            }

            // Alternatively, check if component state says it's enabled
            else if (jsonFilterEnabled && values.jsonFilter?.path) {
                jsonFilter.enabled = true;
                jsonFilter.path = values.jsonFilter.path;
                log.debug(`[HttpOptions] JSON Filter enabled from component state with path: ${values.jsonFilter.path}`);
            }

            log.debug("[HttpOptions] Final JSON Filter for test:", jsonFilter);
            log.debug("[HttpOptions] Making test request with headers (array):", requestOptions.headers);
            log.debug("[HttpOptions] Making test request with query params:", requestOptions.queryParams);
            log.debug("[HttpOptions] Making test request with variables:", requestOptions.variables);

            // Make the test request
            const response = await http.testRequest(
                url,
                values.sourceMethod || 'GET',
                requestOptions,
                jsonFilter,
                effectiveSourceId
            );

            // Save the raw response for later use
            setRawResponse(response);

            // Format the response for display
            setTestResponseContent(formatResponseForDisplay(response));
            setTestResponseVisible(true);

            // Send to parent
            if (onTestResponse) {
                onTestResponse(response);
            }
        } catch (error) {
            showMessage('error', `Failed to test request: ${error.message}`);
        } finally {
            setTesting(false);
            if (onTestingChange) {
                onTestingChange(false);
            }
            // End TOTP testing if it was started
            if (totpEnabled && totpSecret && effectiveSourceId) {
                endTestingWithTotp(effectiveSourceId);
            }
        }
    };

    return (
        <div className="http-options">
            <Row gutter={16}>
                <Col span={4}>
                    <Form.Item
                        name="sourceMethod"
                        label="HTTP Method"
                    >
                        <Select style={{ width: '100%' }} size="small">
                            <Option value="GET">GET</Option>
                            <Option value="POST">POST</Option>
                            <Option value="PUT">PUT</Option>
                            <Option value="PATCH">PATCH</Option>
                            <Option value="DELETE">DELETE</Option>
                        </Select>
                    </Form.Item>
                </Col>
                <Col span={20}>
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
                            const hasCooldown = isEnabled && secret && !canUseTotpSecret(effectiveSourceId);
                            
                            return (
                                <Tooltip
                                    title={
                                        testing ? "Test request in progress..." :
                                        hasCooldown ? 
                                            `TOTP code was recently used. Please wait ${getCooldownSeconds(effectiveSourceId)} seconds before making another request.` :
                                            "Test the HTTP request with current settings"
                                    }
                                >
                                    <Button
                                        type="primary"
                                        onClick={handleTestRequest}
                                        loading={testing || hasCooldown}
                                        disabled={hasCooldown}
                                        size="small"
                                        className="test-request-button"
                                    >
                                        Test Request
                                    </Button>
                                </Tooltip>
                            );
                        }}
                    </Form.Item>
                </Col>
            </Row>

            {/* Tabs for different options */}
            <Tabs
                defaultActiveKey="options" // Default to options tab to make JSON filter more visible
                type="card"
                size="small"
                style={{ marginBottom: 10 }}
                items={[
                    {
                        key: 'headers',
                        label: 'Headers',
                        children: (
                            <Form.List name={['requestOptions', 'headers']}>
                                {(fields, { add, remove }) => (
                                    <>
                                        {fields.map(({ key, name, ...restField }) => (
                                            <Space
                                                key={key}
                                                style={{ display: 'flex', marginBottom: 8 }}
                                                align="baseline"
                                                size="small"
                                            >
                                                <Form.Item
                                                    {...restField}
                                                    name={[name, 'key']}
                                                    rules={[{ required: true, message: 'Missing key' }]}
                                                    style={{ marginBottom: 0 }}
                                                >
                                                    <Input placeholder="Header name" size="small" />
                                                </Form.Item>
                                                <Form.Item
                                                    {...restField}
                                                    name={[name, 'value']}
                                                    style={{ marginBottom: 0 }}
                                                >
                                                    <Input placeholder="Value" size="small" />
                                                </Form.Item>
                                                <MinusCircleOutlined
                                                    onClick={() => remove(name)}
                                                />
                                            </Space>
                                        ))}
                                        <Form.Item style={{ marginBottom: 0 }}>
                                            <Button
                                                type="dashed"
                                                onClick={() => add()}
                                                block
                                                icon={<PlusOutlined />}
                                                size="small"
                                            >
                                                Add Header
                                            </Button>
                                        </Form.Item>
                                    </>
                                )}
                            </Form.List>
                        )
                    },
                    {
                        key: 'queryParams',
                        label: 'Query Params',
                        children: (
                            <Form.List name={['requestOptions', 'queryParams']}>
                                {(fields, { add, remove }) => (
                                    <>
                                        {fields.map(({ key, name, ...restField }) => (
                                            <Space
                                                key={key}
                                                style={{ display: 'flex', marginBottom: 8 }}
                                                align="baseline"
                                                size="small"
                                            >
                                                <Form.Item
                                                    {...restField}
                                                    name={[name, 'key']}
                                                    rules={[{ required: true, message: 'Missing key' }]}
                                                    style={{ marginBottom: 0 }}
                                                >
                                                    <Input placeholder="Parameter name" size="small" />
                                                </Form.Item>
                                                <Form.Item
                                                    {...restField}
                                                    name={[name, 'value']}
                                                    style={{ marginBottom: 0 }}
                                                >
                                                    <Input placeholder="Value" size="small" />
                                                </Form.Item>
                                                <MinusCircleOutlined
                                                    onClick={() => remove(name)}
                                                />
                                            </Space>
                                        ))}
                                        <Form.Item style={{ marginBottom: 0 }}>
                                            <Button
                                                type="dashed"
                                                onClick={() => add()}
                                                block
                                                icon={<PlusOutlined />}
                                                size="small"
                                            >
                                                Add Query Parameter
                                            </Button>
                                        </Form.Item>
                                    </>
                                )}
                            </Form.List>
                        )
                    },
                    {
                        key: 'body',
                        label: 'Body',
                        children: (
                            <Row gutter={16}>
                                <Col span={6}>
                                    <Form.Item
                                        name={['requestOptions', 'contentType']}
                                        label="Content Type"
                                    >
                                        <Select onChange={handleContentTypeChange} size="small">
                                            <Option value="application/json">JSON</Option>
                                            <Option value="application/x-www-form-urlencoded">Form URL Encoded</Option>
                                        </Select>
                                    </Form.Item>
                                </Col>
                                <Col span={18}>
                                    <Form.Item
                                        name={['requestOptions', 'body']}
                                        label={contentType === 'application/json' ? 'JSON Body' : 'Form URL Encoded Body'}
                                    >
                                        <TextArea
                                            rows={3}
                                            placeholder={contentType === 'application/json'
                                                ? 'Enter JSON body'
                                                : 'key1:value1\nkey2:value2\n...'}
                                            size="small"
                                        />
                                    </Form.Item>
                                </Col>
                            </Row>
                        )
                    },
                    {
                        key: 'options',
                        label: 'Options',
                        children: (
                            <Row gutter={16}>
                                <Col span={12}>
                                    {/* JSON Filter */}
                                    <Card size="small" title="JSON Filter"
                                          extra={
                                              <Form.Item
                                                  name={['jsonFilter', 'enabled']}
                                                  valuePropName="checked"
                                                  initialValue={false}
                                                  noStyle
                                              >
                                                  <Switch
                                                      size="small"
                                                      checkedChildren="On"
                                                      unCheckedChildren="Off"
                                                      onChange={handleJsonFilterToggle}
                                                      checked={jsonFilterEnabled}
                                                  />
                                              </Form.Item>
                                          }
                                          style={{ marginBottom: 8 }}
                                    >
                                        {(jsonFilterEnabled || !!form.getFieldValue(['jsonFilter', 'enabled'])) && (
                                            <Form.Item
                                                name={['jsonFilter', 'path']}
                                                label="JSON Path"
                                                rules={[{ required: true, message: 'Required' }]}
                                            >
                                                <Input
                                                    placeholder="e.g., root.data.items[0].name"
                                                    size="small"
                                                />
                                            </Form.Item>
                                        )}

                                        {/* CHANGED: Replace success/secondary text with a more subtle indicator */}
                                        <Text type="secondary" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
                                            {jsonFilterEnabled ? 'Filter will extract specific data from JSON response' : 'Full JSON response will be used'}
                                        </Text>
                                    </Card>

                                    {/* TOTP Authentication */}
                                    <Card
                                        size="small"
                                        title="TOTP Authentication"
                                        extra={
                                            <Form.Item
                                                name="enableTOTP"
                                                valuePropName="checked"
                                                noStyle
                                            >
                                                <Switch
                                                    size="small"
                                                    checkedChildren="On"
                                                    unCheckedChildren="Off"
                                                    onChange={handleTotpToggle}
                                                />
                                            </Form.Item>
                                        }
                                        style={{ marginBottom: 8 }}
                                    >
                                        <Form.Item
                                            noStyle
                                            shouldUpdate={(prevValues, currentValues) => 
                                                prevValues.enableTOTP !== currentValues.enableTOTP
                                            }
                                        >
                                            {({ getFieldValue }) => {
                                                const isEnabled = getFieldValue('enableTOTP');
                                                return isEnabled ? (
                                                    <>
                                                        <div style={{ marginBottom: 16 }}>
                                                            <Form.Item
                                                                name="totpSecret"
                                                                rules={[{ required: true, message: 'TOTP secret is required' }]}
                                                            >
                                                                <Input
                                                                    placeholder="Enter TOTP secret key"
                                                                    onChange={handleTotpSecretChange}
                                                                    status={totpError ? "error" : ""}
                                                                    size="small"
                                                                    addonAfter={
                                                                        <Button
                                                                            type="link"
                                                                            size="small"
                                                                            onClick={handleTestTotp}
                                                                            style={{ padding: '0 4px' }}
                                                                            loading={totpTesting}
                                                                        >
                                                                            Test
                                                                        </Button>
                                                                    }
                                                                />
                                                            </Form.Item>
                                                            {totpError && <Text type="danger" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>{totpError}</Text>}
                                                        </div>

                                                <div style={{ marginTop: 4, marginBottom: 4 }}>
                                                    <Text type="secondary" style={{ fontSize: 11 }}>
                                                        <strong>Tips:</strong> Enter the secret key exactly as provided by the service.
                                                    </Text>
                                                </div>

                                                {totpPreviewVisible && (
                                                    <Card size="small" style={{ marginBottom: 8 }}>
                                                        <Space direction="vertical" style={{ width: '100%' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <Space>
                                                                    <Text 
                                                                        strong 
                                                                        copyable={totpCode !== 'ERROR'}
                                                                        style={{ 
                                                                            fontSize: '1.5rem',
                                                                            fontFamily: 'monospace'
                                                                        }}
                                                                        type={totpCode === 'ERROR' ? 'danger' : undefined}
                                                                    >
                                                                        {totpCode}
                                                                    </Text>
                                                                </Space>
                                                                {totpCode !== 'ERROR' && (
                                                                    <div style={{ textAlign: 'center' }}>
                                                                        <Text strong style={{ fontSize: '1.2rem' }} type={timeRemaining <= 5 ? 'danger' : 'success'}>
                                                                            {timeRemaining}s
                                                                        </Text>
                                                                        <br />
                                                                        <Text type="secondary" style={{ fontSize: '11px' }}>
                                                                            Time remaining
                                                                        </Text>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            {totpCode !== 'ERROR' && (
                                                                <Progress 
                                                                    percent={(timeRemaining / 30) * 100} 
                                                                    showInfo={false}
                                                                    status={timeRemaining <= 5 ? 'exception' : 'success'}
                                                                    size="small"
                                                                />
                                                            )}
                                                        </Space>
                                                    </Card>
                                                )}

                                                <Text type="secondary" style={{ fontSize: 11 }}>
                                                    Use <code>_TOTP_CODE</code> in any URL, header, or body field
                                                </Text>

                                                {/* TOTP Cooldown Warning */}
                                                <Form.Item
                                                    noStyle
                                                    shouldUpdate={(prevValues, currentValues) => 
                                                        prevValues.totpSecret !== currentValues.totpSecret
                                                    }
                                                >
                                                    {({ getFieldValue }) => {
                                                        const secret = getFieldValue('totpSecret');
                                                        return secret && effectiveSourceId && !canUseTotpSecret(effectiveSourceId) ? (
                                                            <Alert
                                                                type="warning"
                                                                message={`⏱️ TOTP cooldown active: ${getCooldownSeconds(effectiveSourceId)} seconds remaining`}
                                                                style={{ marginTop: 8 }}
                                                                description="Please wait before making another request with this source."
                                                                showIcon={false}
                                                            />
                                                        ) : null;
                                                    }}
                                                </Form.Item>
                                                    </>
                                                ) : null;
                                            }}
                                        </Form.Item>
                                    </Card>
                                </Col>
                                <Col span={12}>
                                    {/* Auto-Refresh */}
                                    <Card
                                        size="small"
                                        title="Auto-Refresh"
                                        extra={
                                            <Form.Item
                                                name={['refreshOptions', 'enabled']}
                                                valuePropName="checked"
                                                noStyle
                                            >
                                                <Switch
                                                    size="small"
                                                    checkedChildren="On"
                                                    unCheckedChildren="Off"
                                                    onChange={handleRefreshToggle}
                                                    checked={refreshEnabled}
                                                />
                                            </Form.Item>
                                        }
                                    >
                                        {(refreshEnabled || !!form.getFieldValue(['refreshOptions', 'enabled'])) && (
                                            <Row gutter={[8, 8]}>
                                                <Col span={24}>
                                                    <Form.Item
                                                        name={['refreshOptions', 'type']}
                                                        initialValue="preset"
                                                        style={{ marginBottom: 8 }}
                                                    >
                                                        <Radio.Group
                                                            onChange={handleRefreshTypeChange}
                                                            value={refreshType}
                                                            size="small"
                                                        >
                                                            <Radio value="preset">Preset</Radio>
                                                            <Radio value="custom">Custom</Radio>
                                                        </Radio.Group>
                                                    </Form.Item>
                                                </Col>
                                                <Col span={24}>
                                                    {(refreshType === 'preset' || form.getFieldValue(['refreshOptions', 'type']) === 'preset') ? (
                                                        <Form.Item
                                                            name={['refreshOptions', 'interval']}
                                                            initialValue={15}
                                                            style={{ marginBottom: 0 }}
                                                        >
                                                            <Select onChange={handlePresetIntervalChange} size="small">
                                                                <Option value={1}>Every 1 minute</Option>
                                                                <Option value={5}>Every 5 minutes</Option>
                                                                <Option value={15}>Every 15 minutes</Option>
                                                                <Option value={30}>Every 30 minutes</Option>
                                                                <Option value={60}>Every hour</Option>
                                                                <Option value={120}>Every 2 hours</Option>
                                                            </Select>
                                                        </Form.Item>
                                                    ) : (
                                                        <Form.Item
                                                            name={['refreshOptions', 'interval']}
                                                            initialValue={15}
                                                            style={{ marginBottom: 0 }}
                                                        >
                                                            <InputNumber
                                                                min={1}
                                                                max={10080}
                                                                value={customInterval}
                                                                onChange={handleCustomIntervalChange}
                                                                addonAfter="minutes"
                                                                size="small"
                                                                style={{ width: '100%' }}
                                                            />
                                                        </Form.Item>
                                                    )}
                                                </Col>
                                            </Row>
                                        )}
                                    </Card>
                                </Col>
                            </Row>
                        )
                    },
                    {
                        key: 'variables',
                        label: 'Variables',
                        children: (
                            <Form.List name={['requestOptions', 'variables']}>
                                {(fields, { add, remove }) => (
                                    <>
                                        {fields.map(({ key, name, ...restField }) => (
                                            <Space
                                                key={key}
                                                style={{ display: 'flex', marginBottom: 8 }}
                                                align="baseline"
                                                size="small"
                                            >
                                                <Form.Item
                                                    {...restField}
                                                    name={[name, 'key']}
                                                    rules={[{ required: true, message: 'Missing key' }]}
                                                    style={{ marginBottom: 0 }}
                                                >
                                                    <Input placeholder="Variable name" size="small" />
                                                </Form.Item>
                                                <Form.Item
                                                    {...restField}
                                                    name={[name, 'value']}
                                                    style={{ marginBottom: 0 }}
                                                >
                                                    <Input placeholder="Value" size="small" />
                                                </Form.Item>
                                                <MinusCircleOutlined
                                                    onClick={() => remove(name)}
                                                />
                                            </Space>
                                        ))}
                                        <Form.Item style={{ marginBottom: 0 }}>
                                            <Button
                                                type="dashed"
                                                onClick={() => add()}
                                                block
                                                icon={<PlusOutlined />}
                                                size="small"
                                            >
                                                Add Variable
                                            </Button>
                                        </Form.Item>
                                        <Text type="secondary" style={{ marginTop: 8, fontSize: 11, display: 'block' }}>
                                            Use variables like <code>_VARIABLE_NAME</code> in URL, headers, query params, or body
                                        </Text>
                                    </>
                                )}
                            </Form.List>
                        )
                    }
                ]}
            />

            {/* Test Response section */}
            {testResponseVisible && (
                <Card
                    title={
                        <div className="response-card-header">
                            <span>Response Preview</span>
                            {typeof testResponseContent === 'object' && testResponseContent.statusCode && (
                                <span className="status-display">
                                    Status Code <span className={`status-code status-${Math.floor(testResponseContent.statusCode / 100)}xx`}>
                                        {testResponseContent.statusCode} {getStatusText(testResponseContent.statusCode)}
                                    </span>
                                </span>
                            )}
                        </div>
                    }
                    size="small"
                    style={{ marginTop: 8 }}
                    className="response-preview-card"
                >
                    {typeof testResponseContent === 'object' ? (
                        <Tabs
                            defaultActiveKey="body"
                            size="small"
                            items={[
                                {
                                    key: 'body',
                                    label: 'Body',
                                    children: (
                                        <pre className="response-body">
                                            {(() => {
                                                try {
                                                    // Check if it's filterable JSON
                                                    if (testResponseContent.filteredWith) {
                                                        return (
                                                            <div>
                                                                <div className="filter-info">
                                                                    [Filtered with path: {testResponseContent.filteredWith}]
                                                                </div>
                                                                {formatContentByType(testResponseContent.body, testResponseContent.headers)}
                                                            </div>
                                                        );
                                                    }

                                                    // Standard body formatting
                                                    return formatContentByType(testResponseContent.body, testResponseContent.headers);
                                                } catch (e) {
                                                    return testResponseContent.body || "No body content";
                                                }
                                            })()}
                                        </pre>
                                    )
                                },
                                {
                                    key: 'headers',
                                    label: 'Headers',
                                    children: (
                                        <div className="response-headers">
                                            {testResponseContent.headers ? (
                                                <table className="headers-table">
                                                    <thead>
                                                    <tr>
                                                        <th>Name</th>
                                                        <th>Value</th>
                                                    </tr>
                                                    </thead>
                                                    <tbody>
                                                    {Object.entries(testResponseContent.headers).map(([key, value]) => (
                                                        <tr key={key}>
                                                            <td>{key}</td>
                                                            <td>{value}</td>
                                                        </tr>
                                                    ))}
                                                    </tbody>
                                                </table>
                                            ) : (
                                                <div className="no-headers">No headers available</div>
                                            )}
                                        </div>
                                    )
                                },
                                {
                                    key: 'raw',
                                    label: 'Raw',
                                    children: (
                                        <pre className="response-raw">
                                            {JSON.stringify(testResponseContent, null, 2)}
                                        </pre>
                                    )
                                }
                            ]}
                        />
                    ) : (
                        <pre className="response-error">
                            {testResponseContent}
                        </pre>
                    )}
                </Card>
            )}
        </div>
    );
});

export default HttpOptions;