/**
 * HTTP Testing and Response Handling
 *
 * Builds HttpRequestSpec from form values and delegates execution to
 * main-process HttpRequestService via IPC. All template resolution,
 * TOTP generation, and HTTP execution happen in main.
 */

import type {
  JsonFilter,
  SourceHeader,
  SourceMethod,
  SourceQueryParam,
  SourceRequestOptions,
  SourceType,
} from '@openheaders/core';
import type { FormInstance } from 'antd';
import type React from 'react';
import { showMessage } from '@/renderer/utils/ui/messageUtil';
import type { EnvironmentContextLike, HttpProgressCallback, HttpRequestSpec, TestResponseContent } from '@/types/http';
import { validateAllHttpFields } from './HttpValidation';

interface TotpState {
  enabled: boolean;
  secret: string;
}

interface HttpTestHandlerParams {
  form: FormInstance;
  getTotpStateFromForm: () => TotpState;
  envContext: EnvironmentContextLike;
  http: { testRequest: (spec: HttpRequestSpec) => Promise<TestResponseContent> };
  setTesting: (testing: boolean) => void;
  onTestingChange?: (testing: boolean) => void;
  setTestResponseContent: (content: TestResponseContent) => void;
  setTestResponseVisible: (visible: boolean) => void;
  setRawResponse: (response: string | null) => void;
  onTestResponse?: (response: string) => void;
  effectiveSourceId: string;
  testSourceId: string;
  workspaceId: string;
}

/**
 * HTTP status code to descriptive text mapping
 */
const STATUS_TEXTS: Record<number, string> = {
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
  511: 'Network Authentication Required',
};

export const getStatusText = (statusCode: number): string => {
  return STATUS_TEXTS[statusCode] || 'Unknown Status';
};

export const formatContentByType = (content: unknown, headers: Record<string, string> | null): React.ReactNode => {
  if (content === null || content === undefined) return 'No content';

  const contentStr = typeof content === 'string' ? content : String(content);

  try {
    const contentType = headers?.['content-type'] ? headers['content-type'].toLowerCase() : '';

    // Format JSON
    if (
      contentType.includes('application/json') ||
      contentType.includes('json') ||
      (typeof content === 'string' &&
        content.trim() &&
        (content.trim().startsWith('{') || content.trim().startsWith('[')))
    ) {
      try {
        const jsonObject = typeof content === 'string' ? JSON.parse(content) : content;
        return <pre className="formatted-json">{JSON.stringify(jsonObject, null, 2)}</pre>;
      } catch (_e) {
        return <pre>{contentStr || '(empty response)'}</pre>;
      }
    }

    // Format HTML
    if (contentType.includes('html')) {
      return (
        <div className="formatted-html">
          <code>{contentStr}</code>
        </div>
      );
    }

    // Format XML
    if (contentType.includes('xml')) {
      return <div className="formatted-xml">{contentStr}</div>;
    }

    return <pre>{contentStr || '(empty response)'}</pre>;
  } catch (_error) {
    return <pre>{contentStr || '(empty response)'}</pre>;
  }
};

export const formatResponseForDisplay = (responseJson: string): TestResponseContent => {
  try {
    return JSON.parse(responseJson);
  } catch (_error) {
    return {
      statusCode: 0,
      error: 'Failed to parse response',
      body: responseJson || 'No content',
    };
  }
};

interface HttpFormValues {
  sourceType?: SourceType;
  sourcePath?: string;
  sourceMethod?: SourceMethod;
  sourceTag?: string;
  requestOptions?: SourceRequestOptions;
  jsonFilter?: JsonFilter;
}

/**
 * Build an HttpRequestSpec from form values — raw, unresolved templates.
 * Main process handles all template resolution.
 */
function buildRequestSpec(
  form: FormInstance,
  values: HttpFormValues,
  totpState: TotpState,
  effectiveSourceId: string,
  workspaceId: string,
  sourcePath?: string | null,
  sourceMethod?: string | null,
): HttpRequestSpec {
  let url = sourcePath || values.sourcePath || '';
  if (!url.match(/^https?:\/\//i)) {
    url = `https://${url}`;
  }

  const method = sourceMethod || values.sourceMethod || 'GET';
  const formContentType = form.getFieldValue(['requestOptions', 'contentType']);
  const contentType = formContentType || values.requestOptions?.contentType || 'application/json';

  // Headers as array (raw form values — main resolves templates)
  let headers: Array<{ key: string; value: string }> | undefined;
  const formHeaders: SourceHeader[] | undefined = form.getFieldValue(['requestOptions', 'headers']);
  if (Array.isArray(formHeaders) && formHeaders.length > 0) {
    headers = formHeaders.filter((h) => h?.key).map((h) => ({ key: h.key, value: h.value || '' }));
  } else if (values.requestOptions?.headers && Array.isArray(values.requestOptions.headers)) {
    headers = values.requestOptions.headers.filter((h) => h?.key).map((h) => ({ key: h.key, value: h.value || '' }));
  }

  // Query params as array
  let queryParams: Array<{ key: string; value: string }> | undefined;
  const formQueryParams: SourceQueryParam[] | undefined = form.getFieldValue(['requestOptions', 'queryParams']);
  if (Array.isArray(formQueryParams) && formQueryParams.length > 0) {
    queryParams = formQueryParams.filter((p) => p?.key).map((p) => ({ key: p.key, value: p.value || '' }));
  } else if (values.requestOptions?.queryParams && Array.isArray(values.requestOptions.queryParams)) {
    queryParams = values.requestOptions.queryParams
      .filter((p) => p?.key)
      .map((p) => ({ key: p.key, value: p.value || '' }));
  }

  // Body — sent for any method (some APIs accept body on GET/DELETE)
  const formBody: string | undefined = form.getFieldValue(['requestOptions', 'body']);
  const body = formBody || values.requestOptions?.body || undefined;

  // JSON filter
  let jsonFilter: { enabled: boolean; path: string } | undefined;
  if (values.jsonFilter?.enabled && values.jsonFilter?.path) {
    jsonFilter = { enabled: true, path: values.jsonFilter.path };
  }

  // TOTP secret (raw — main resolves and generates code)
  const totpSecret = totpState.enabled && totpState.secret ? totpState.secret : undefined;

  return {
    url,
    method,
    headers,
    queryParams,
    body,
    contentType,
    totpSecret,
    jsonFilter,
    sourceId: effectiveSourceId,
    workspaceId,
  };
}

/**
 * Creates HTTP test request handler.
 * Builds HttpRequestSpec from form values and delegates to main process.
 */
export const createHttpTestHandler =
  ({
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
    testSourceId: _testSourceId,
    workspaceId,
  }: HttpTestHandlerParams) =>
  async (
    sourcePath: string | null = null,
    sourceMethod: string | null = null,
    _progressCallback: HttpProgressCallback | null = null,
    cleanupCallback: (() => void) | null = null,
  ) => {
    const totpState = getTotpStateFromForm();

    try {
      const values = form.getFieldsValue();
      const url = sourcePath || values.sourcePath;

      if (!url) {
        showMessage('error', 'Please enter a URL');
        return;
      }

      // Validate fields for environment variables
      const validationError = validateAllHttpFields(form, values, envContext);
      if (validationError) {
        showMessage('error', validationError.message);
        return;
      }

      // Check JSON filter
      if (values.jsonFilter?.enabled === true && !values.jsonFilter?.path) {
        showMessage('error', 'JSON filter is enabled but no path is specified. Please enter a JSON path.');
        return;
      }

      setTesting(true);
      if (onTestingChange) {
        onTestingChange(true);
      }
      setTestResponseVisible(false);

      // Build spec from form values — all raw, unresolved
      const spec = buildRequestSpec(form, values, totpState, effectiveSourceId, workspaceId, sourcePath, sourceMethod);

      // Execute via main process
      const result = await http.testRequest(spec);

      setTestResponseContent(result);
      setTestResponseVisible(true);

      const responseJson = JSON.stringify(result, null, 2);
      setRawResponse(responseJson);

      if (onTestResponse) {
        onTestResponse(responseJson);
      }
    } catch (error) {
      showMessage('error', `Failed to test request: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setTesting(false);
      if (onTestingChange) {
        onTestingChange(false);
      }
      if (cleanupCallback) {
        cleanupCallback();
      }
    }
  };
