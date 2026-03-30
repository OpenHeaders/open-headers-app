import { Alert, Form, Input, Select, Space, Typography, theme } from 'antd';
import type React from 'react';
import { useCallback, useMemo } from 'react';
import { formatSourceDisplay, getSourceIcon } from '@/renderer/components/proxy';
import { useSources } from '@/renderer/contexts';
import {
  formatMissingVariables,
  validateEnvironmentVariables,
} from '@/renderer/utils/validation/environment-variables';

const { Option } = Select;
const { Text } = Typography;

interface EnvContext {
  environmentsReady: boolean;
  getAllVariables: () => Record<string, string>;
}

interface ValueSectionProps {
  mode: 'generic' | 'cookie';
  valueType: string;
  setValueType: (type: string) => void;
  envContext: EnvContext;
}

const ValueSection: React.FC<ValueSectionProps> = ({ mode, valueType, setValueType, envContext }) => {
  const { sources } = useSources();
  const { token } = theme.useToken();

  // Pure env-var check — no state side effects
  const checkEnvVars = useCallback(
    (value: string) => {
      if (!value || !envContext.environmentsReady) return null;
      const variables = envContext.getAllVariables();
      return validateEnvironmentVariables(value, variables);
    },
    [envContext],
  );

  // Validation for header value — pure
  const validateHeaderValue = useCallback(
    (_: unknown, value: string) => {
      if (valueType === 'static' && !value?.trim()) {
        return Promise.reject('Header value is required');
      }

      const envValidation = checkEnvVars(value);
      if (envValidation && !envValidation.isValid) {
        return Promise.reject(formatMissingVariables(envValidation.missingVars));
      }

      return Promise.resolve();
    },
    [valueType, checkEnvVars],
  );

  // Validation for cookie value — pure
  const validateCookieValue = useCallback(
    (_: unknown, value: string) => {
      if (valueType === 'static' && !value?.trim()) {
        return Promise.reject('Cookie value is required');
      }

      const envValidation = checkEnvVars(value);
      if (envValidation && !envValidation.isValid) {
        return Promise.reject(formatMissingVariables(envValidation.missingVars));
      }

      return Promise.resolve();
    },
    [valueType, checkEnvVars],
  );

  // Validation for prefix/suffix — pure
  const validatePrefix = useCallback(
    (_: unknown, value: string) => {
      if (!value) return Promise.resolve();
      const envValidation = checkEnvVars(value);
      if (envValidation && !envValidation.isValid) {
        return Promise.reject(formatMissingVariables(envValidation.missingVars));
      }
      return Promise.resolve();
    },
    [checkEnvVars],
  );

  const validateSuffix = useCallback(
    (_: unknown, value: string) => {
      if (!value) return Promise.resolve();
      const envValidation = checkEnvVars(value);
      if (envValidation && !envValidation.isValid) {
        return Promise.reject(formatMissingVariables(envValidation.missingVars));
      }
      return Promise.resolve();
    },
    [checkEnvVars],
  );

  // Stable rules arrays
  const validateValue = mode === 'cookie' ? validateCookieValue : validateHeaderValue;
  const valueRules = useMemo(() => [{ validator: validateValue }], [validateValue]);
  const prefixRules = useMemo(() => [{ validator: validatePrefix }], [validatePrefix]);
  const suffixRules = useMemo(() => [{ validator: validateSuffix }], [validateSuffix]);

  const valuePlaceholder =
    mode === 'cookie' ? 'Cookie Value (e.g., abc123, {{SESSION_TOKEN}})' : 'Header Value (e.g., Bearer {{API_TOKEN}})';

  const valueFieldName = mode === 'cookie' ? 'cookieValue' : 'headerValue';

  return (
    <>
      <Space.Compact block style={{ marginBottom: 16 }}>
        <Form.Item name="valueType" initialValue="static" style={{ marginBottom: 0 }}>
          <Select size="small" style={{ width: 120 }} value={valueType} onChange={setValueType}>
            <Option value="static">Static</Option>
            <Option value="dynamic" disabled={!sources || sources.length === 0}>
              Dynamic {sources && sources.length === 0 && '(No sources)'}
            </Option>
          </Select>
        </Form.Item>

        {valueType === 'static' ? (
          <Form.Item name={valueFieldName} style={{ flex: 1, marginBottom: 0 }} rules={valueRules}>
            <Input placeholder={valuePlaceholder} size="small" />
          </Form.Item>
        ) : (
          <Form.Item
            name="sourceId"
            style={{ flex: 1, marginBottom: 0 }}
            rules={[{ required: true, message: 'Please select a source' }]}
          >
            <Select placeholder="Select a source" size="small" showSearch optionFilterProp="children">
              {sources && sources.length > 0 ? (
                sources.map((source) => (
                  <Option key={source.sourceId} value={source.sourceId}>
                    {getSourceIcon(source)}
                    {formatSourceDisplay(source)}
                  </Option>
                ))
              ) : (
                <Option disabled>No sources available</Option>
              )}
            </Select>
          </Form.Item>
        )}
      </Space.Compact>

      {/* Dynamic Value Format (only shown for dynamic values) */}
      {valueType === 'dynamic' && (
        <>
          {sources && sources.length === 0 && (
            <Alert
              message="No Sources Available"
              description="Please create at least one source in the Sources tab before using dynamic values."
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}

          <Form.Item
            label={
              <Text type="secondary" style={{ fontSize: 12 }}>
                Value Format (optional)
              </Text>
            }
            style={{ marginBottom: 16 }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                borderRadius: 6,
                padding: 4,
                border: `1px solid ${token.colorBorder}`,
                backgroundColor: token.colorFillQuaternary,
              }}
            >
              <Form.Item name="prefix" style={{ flex: 1, marginBottom: 0, marginRight: -1 }} rules={prefixRules}>
                <Input
                  placeholder="Prefix (e.g., {{AUTH_TYPE}} )"
                  size="small"
                  style={{
                    borderRadius: '4px 0 0 4px',
                    borderRight: 'none',
                    textAlign: 'right',
                  }}
                />
              </Form.Item>

              <div
                style={{
                  padding: '4px 12px',
                  border: `1px solid ${token.colorBorder}`,
                  backgroundColor: token.colorFillSecondary,
                  color: token.colorTextSecondary,
                  fontSize: 13,
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  height: 32,
                  fontStyle: 'italic',
                }}
              >
                {'{source_value}'}
              </div>

              <Form.Item name="suffix" style={{ flex: 1, marginBottom: 0, marginLeft: -1 }} rules={suffixRules}>
                <Input
                  placeholder="Suffix (e.g., {{ENV}})"
                  size="small"
                  style={{
                    borderRadius: '0 4px 4px 0',
                    borderLeft: 'none',
                  }}
                />
              </Form.Item>
            </div>
          </Form.Item>
        </>
      )}
    </>
  );
};

export default ValueSection;
