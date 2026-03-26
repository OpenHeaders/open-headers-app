import React, { useCallback, useMemo } from 'react';
import {
    Form,
    Input,
    Radio,
    Typography
} from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import {
    validateEnvironmentVariables,
    formatMissingVariables
} from '../../../../utils/validation/environment-variables';

const { Text } = Typography;

interface EnvVarFieldValidation {
    isValid: boolean;
    hasVars: boolean;
    usedVars: string[];
    missingVars: string[];
}

interface EnvVarValidationState {
    headerName?: EnvVarFieldValidation;
    cookieName?: EnvVarFieldValidation;
    [key: string]: EnvVarFieldValidation | undefined;
}

interface EnvContext {
    environmentsReady: boolean;
    getAllVariables: () => Record<string, string>;
}

interface FormHeaderProps {
    mode: 'generic' | 'cookie';
    headerType: string;
    setHeaderType: (type: string) => void;
    envVarValidation: EnvVarValidationState;
    envContext: EnvContext;
}

// Common header suggestions for the native datalist
const HEADER_SUGGESTIONS = [
    'Authorization',
    'Content-Type',
    'Accept',
    'User-Agent',
    'Cache-Control',
    'Cookie',
    'Origin',
    'Referer',
    'X-API-Key',
    'X-Auth-Token',
    'X-Requested-With',
    'X-CSRF-Token',
    'Accept-Language',
    'Accept-Encoding',
    'If-None-Match',
    'If-Modified-Since'
];

// Forbidden headers that can't be modified
const FORBIDDEN_HEADERS = [
    'Accept-Charset',
    'Accept-Encoding',
    'Access-Control-Request-Headers',
    'Access-Control-Request-Method',
    'Connection',
    'Content-Length',
    'Cookie2',
    'Date',
    'DNT',
    'Expect',
    'Host',
    'Keep-Alive',
    'Origin',
    'Proxy-',
    'Sec-',
    'TE',
    'Trailer',
    'Transfer-Encoding',
    'Upgrade',
    'Via'
];

// Normalize header name
const normalizeHeaderName = (name: string): string => {
    if (!name) return '';
    return name.split('-')
        .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join('-');
};

const FormHeader: React.FC<FormHeaderProps> = ({
    mode,
    headerType,
    setHeaderType,
    envVarValidation,
    envContext
}) => {
    const form = Form.useFormInstance();

    // Pure env-var check — no state side effects. Safe to call from validators.
    const checkEnvVars = useCallback((value: string) => {
        if (!value || !envContext.environmentsReady) return null;
        const variables = envContext.getAllVariables();
        return validateEnvironmentVariables(value, variables);
    }, [envContext]);

    // Validation for header name — pure, stable reference
    const validateHeaderName = useCallback((_: unknown, value: string) => {
        if (!value || !value.trim()) {
            return Promise.reject('Header name is required');
        }

        const envValidation = checkEnvVars(value);
        if (envValidation && !envValidation.isValid) {
            return Promise.reject(formatMissingVariables(envValidation.missingVars));
        }

        const hasEnvVars = envValidation && envValidation.hasVars;
        if (!hasEnvVars) {
            const headerName = value.trim().toLowerCase();
            if (FORBIDDEN_HEADERS.some(forbidden => {
                if (forbidden.endsWith('-')) {
                    return headerName.startsWith(forbidden.toLowerCase());
                }
                return headerName === forbidden.toLowerCase();
            })) {
                return Promise.reject(`"${value}" is a forbidden header that cannot be modified`);
            }
        }

        return Promise.resolve();
    }, [checkEnvVars]);

    // Validation for cookie name — pure, stable reference
    const validateCookieName = useCallback((_: unknown, value: string) => {
        if (!value || !value.trim()) {
            return Promise.reject('Cookie name is required');
        }

        if (/[=;,\s]/.test(value)) {
            return Promise.reject('Cookie name cannot contain =, ;, comma, or spaces');
        }

        const envValidation = checkEnvVars(value);
        if (envValidation && !envValidation.isValid) {
            return Promise.reject(formatMissingVariables(envValidation.missingVars));
        }

        return Promise.resolve();
    }, [checkEnvVars]);

    // Stable rules arrays
    const headerNameRules = useMemo(() => [{ validator: validateHeaderName }], [validateHeaderName]);
    const cookieNameRules = useMemo(() => [{ validator: validateCookieName }], [validateCookieName]);

    return (
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', marginBottom: 16 }}>
            {mode === 'generic' ? (
                <Form.Item
                    name="headerName"
                    style={{ marginBottom: 0, flex: 1 }}
                    rules={headerNameRules}
                    extra={envVarValidation.headerName?.hasVars && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            <InfoCircleOutlined /> Uses environment variables: {envVarValidation.headerName.usedVars.map((v: string) => `{{${v}}}`).join(', ')}
                        </Text>
                    )}
                >
                    <Input
                        placeholder="Header Name"
                        size="small"
                        list="header-name-suggestions"
                        onBlur={(e) => {
                            const fieldValue = e.target.value;
                            if (fieldValue && !fieldValue.includes('{{')) {
                                const normalized = normalizeHeaderName(fieldValue);
                                form.setFieldsValue({ headerName: normalized });
                            }
                        }}
                    />
                </Form.Item>
            ) : (
                <Form.Item
                    name="cookieName"
                    style={{ marginBottom: 0, flex: 1 }}
                    rules={cookieNameRules}
                    extra={envVarValidation.cookieName?.hasVars && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            <InfoCircleOutlined /> Uses environment variables: {envVarValidation.cookieName.usedVars.map((v: string) => `{{${v}}}`).join(', ')}
                        </Text>
                    )}
                >
                    <Input
                        placeholder="Cookie Name"
                        size="small"
                    />
                </Form.Item>
            )}

            {/* Native datalist for header name suggestions — zero React overhead,
                no rc-select, no internal useSafeState mount loop */}
            <datalist id="header-name-suggestions">
                {HEADER_SUGGESTIONS.map(h => <option key={h} value={h} />)}
            </datalist>

            <Form.Item
                name="headerType"
                initialValue={mode === 'cookie' ? 'response' : 'request'}
                style={{ marginBottom: 0 }}
            >
                <Radio.Group
                    size="small"
                    value={headerType}
                    onChange={(e) => setHeaderType(e.target.value)}
                    optionType="button"
                    buttonStyle="solid"
                >
                    <Radio.Button value="request">Request</Radio.Button>
                    <Radio.Button value="response">Response</Radio.Button>
                </Radio.Group>
            </Form.Item>

            <Form.Item
                name="tag"
                style={{ marginBottom: 0, width: 180 }}
            >
                <Input
                    placeholder="Tag (optional)"
                    size="small"
                    maxLength={20}
                />
            </Form.Item>
        </div>
    );
};

export default FormHeader;
