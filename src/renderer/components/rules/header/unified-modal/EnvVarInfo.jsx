import React from 'react';
import { Alert, Space, Typography } from 'antd';

const { Text } = Typography;

const EnvVarInfo = ({ envVarValidation, mode }) => {
    // Check if there are any environment variables used
    const hasEnvVars = Object.keys(envVarValidation).some(key => {
        const val = envVarValidation[key];
        if (Array.isArray(val)) {
            return val.some(v => v?.hasVars);
        }
        return val?.hasVars;
    });

    if (!hasEnvVars) return null;

    return (
        <Alert
            message="Environment Variables Detected"
            description={
                <Space direction="vertical" size="small">
                    <Text>This rule uses environment variables. They will be resolved when the rule is applied.</Text>
                    {Object.entries(envVarValidation).map(([field, validation]) => {
                        if (!validation || (!validation.hasVars && !Array.isArray(validation))) return null;
                        
                        // Handle domains array separately
                        if (field === 'domains' && Array.isArray(validation)) {
                            const domainsWithVars = validation
                                .map((v, i) => v?.hasVars ? { index: i, vars: v.usedVars, isValid: v.isValid, missingVars: v.missingVars || [] } : null)
                                .filter(Boolean);
                            
                            if (domainsWithVars.length === 0) return null;
                            
                            const invalidDomains = domainsWithVars.filter(d => !d.isValid);
                            const allDomainVars = [...new Set(domainsWithVars.flatMap(d => d.vars))];
                            
                            return (
                                <div key={field}>
                                    <Text type={invalidDomains.length > 0 ? "danger" : "secondary"}>
                                        • Domains use: {allDomainVars.map(v => `{{${v}}}`).join(', ')}
                                        {invalidDomains.length > 0 && ` (missing: ${[...new Set(invalidDomains.flatMap(d => d.missingVars))].join(', ')})`}
                                    </Text>
                                </div>
                            );
                        }
                        
                        if (!validation.hasVars) return null;
                        
                        // Determine field label based on mode and field name
                        let fieldLabel;
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
                            <Text key={field} type={validation.isValid ? "secondary" : "danger"}>
                                • {fieldLabel} uses: {validation.usedVars.map(v => `{{${v}}}`).join(', ')}
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