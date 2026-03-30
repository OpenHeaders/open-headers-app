import { Alert, Space, Typography } from 'antd';
import type { EnvVarValidation } from '../../../../utils/validation/environment-variables';

const { Text } = Typography;

const EnvVarInfo = ({
  envVarValidation,
  mode,
}: {
  envVarValidation: Record<string, EnvVarValidation>;
  mode: string;
}) => {
  // Check if there are any environment variables used
  const hasEnvVars = Object.values(envVarValidation).some((v) => v?.hasVars);

  if (!hasEnvVars) return null;

  return (
    <Alert
      message="Environment Variables Detected"
      description={
        <Space direction="vertical" size="small">
          <Text>This rule uses environment variables. They will be resolved when the rule is applied.</Text>
          {Object.entries(envVarValidation).map(([field, validation]) => {
            if (!validation?.hasVars) return null;

            // Determine field label based on mode and field name
            let fieldLabel: string;
            if (mode === 'cookie') {
              if (field === 'cookieName') fieldLabel = 'Cookie name';
              else if (field === 'cookieValue') fieldLabel = 'Cookie value';
              else fieldLabel = field.charAt(0).toUpperCase() + field.slice(1);
            } else {
              if (field === 'headerName') fieldLabel = 'Header name';
              else if (field === 'headerValue') fieldLabel = 'Header value';
              else fieldLabel = field.charAt(0).toUpperCase() + field.slice(1);
            }

            return (
              <Text key={field} type={validation.isValid ? 'secondary' : 'danger'}>
                • {fieldLabel} uses: {validation.usedVars.map((v: string) => `{{${v}}}`).join(', ')}
                {!validation.isValid && ` (missing: ${validation.missingVars.join(', ')})`}
              </Text>
            );
          })}
        </Space>
      }
      type="info"
      showIcon
      style={{ marginBottom: 16 }}
    />
  );
};

export default EnvVarInfo;
