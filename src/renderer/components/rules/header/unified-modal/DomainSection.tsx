import React from 'react';
import { Form } from 'antd';
import DomainTags from '../../../features/domain-tags';
import type { DomainValidation } from '../../../features/domain-tags/DomainTagDisplay';
import {
    validateEnvironmentVariables,
    formatMissingVariables
} from '../../../../utils/validation/environment-variables';

interface DomainSectionProps {
    domainValidation: DomainValidation[];
    setDomainValidation: React.Dispatch<React.SetStateAction<DomainValidation[]>>;
    envContext: { environmentsReady: boolean; getAllVariables: () => Record<string, string> };
}

const DomainSection = ({
    domainValidation,
    setDomainValidation,
    envContext
}: DomainSectionProps) => {
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
                        const invalidDomains: string[] = [];

                        value.forEach((domain: string, index: number) => {
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
                onValidate={(domains: string[]) => {
                    if (envContext.environmentsReady) {
                        const variables = envContext.getAllVariables();
                        const validations = domains.map((domain: string) =>
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