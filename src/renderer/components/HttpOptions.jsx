import React, { useState, useEffect, useImperativeHandle, forwardRef, useRef, useCallback } from 'react';
import { Tabs, Form, Input, Select, Button, Card, Space, Radio, InputNumber, Switch, Row, Col, Typography } from 'antd';
import { PlusOutlined, MinusCircleOutlined } from '@ant-design/icons';
import { useHttp } from '../hooks/useHttp';
import JsonFilter from './JsonFilter';
import { showMessage } from '../utils/messageUtil';

const { Option } = Select;
const { TextArea } = Input;
const { Text } = Typography;

/**
 * HttpOptions component for configuring HTTP requests with compact layout
 * With integrated TOTP Authentication - now with ref forwarding and improved state persistence
 */
const HttpOptions = forwardRef(({ form, onTestResponse, onTotpChange, initialTotpEnabled, initialTotpSecret }, ref) => {
    // Component state
    const [contentType, setContentType] = useState('application/json');
    const [testResponseVisible, setTestResponseVisible] = useState(false);
    const [testResponseContent, setTestResponseContent] = useState('');
    const [testing, setTesting] = useState(false);

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

    // State for TOTP with refs for persistence
    const [totpEnabled, setTotpEnabled] = useState(false);
    const [totpSecret, setTotpSecret] = useState('');
    const [totpCode, setTotpCode] = useState('------');
    const [totpError, setTotpError] = useState(null);
    const [totpTesting, setTotpTesting] = useState(false);
    const [totpPreviewVisible, setTotpPreviewVisible] = useState(false);
    const totpEnabledRef = useRef(false);
    const totpSecretRef = useRef('');

    const [isFormInitialized, setIsFormInitialized] = useState(false);

    // Track last notified values to prevent notification loops
    const lastNotifiedRef = useRef({ enabled: null, secret: null });

    // Store the callback in a ref to avoid dependency cycles
    const notifyParentRef = useRef(onTotpChange);

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
            console.log(`[HttpOptions] Syncing jsonFilterEnabled state with form: ${formJsonFilter.enabled}`);
            setJsonFilterEnabled(formJsonFilter.enabled);
            jsonFilterEnabledRef.current = formJsonFilter.enabled;

            // Store the path in the ref if it exists
            if (formJsonFilter.path) {
                jsonFilterPathRef.current = formJsonFilter.path;
                console.log(`[HttpOptions] Storing JSON filter path in ref: ${formJsonFilter.path}`);
            }
        }
    }, [form, jsonFilterEnabled, isFormInitialized]);

    // Expose methods via ref to the parent component
    useImperativeHandle(ref, () => ({
        // Method to force TOTP state directly
        forceTotpState: (enabled, secret) => {
            console.log(`[HttpOptions] forceTotpState called with enabled=${enabled}, secret=${secret ? "exists" : "none"}`);

            // Update state and refs
            setTotpEnabled(enabled);
            totpEnabledRef.current = enabled;

            if (secret) {
                setTotpSecret(secret);
                totpSecretRef.current = secret;
            }

            // Update form values as well
            form.setFieldsValue({
                enableTOTP: enabled,
                totpSecret: secret
            });

            // CRITICAL FIX: Always update requestOptions to match
            const requestOptions = form.getFieldValue('requestOptions') || {};

            if (enabled && secret) {
                // Add totpSecret to requestOptions
                requestOptions.totpSecret = secret;
                form.setFieldsValue({ requestOptions });
                console.log("[HttpOptions] Added TOTP secret to requestOptions via forceTotpState");
            } else if (!enabled && requestOptions.totpSecret) {
                // Remove totpSecret from requestOptions
                delete requestOptions.totpSecret;
                form.setFieldsValue({ requestOptions });
                console.log("[HttpOptions] Removed TOTP secret from requestOptions via forceTotpState");
            }

            // Update last notified values to prevent notification loop
            lastNotifiedRef.current = { enabled, secret };

            return true;
        },

        // IMPROVED: More robust getTotpState method
        getTotpState: () => {
            // First check the component state (most accurate for active UI)
            const currentEnabledState = totpEnabled;
            const currentSecretState = totpSecret;

            console.log(`[HttpOptions] getTotpState checking component state: enabled=${currentEnabledState}, secret=${currentSecretState ? "exists" : "none"}`);

            // If component state is enabled and has a secret, use it
            if (currentEnabledState && currentSecretState) {
                console.log(`[HttpOptions] getTotpState returning from component state: enabled=true, secret=exists`);
                return {
                    enabled: true,
                    secret: currentSecretState
                };
            }

            // Next check form values (these might be newer than component state in some cases)
            const formEnabled = form.getFieldValue('enableTOTP');
            const formSecret = form.getFieldValue('totpSecret');

            console.log(`[HttpOptions] getTotpState checking form values: enabled=${formEnabled}, secret=${formSecret ? "exists" : "none"}`);

            // If form has enabled TOTP and has a secret, use it
            if (formEnabled && formSecret) {
                console.log(`[HttpOptions] getTotpState returning from form values: enabled=true, secret=exists`);
                return {
                    enabled: true,
                    secret: formSecret
                };
            }

            // Check refs as a last resort (these preserve state across re-renders)
            const refEnabled = totpEnabledRef.current;
            const refSecret = totpSecretRef.current;

            console.log(`[HttpOptions] getTotpState checking refs: enabled=${refEnabled}, secret=${refSecret ? "exists" : "none"}`);

            // If refs have TOTP enabled and a secret, use them
            if (refEnabled && refSecret) {
                console.log(`[HttpOptions] getTotpState returning from refs: enabled=true, secret=exists`);
                return {
                    enabled: true,
                    secret: refSecret
                };
            }

            // Check requestOptions directly (for already saved/existing TOTP settings)
            const requestOptions = form.getFieldValue('requestOptions') || {};
            if (requestOptions.totpSecret) {
                console.log(`[HttpOptions] getTotpState found TOTP secret in requestOptions`);
                return {
                    enabled: true,
                    secret: requestOptions.totpSecret
                };
            }

            // If we get here, TOTP is not enabled or has no secret
            console.log(`[HttpOptions] getTotpState returning disabled state with no secret`);
            return {
                enabled: false,
                secret: ''
            };
        },

        // Method to force sync form fields directly - especially for debugging
        syncFormState: () => {
            // Get all current form values for debugging
            const allValues = form.getFieldsValue(true);
            console.log('[HttpOptions] Current form values:', {
                requestOptions: allValues.requestOptions,
                jsonFilter: allValues.jsonFilter
            });
        },

        // In the useImperativeHandle section:
        forceHeadersState: (headers) => {
            console.log(`[HttpOptions] forceHeadersState called with ${headers?.length || 0} headers`);

            // Update form values
            if (Array.isArray(headers) && headers.length > 0) {
                form.setFieldValue(['requestOptions', 'headers'], headers);
                console.log('[HttpOptions] Directly set headers in form:', headers);
            }

            return true;
        },

        getHeadersState: () => {
            // Get the current headers from the form
            const headers = form.getFieldValue(['requestOptions', 'headers']);
            return Array.isArray(headers) ? headers : [];
        },

        getJsonFilterState: () => {
            // First check the direct Form value (most accurate)
            const jsonFilter = form.getFieldValue('jsonFilter');

            // Debug log
            console.log('[HttpOptions] Current JSON filter in form:', jsonFilter);
            console.log('[HttpOptions] Current jsonFilterEnabled state:', jsonFilterEnabled);

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
            console.log('[HttpOptions] Returning normalized JSON filter state:',
                JSON.stringify(result));

            return result;
        },

        // Method to explicitly sync JSON filter state
        forceJsonFilterState: (enabled, path) => {
            console.log(`[HttpOptions] forceJsonFilterState called with enabled=${enabled}, path=${path}`);

            // Normalize the values
            const normalizedEnabled = Boolean(enabled);
            const normalizedPath = normalizedEnabled ? (path || '') : '';

            // Update component state and ref
            setJsonFilterEnabled(normalizedEnabled);
            jsonFilterEnabledRef.current = normalizedEnabled;

            // Always store the path in the ref, even when disabling
            if (path) {
                jsonFilterPathRef.current = path;
                console.log(`[HttpOptions] Storing forced path in ref: ${path}`);
            }

            // Update form values
            form.setFieldsValue({
                jsonFilter: {
                    enabled: normalizedEnabled,
                    path: normalizedPath
                }
            });

            console.log(`[HttpOptions] JSON filter state forced to: enabled=${normalizedEnabled}, path=${normalizedPath}`);
            return true;
        }
    }));

    // Initialize using props
    useEffect(() => {
        if (initialTotpEnabled !== undefined && initialTotpSecret) {
            console.log(`[HttpOptions] Initializing from props: enabled=${initialTotpEnabled}, secret=${initialTotpSecret ? "exists" : "none"}`);
            setTotpEnabled(initialTotpEnabled);
            totpEnabledRef.current = initialTotpEnabled;

            setTotpSecret(initialTotpSecret);
            totpSecretRef.current = initialTotpSecret;

            // Update last notified values to prevent notification loop
            lastNotifiedRef.current = {
                enabled: initialTotpEnabled,
                secret: initialTotpSecret
            };
        }
    }, [initialTotpEnabled, initialTotpSecret]);

    // Force form field structure - this helps ensure the form fields are always properly structured
    useEffect(() => {
        if (!form) return;

        try {
            // Get current values from form (which may be incomplete)
            const currentValues = form.getFieldsValue(true);

            // Check for headers
            if (currentValues.requestOptions) {
                if (!Array.isArray(currentValues.requestOptions.headers)) {
                    console.log('[HttpOptions] Fixing missing headers in form');
                    form.setFieldValue(['requestOptions', 'headers'], []);
                }
            }

            // Check for json filter
            if (!currentValues.jsonFilter) {
                console.log('[HttpOptions] Fixing missing jsonFilter in form');
                form.setFieldValue('jsonFilter', { enabled: false, path: '' });
            }
        } catch (err) {
            console.error('[HttpOptions] Error fixing form structure:', err);
        }
    }, [form]);

    // Initialize states from form values
    useEffect(() => {
        if (isFormInitialized) return; // Only run once

        try {
            // Get current form values
            const formValues = form.getFieldsValue(true);

            // Ensure requestOptions has contentType
            if (!formValues.requestOptions || !formValues.requestOptions.contentType) {
                // Set a default contentType if it's missing
                form.setFieldValue(['requestOptions', 'contentType'], 'application/json');
            }

            console.log("[HttpOptions] Initializing component from form values:", {
                requestOptionsTotpSecret: formValues.requestOptions?.totpSecret ? "exists" : "none",
                totpSecret: formValues.totpSecret ? "exists" : "none",
                enableTOTP: formValues.enableTOTP,
                jsonFilter: formValues.jsonFilter,
                headers: formValues.requestOptions?.headers,
                contentType: formValues.requestOptions?.contentType
            });

            // Fix missing headers if needed
            if (formValues.requestOptions && !Array.isArray(formValues.requestOptions.headers)) {
                console.log("[HttpOptions] No headers array found in form, adding empty array");
                formValues.requestOptions.headers = [];
                form.setFieldValue(['requestOptions', 'headers'], []);
            }

            // Fix missing JSON filter if needed
            if (!formValues.jsonFilter) {
                console.log("[HttpOptions] No jsonFilter found in form, adding default");
                formValues.jsonFilter = { enabled: false, path: '' };
                form.setFieldValue('jsonFilter', { enabled: false, path: '' });
            }

            // Initialize JSON filter state
            if (formValues.jsonFilter) {
                const isEnabled = !!formValues.jsonFilter.enabled;
                setJsonFilterEnabled(isEnabled);
                jsonFilterEnabledRef.current = isEnabled;

                // Always store the path in the ref, even if filter is disabled
                if (formValues.jsonFilter.path) {
                    jsonFilterPathRef.current = formValues.jsonFilter.path;
                    console.log(`[HttpOptions] Storing initial JSON filter path: ${formValues.jsonFilter.path}`);
                }

                console.log(`[HttpOptions] Initialized JSON filter: enabled=${isEnabled}, path=${formValues.jsonFilter.path || '(empty)'}`);
            }

            // Initialize refresh state
            if (formValues.refreshOptions?.enabled) {
                const isEnabled = !!formValues.refreshOptions.enabled;
                setRefreshEnabled(isEnabled);
                refreshEnabledRef.current = isEnabled;

                if (formValues.refreshOptions.type) {
                    const typeValue = formValues.refreshOptions.type;
                    setRefreshType(typeValue);
                    refreshTypeRef.current = typeValue;
                }

                if (formValues.refreshOptions.interval) {
                    const intervalValue = formValues.refreshOptions.interval;
                    setCustomInterval(intervalValue);
                    customIntervalRef.current = intervalValue;
                }

                console.log("[HttpOptions] Initialized refresh options:", {
                    enabled: isEnabled,
                    type: formValues.refreshOptions.type,
                    interval: formValues.refreshOptions.interval
                });
            }

            // Initialize content type
            if (formValues.requestOptions?.contentType) {
                setContentType(formValues.requestOptions.contentType);
            }

            // IMPORTANT: Initialize TOTP state - FIXED PRIORITY ORDER
            // First check if the TOTP secret exists in requestOptions (highest priority)
            if (formValues.requestOptions?.totpSecret) {
                console.log("[HttpOptions] Found TOTP secret in requestOptions - setting enabled to TRUE:",
                    formValues.requestOptions.totpSecret ? "exists" : "none");
                setTotpSecret(formValues.requestOptions.totpSecret);
                totpSecretRef.current = formValues.requestOptions.totpSecret;

                setTotpEnabled(true);
                totpEnabledRef.current = true;

                // Update form fields to be consistent
                form.setFieldValue('enableTOTP', true);
                form.setFieldValue('totpSecret', formValues.requestOptions.totpSecret);

                // Update lastNotified ref to match
                lastNotifiedRef.current = {
                    enabled: true,
                    secret: formValues.requestOptions.totpSecret
                };
            }
            // Then check for TOTP secret directly in form values
            else if (formValues.totpSecret) {
                console.log("[HttpOptions] Setting TOTP secret from form field totpSecret:", formValues.totpSecret ? "exists" : "none");
                setTotpSecret(formValues.totpSecret);
                totpSecretRef.current = formValues.totpSecret;

                // If we have a TOTP secret, we should also enable TOTP
                if (formValues.totpSecret.trim() !== '') {
                    setTotpEnabled(true);
                    totpEnabledRef.current = true;
                    form.setFieldValue('enableTOTP', true);

                    // Update lastNotified ref to match
                    lastNotifiedRef.current = {
                        enabled: true,
                        secret: formValues.totpSecret
                    };
                }
            }
            // Finally check enableTOTP field
            else if (formValues.enableTOTP !== undefined) {
                const shouldEnableTotp = !!formValues.enableTOTP;
                console.log("[HttpOptions] Setting TOTP enabled to:", shouldEnableTotp, "from enableTOTP field");
                setTotpEnabled(shouldEnableTotp);
                totpEnabledRef.current = shouldEnableTotp;

                // Update lastNotified ref to match
                lastNotifiedRef.current = {
                    enabled: shouldEnableTotp,
                    secret: formValues.totpSecret || ''
                };
            }

            // Mark as initialized to prevent running this again
            setIsFormInitialized(true);

            // Debug log
            setTimeout(() => {
                console.log("[HttpOptions] Initialization complete, current state:", {
                    enabled: totpEnabled,
                    secret: totpSecret ? "[secret exists]" : "none",
                    formEnableTOTP: form.getFieldValue('enableTOTP'),
                    formTotpSecret: form.getFieldValue('totpSecret') ? "exists" : "none",
                    requestOptionsTotpSecret: form.getFieldValue(['requestOptions', 'totpSecret']) ? "exists" : "none",
                    jsonFilter: form.getFieldValue('jsonFilter'),
                    jsonFilterEnabled: jsonFilterEnabled,
                    jsonFilterPath: jsonFilterPathRef.current,
                    headers: form.getFieldValue(['requestOptions', 'headers'])
                });
            }, 100);
        } catch (err) {
            console.error("[HttpOptions] Error initializing HttpOptions:", err);
        }
    }, [form, isFormInitialized]);

    // Notify parent of TOTP changes with redundancy protection
    useEffect(() => {
        if (notifyParentRef.current && isFormInitialized) {
            // Only notify if the values have actually changed
            if (lastNotifiedRef.current.enabled !== totpEnabled ||
                lastNotifiedRef.current.secret !== totpSecret) {

                console.log(`[HttpOptions] Notifying parent of TOTP change: enabled=${totpEnabled}, secret=${totpSecret ? "exists" : "none"}`);
                notifyParentRef.current(totpEnabled, totpSecret);

                // Update our reference to the last notified values
                lastNotifiedRef.current = { enabled: totpEnabled, secret: totpSecret };
            } else {
                console.log(`[HttpOptions] Skipping redundant notification: enabled=${totpEnabled}, secret=${totpSecret ? "exists" : "none"}`);
            }
        }
    }, [totpEnabled, totpSecret, isFormInitialized]);

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
        console.log("[HttpOptions] Refresh toggle changed to:", checked);

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
        console.log("[HttpOptions] Updated refresh options in form:",
            JSON.stringify(form.getFieldValue('refreshOptions')));
    };

    // Handle refresh type change with improved state persistence
    const handleRefreshTypeChange = (e) => {
        const newType = e.target.value;
        console.log("[HttpOptions] Refresh type changed to:", newType);

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
        console.log("[HttpOptions] Updated refresh type in form:",
            JSON.stringify(form.getFieldValue('refreshOptions')));
    };

    // Handle custom interval change with improved state persistence
    const handleCustomIntervalChange = (value) => {
        // Ensure value is a positive number
        const interval = value > 0 ? value : 1;
        console.log("[HttpOptions] Custom interval changed to:", interval);

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
        console.log("[HttpOptions] Updated custom interval in form:",
            JSON.stringify(form.getFieldValue('refreshOptions')));
    };

    // Handle preset interval change with improved state persistence
    const handlePresetIntervalChange = (value) => {
        console.log("[HttpOptions] Preset interval changed to:", value);

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
        console.log("[HttpOptions] Updated preset interval in form:",
            JSON.stringify(form.getFieldValue('refreshOptions')));
    };

    // Handle JSON filter toggle with improved state persistence
    const handleJsonFilterToggle = (enabled) => {
        console.log(`[HttpOptions] JSON filter toggle changed to: ${enabled}`);

        // Update both state and ref
        setJsonFilterEnabled(enabled);
        jsonFilterEnabledRef.current = enabled;

        // Get current jsonFilter form value
        let currentJsonFilter = form.getFieldValue('jsonFilter') || { enabled: false, path: '' };

        // When disabling, always save the current path to our ref
        if (!enabled && currentJsonFilter.path) {
            jsonFilterPathRef.current = currentJsonFilter.path;
            console.log(`[HttpOptions] Saved JSON filter path before disabling: ${currentJsonFilter.path}`);
        }

        // When enabling, decide which path to use (current form path, saved ref path, or empty)
        let pathToUse = '';
        if (enabled) {
            // First try the current form path
            if (currentJsonFilter.path) {
                pathToUse = currentJsonFilter.path;
                console.log(`[HttpOptions] Using current form path: ${pathToUse}`);
            }
            // Then try the saved ref path
            else if (jsonFilterPathRef.current) {
                pathToUse = jsonFilterPathRef.current;
                console.log(`[HttpOptions] Restoring saved path: ${pathToUse}`);
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

        console.log("[HttpOptions] Updated JSON filter in form:",
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
                    console.error("Failed to focus JSON path input:", e);
                }
            }, 100);
        }
    };

    // Handle TOTP toggle with improved state persistence
    const handleTotpToggle = (checked) => {
        console.log("[HttpOptions] TOTP toggle changed to:", checked);

        // Update both state and ref
        setTotpEnabled(checked);
        totpEnabledRef.current = checked;

        setTotpPreviewVisible(false);
        setTotpError(null);

        // Update form values
        form.setFieldsValue({ enableTOTP: checked });

        // IMPORTANT FIX: Also update the requestOptions to ensure TOTP secret is stored correctly
        const requestOptions = form.getFieldValue('requestOptions') || {};

        if (!checked) {
            // Keep the secret in memory even when disabled, don't clear it immediately
            // This allows toggling without losing the secret
            form.setFieldsValue({ totpSecret: totpSecretRef.current });

            // But remove it from requestOptions if disabled
            if (requestOptions.totpSecret) {
                delete requestOptions.totpSecret;
                form.setFieldsValue({ requestOptions });
                console.log("[HttpOptions] Removed TOTP secret from requestOptions");
            }
        } else if (totpSecretRef.current) {
            // If we already have a secret, make sure it's in the form
            form.setFieldsValue({ totpSecret: totpSecretRef.current });

            // Also update requestOptions
            requestOptions.totpSecret = totpSecretRef.current;
            form.setFieldsValue({ requestOptions });
            console.log("[HttpOptions] Added TOTP secret to requestOptions");
        }
    };

    // Handle TOTP secret change with improved state persistence
    const handleTotpSecretChange = (e) => {
        const newSecret = e.target.value;
        console.log("[HttpOptions] TOTP secret changed to:", newSecret ? "exists" : "none");

        // Update both state and ref
        setTotpSecret(newSecret);
        totpSecretRef.current = newSecret;

        setTotpPreviewVisible(false);
        setTotpError(null);

        // Update form values
        form.setFieldsValue({ totpSecret: newSecret });

        // IMPORTANT FIX: Always update requestOptions if TOTP is enabled
        if (totpEnabledRef.current) {
            const requestOptions = form.getFieldValue('requestOptions') || {};
            requestOptions.totpSecret = newSecret;
            form.setFieldsValue({ requestOptions });
            console.log("[HttpOptions] Updated TOTP secret in requestOptions");
        }
    };

    // Generate TOTP code
    const generateTotpCode = async () => {
        try {
            if (!totpSecret) {
                setTotpError('Please enter a secret key');
                return;
            }

            setTotpError(null);
            setTotpTesting(true);

            // Normalize secret for better compatibility
            const normalizedSecret = totpSecret.replace(/\s/g, '').replace(/=/g, '');

            console.log(`[HttpOptions] Generating TOTP with secret: ${normalizedSecret}`);

            // Use the window.generateTOTP function
            const totpCode = await window.generateTOTP(normalizedSecret, 30, 6, 0);

            if (totpCode === 'ERROR') {
                setTotpError('Failed to generate code. Check your secret key.');
                setTotpCode('ERROR');
            } else {
                setTotpCode(totpCode);
            }
        } catch (error) {
            console.error('[HttpOptions] Error generating TOTP:', error);
            setTotpError(`Error: ${error.message}`);
            setTotpCode('ERROR');
        } finally {
            setTotpTesting(false);
        }
    };

    // Test TOTP button handler
    const handleTestTotp = async () => {
        if (!totpSecret) {
            setTotpError('Please enter a secret key');
            setTotpCode('NO SECRET');
            return;
        }

        setTotpPreviewVisible(true);
        await generateTotpCode();
    };

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
        try {
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
                console.log("[HttpOptions] Fixed missing headers array in form");
            }

            // IMPORTANT FIX: Also check for queryParams array
            if (!Array.isArray(values.requestOptions.queryParams)) {
                values.requestOptions.queryParams = [];
                console.log("[HttpOptions] Fixed missing queryParams array in form");
            }

            if (!values.jsonFilter) {
                values.jsonFilter = { enabled: false, path: '' };
                console.log("[HttpOptions] Fixed missing jsonFilter in form");
            }

            // Check if JSON filter is enabled but missing a path
            if (values.jsonFilter?.enabled === true && !values.jsonFilter?.path) {
                showMessage('error', 'JSON filter is enabled but no path is specified. Please enter a JSON path.');
                return;
            }

            // Show loading
            setTesting(true);
            setTestResponseVisible(false);

            // Prepare request options with defaults to ensure complete structure
            const requestOptions = {
                queryParams: {},
                headers: {},
                body: null,
                contentType: values.requestOptions?.contentType || 'application/json'
            };

            // Log the headers directly from the form for debugging
            const formHeaders = form.getFieldValue(['requestOptions', 'headers']);
            console.log("[HttpOptions] Headers direct from form:", formHeaders);

            // IMPORTANT FIX: Also log queryParams directly from the form
            const formQueryParams = form.getFieldValue(['requestOptions', 'queryParams']);
            console.log("[HttpOptions] Query params direct from form:", formQueryParams);

            // Add query params if defined - FIX: Use formQueryParams directly
            if (Array.isArray(formQueryParams) && formQueryParams.length > 0) {
                console.log("[HttpOptions] Explicitly using query params from form field");
                formQueryParams.forEach(param => {
                    if (param && param.key) {
                        requestOptions.queryParams[param.key] = param.value || '';
                        console.log(`[HttpOptions] Added query param from form: ${param.key} = ${param.value || ''}`);
                    }
                });
            } else if (values.requestOptions?.queryParams && Array.isArray(values.requestOptions.queryParams)) {
                values.requestOptions.queryParams.forEach(param => {
                    if (param && param.key) {
                        requestOptions.queryParams[param.key] = param.value || '';
                        console.log(`[HttpOptions] Added query param: ${param.key} = ${param.value || ''}`);
                    }
                });
            }
            console.log("[HttpOptions] Query params after formatting:", requestOptions.queryParams);

            // Add headers if defined
            console.log("[HttpOptions] Full requestOptions from form:", JSON.stringify(values.requestOptions || {}, null, 2));
            console.log("[HttpOptions] Headers from form:", values.requestOptions?.headers);

            // Make sure to explicitly preserve headers in the request options
            if (Array.isArray(formHeaders) && formHeaders.length > 0) {
                console.log("[HttpOptions] Explicitly using headers from form field");
                formHeaders.forEach(header => {
                    if (header && header.key) {
                        requestOptions.headers[header.key] = header.value || '';
                        console.log(`[HttpOptions] Added header from form: ${header.key} = ${header.value || ''}`);
                    }
                });
            } else if (values.requestOptions?.headers && Array.isArray(values.requestOptions.headers)) {
                values.requestOptions.headers.forEach(header => {
                    if (header && header.key) {
                        requestOptions.headers[header.key] = header.value || '';
                        console.log(`[HttpOptions] Added header: ${header.key} = ${header.value || ''}`);
                    }
                });
            }
            console.log("[HttpOptions] Headers after formatting:", requestOptions.headers);

            // Add body if applicable
            if (['POST', 'PUT', 'PATCH'].includes(values.sourceMethod)) {
                const requestBody = values.requestOptions?.body || null;
                if (requestBody) {
                    requestOptions.body = requestBody;
                }
            }

            // Add TOTP secret if enabled
            if (totpEnabled && totpSecret) {
                requestOptions.totpSecret = totpSecret;
                console.log("[HttpOptions] Adding TOTP secret to request");
            }

            // Add JSON filter from form values - properly check both enabled flag and state
            console.log("[HttpOptions] JSON Filter from form:", values.jsonFilter);

            // Create a new jsonFilter object ensuring we check the form state correctly
            const jsonFilter = { enabled: false, path: '' };

            // Check if jsonFilter is enabled in the form
            if (values.jsonFilter && values.jsonFilter.enabled === true && values.jsonFilter.path) {
                jsonFilter.enabled = true;
                jsonFilter.path = values.jsonFilter.path;
                console.log(`[HttpOptions] JSON Filter is ENABLED with path: ${values.jsonFilter.path}`);
            }

            // Alternatively, check if component state says it's enabled
            else if (jsonFilterEnabled && values.jsonFilter?.path) {
                jsonFilter.enabled = true;
                jsonFilter.path = values.jsonFilter.path;
                console.log(`[HttpOptions] JSON Filter enabled from component state with path: ${values.jsonFilter.path}`);
            }

            console.log("[HttpOptions] Final JSON Filter for test:", jsonFilter);
            console.log("[HttpOptions] Making test request with headers:", requestOptions.headers);
            console.log("[HttpOptions] Making test request with query params:", requestOptions.queryParams);

            // Make the test request
            const response = await http.testRequest(
                url,
                values.sourceMethod || 'GET',
                requestOptions,
                jsonFilter
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
                    <Button
                        type="primary"
                        onClick={handleTestRequest}
                        loading={testing}
                        size="small"
                        style={{ marginTop: 24 }}
                    >
                        Test Request
                    </Button>
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
                                                    style={{ color: '#ff4d4f' }}
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
                                                    style={{ color: '#ff4d4f' }}
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
                                        <div style={{ fontSize: 11, color: 'rgba(0, 0, 0, 0.45)', marginTop: 4 }}>
                                            <Text type="secondary">
                                                {jsonFilterEnabled ? 'Filter will extract specific data from JSON response' : 'Full JSON response will be used'}
                                            </Text>
                                        </div>
                                    </Card>

                                    {/* TOTP Authentication */}
                                    <Card
                                        size="small"
                                        title="TOTP Authentication"
                                        extra={
                                            <Switch
                                                size="small"
                                                checkedChildren="On"
                                                unCheckedChildren="Off"
                                                onChange={handleTotpToggle}
                                                checked={totpEnabled}
                                            />
                                        }
                                        style={{ marginBottom: 8 }}
                                    >
                                        {totpEnabled && (
                                            <>
                                                <div style={{ marginBottom: 16 }}>
                                                    <Input
                                                        placeholder="Enter TOTP secret key"
                                                        onChange={handleTotpSecretChange}
                                                        value={totpSecret}
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
                                                    {totpError && <div style={{ color: '#ff4d4f', fontSize: 11, marginTop: 4 }}>{totpError}</div>}
                                                </div>

                                                <div style={{ marginTop: 4, marginBottom: 4 }}>
                                                    <Text type="secondary" style={{ fontSize: 11 }}>
                                                        <strong>Tips:</strong> Enter the secret key exactly as provided by the service.
                                                    </Text>
                                                </div>

                                                {totpPreviewVisible && (
                                                    <div style={{
                                                        background: '#f5f5f7',
                                                        padding: 8,
                                                        borderRadius: 6,
                                                        marginBottom: 8
                                                    }}>
                                                        <div style={{
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'center'
                                                        }}>
                                                            <div style={{
                                                                fontFamily: 'SF Mono, Menlo, Monaco, Consolas, monospace',
                                                                fontSize: '1rem',
                                                                fontWeight: 'bold',
                                                                color: totpCode === 'ERROR' ? '#ff4d4f' : 'inherit'
                                                            }}>
                                                                {totpCode}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                <div style={{ fontSize: 11, color: 'rgba(0, 0, 0, 0.45)' }}>
                                                    Use <code>_TOTP_CODE</code> in any URL, header, or body field
                                                </div>
                                            </>
                                        )}
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
                                                initialValue={false}
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