/**
 * HTTP Testing and Response Handling
 * 
 * Comprehensive HTTP request testing functionality with response formatting,
 * content type detection, TOTP integration, and status code handling.
 * 
 * Testing Features:
 * - HTTP request execution with environment variable resolution
 * - TOTP code integration and cooldown management
 * - Comprehensive response formatting based on content type
 * - Status code mapping with descriptive text
 * - JSON response filtering and processing
 * 
 * Response Handling:
 * - JSON formatting with syntax highlighting
 * - HTML content display with code formatting
 * - XML content formatting
 * - Plain text response handling
 * - Error response formatting and display
 * 
 * @module HttpTesting
 * @since 3.0.0
 */

import React from 'react';
import { showMessage } from '../../../utils/ui/messageUtil';
import { validateAllHttpFields } from './HttpValidation';
import { createLogger } from '../../../utils/error-handling/logger';

const log = createLogger('HttpTesting');

/**
 * HTTP status code to descriptive text mapping
 * 
 * Comprehensive mapping of HTTP status codes to their standard
 * descriptive text for better user understanding of response status.
 */
const STATUS_TEXTS = {
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

/**
 * Gets descriptive text for HTTP status code
 * 
 * Returns the standard descriptive text for a given HTTP status code,
 * or 'Unknown Status' if the status code is not recognized.
 * 
 * @param {number} statusCode - HTTP status code
 * @returns {string} Descriptive status text
 * 
 * @example
 * const statusText = getStatusText(404);
 * // Returns: "Not Found"
 */
export const getStatusText = (statusCode) => {
    return STATUS_TEXTS[statusCode] || 'Unknown Status';
};

/**
 * Formats response content based on content type
 * 
 * Intelligently formats response content based on the response headers
 * and content type, providing appropriate syntax highlighting and
 * structure for different content types.
 * 
 * @param {*} content - Response content to format
 * @param {Object} headers - Response headers containing content-type
 * @returns {JSX.Element} Formatted content component
 * 
 * @example
 * const formatted = formatContentByType(jsonData, { 'content-type': 'application/json' });
 */
export const formatContentByType = (content, headers) => {
    if (content === null || content === undefined) return "No content";

    try {
        // Check content type from headers
        const contentType = headers && headers['content-type'] ?
            headers['content-type'].toLowerCase() : '';

        // Format JSON
        if ((contentType.includes('application/json') || contentType.includes('json')) ||
            (typeof content === 'string' && content.trim() && (content.trim().startsWith('{') || content.trim().startsWith('[')))) {
            try {
                const jsonObject = typeof content === 'string' ? JSON.parse(content) : content;
                return (
                    <pre className="formatted-json">
                        {JSON.stringify(jsonObject, null, 2)}
                    </pre>
                );
            } catch (e) {
                // If JSON parsing fails, display as plain text
                return <pre>{content || "(empty response)"}</pre>;
            }
        }

        // Format HTML with syntax highlighting
        if (contentType.includes('html')) {
            return (
                <div className="formatted-html">
                    <code>{content}</code>
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
        return <pre>{content || "(empty response)"}</pre>;
    } catch (error) {
        return <pre>{content || "(empty response)"}</pre>;
    }
};

/**
 * Formats response data for display
 * 
 * Parses and formats response JSON data into a structured object
 * for display in the response preview tabs.
 * 
 * @param {string} responseJson - Raw response JSON string
 * @returns {Object} Formatted response object or error object
 * 
 * @example
 * const formatted = formatResponseForDisplay(responseString);
 * console.log(formatted.statusCode, formatted.body);
 */
export const formatResponseForDisplay = (responseJson) => {
    try {
        return JSON.parse(responseJson);
    } catch (error) {
        return {
            statusCode: 0,
            error: "Failed to parse response",
            body: responseJson || "No content"
        };
    }
};

/**
 * Creates HTTP test request handler
 * 
 * Factory function that creates a comprehensive HTTP test request handler
 * with full validation, TOTP integration, and response processing.
 * 
 * @param {Object} params - Handler configuration parameters
 * @param {Object} params.form - Form instance for value retrieval
 * @param {Function} params.getTotpStateFromForm - Function to get TOTP state
 * @param {Function} params.getCooldownSeconds - Function to check TOTP cooldown
 * @param {Function} params.checkIfRequestUsesTotp - Function to check TOTP usage
 * @param {Object} params.envContext - Environment context for validation
 * @param {Object} params.http - HTTP service for making requests
 * @param {Function} params.setTesting - Testing state setter
 * @param {Function} params.onTestingChange - Testing change callback
 * @param {Function} params.setTestResponseContent - Response content setter
 * @param {Function} params.setTestResponseVisible - Response visibility setter
 * @param {Function} params.setRawResponse - Raw response setter
 * @param {Function} params.onTestResponse - Test response callback
 * @param {string} params.effectiveSourceId - Source ID for request
 * @param {string} params.testSourceId - Test source ID for TOTP tracking
 * @returns {Function} HTTP test request handler
 * 
 * @example
 * const handleTestRequest = createHttpTestHandler({
 *   form,
 *   getTotpStateFromForm,
 *   getCooldownSeconds,
 *   // ... other parameters
 * });
 */
export const createHttpTestHandler = ({
    form,
    getTotpStateFromForm,
    getCooldownSeconds,
    checkIfRequestUsesTotp,
    envContext,
    http,
    setTesting,
    onTestingChange,
    setTestResponseContent,
    setTestResponseVisible,
    setRawResponse,
    onTestResponse,
    effectiveSourceId,
    testSourceId
}) => async (sourcePath = null, sourceMethod = null, progressCallback = null, cleanupCallback = null) => {
    const { enabled: totpEnabled, secret: totpSecret } = getTotpStateFromForm();
    
    try {
        // Check TOTP cooldown first
        if (totpEnabled && totpSecret) {
            const cooldownSeconds = getCooldownSeconds(testSourceId);
            if (cooldownSeconds > 0) {
                showMessage('warning', `TOTP code was recently used. Please wait ${cooldownSeconds} seconds before making another request.`);
                return;
            }
        }

        // Get current form values
        const values = form.getFieldsValue();
        
        // Use passed sourcePath if provided, otherwise try to get from form
        const url = sourcePath || values.sourcePath;
        const method = sourceMethod || values.sourceMethod || 'GET';
        
        if (!url) {
            showMessage('error', 'Please enter a URL');
            return;
        }
        
        // Validate all HTTP fields for environment variables and TOTP
        const validationError = validateAllHttpFields(form, values, envContext);
        if (validationError) {
            showMessage('error', validationError.message);
            return;
        }

        // Ensure URL has protocol
        let finalUrl = url;
        if (!finalUrl.match(/^https?:\/\//i)) {
            finalUrl = 'https://' + finalUrl;
        }

        // Ensure form structure is complete
        if (!values.requestOptions) {
            values.requestOptions = {};
        }

        if (!Array.isArray(values.requestOptions.headers)) {
            values.requestOptions.headers = [];
        }

        if (!Array.isArray(values.requestOptions.queryParams)) {
            values.requestOptions.queryParams = [];
        }

        if (!values.jsonFilter) {
            values.jsonFilter = { enabled: false, path: '' };
        }

        // Check if JSON filter is enabled but missing a path
        if (values.jsonFilter?.enabled === true && !values.jsonFilter?.path) {
            showMessage('error', 'JSON filter is enabled but no path is specified. Please enter a JSON path.');
            return;
        }

        // Show loading state
        setTesting(true);
        if (onTestingChange) {
            onTestingChange(true);
        }
        setTestResponseVisible(false);
        
        // Check if request uses TOTP (for tracking purposes)
        checkIfRequestUsesTotp(finalUrl, method, values.requestOptions);

        // Prepare request options
        const requestOptions = prepareRequestOptions(form, values);
        
        // Add TOTP secret if enabled
        if (totpEnabled && totpSecret) {
            requestOptions.totpSecret = totpSecret;
        }

        // Prepare JSON filter for request
        const jsonFilterForRequest = prepareJsonFilter(values);


        // Make the test request
        const response = await http.testRequest(
            finalUrl,
            method,
            requestOptions,
            jsonFilterForRequest,
            effectiveSourceId,
            progressCallback,
            cleanupCallback
        );

        // Save and format the response
        setRawResponse(response);
        const formattedResponse = formatResponseForDisplay(response);
        setTestResponseContent(formattedResponse);
        setTestResponseVisible(true);

        // Send to parent callback
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
        // Call cleanup callback if provided
        if (cleanupCallback) {
            cleanupCallback();
        }
    }
};

/**
 * Prepares request options from form values
 * 
 * Processes form values to create properly structured request options
 * with headers, query parameters, body, and content type.
 * 
 * @param {Object} form - Form instance
 * @param {Object} values - Form values
 * @returns {Object} Prepared request options
 */
const prepareRequestOptions = (form, values) => {
    // Get content type from form
    const formContentType = form.getFieldValue(['requestOptions', 'contentType']);
    const contentType = formContentType || values.requestOptions?.contentType || 'application/json';
    
    // Prepare request options with defaults
    const requestOptions = {
        queryParams: {},
        headers: [],  // Keep as array initially for variable substitution
        body: null,
        contentType: contentType,
    };

    // Add query params if defined
    const formQueryParams = form.getFieldValue(['requestOptions', 'queryParams']);
    if (Array.isArray(formQueryParams) && formQueryParams.length > 0) {
        formQueryParams.forEach(param => {
            if (param && param.key) {
                requestOptions.queryParams[param.key] = param.value || '';
            }
        });
    } else if (values.requestOptions?.queryParams && Array.isArray(values.requestOptions.queryParams)) {
        values.requestOptions.queryParams.forEach(param => {
            if (param && param.key) {
                requestOptions.queryParams[param.key] = param.value || '';
            }
        });
    }

    // Add headers as array for variable substitution
    const formHeaders = form.getFieldValue(['requestOptions', 'headers']);
    if (Array.isArray(formHeaders) && formHeaders.length > 0) {
        requestOptions.headers = JSON.parse(JSON.stringify(formHeaders)); // Deep copy
    } else if (values.requestOptions?.headers && Array.isArray(values.requestOptions.headers)) {
        requestOptions.headers = JSON.parse(JSON.stringify(values.requestOptions.headers));
    }

    // Add body if applicable for POST/PUT/PATCH
    if (['POST', 'PUT', 'PATCH'].includes(values.sourceMethod)) {
        const formBody = form.getFieldValue(['requestOptions', 'body']);
        const requestBody = formBody || values.requestOptions?.body || null;
        
        if (requestBody) {
            requestOptions.body = requestBody;
        }
    }

    return requestOptions;
};

/**
 * Prepares JSON filter configuration for request
 * 
 * Processes form values to create properly structured JSON filter
 * configuration for response filtering.
 * 
 * @param {Object} values - Form values
 * @returns {Object} JSON filter configuration
 */
const prepareJsonFilter = (values) => {
    const jsonFilterForRequest = { enabled: false, path: '' };

    // Check if jsonFilter is enabled in the form
    if (values.jsonFilter && values.jsonFilter.enabled === true && values.jsonFilter.path) {
        jsonFilterForRequest.enabled = true;
        jsonFilterForRequest.path = values.jsonFilter.path;
    }

    return jsonFilterForRequest;
};