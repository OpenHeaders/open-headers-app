import React from 'react';
import { Form } from 'antd';
import DomainTags from '../../../features/domain-tags';
import { 
    validateEnvironmentVariables,
    formatMissingVariables
} from '../../../../utils/validation/environment-variables';

const DomainSection = ({ 
    domainValidation, 
    setDomainValidation,
    envContext 
}) => {
    return (
        <Form.Item
            label="Domains"
            name="domains"
            rules={[{
                required: true,
                validator: (_, value) => {
                    if (!value || value.length === 0) {
                        return Promise.reject('Please add at least one domain pattern');
                    }
                    
                    // Validate environment variables in domains
                    if (envContext.environmentsReady) {
                        const variables = envContext.getAllVariables();
                        const invalidDomains = [];
                        
                        value.forEach((domain, index) => {
                            const validation = validateEnvironmentVariables(domain, variables);
                            if (validation.hasVars && !validation.isValid) {
                                invalidDomains.push(`${domain} (${formatMissingVariables(validation.missingVars)})`);
                            }
                        });
                        
                        if (invalidDomains.length > 0) {
                            return Promise.reject(`Invalid domains: ${invalidDomains.join(', ')}`);
                        }
                    }
                    
                    return Promise.resolve();
                }
            }]}
            style={{ marginBottom: 20 }}
        >
            <DomainTags 
                onValidate={(domains) => {
                    if (envContext.environmentsReady) {
                        const variables = envContext.getAllVariables();
                        const validations = domains.map(domain => 
                            validateEnvironmentVariables(domain, variables)
                        );
                        setDomainValidation(validations);
                    }
                }}
                validationResults={domainValidation}
            />
        </Form.Item>
    );
};

export default DomainSection;