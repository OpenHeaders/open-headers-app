import React, { useCallback, useMemo } from 'react';
import { Form } from 'antd';
import DomainTags from '../../../features/domain-tags';
import type { DomainValidation } from '../../../features/domain-tags/DomainTagDisplay';
import {
    validateEnvironmentVariables,
    formatMissingVariables
} from '../../../../utils/validation/environment-variables';

interface DomainSectionProps {
    domainValidation: DomainValidation[];
    envContext: { environmentsReady: boolean; getAllVariables: () => Record<string, string> };
}

const DomainSection = ({
    domainValidation,
    envContext
}: DomainSectionProps) => {
    // Pure validator — no side effects, stable reference
    const domainValidator = useCallback((_: unknown, value: string[]) => {
        if (!value || value.length === 0) {
            return Promise.reject('Please add at least one domain pattern');
        }

        if (envContext.environmentsReady) {
            const variables = envContext.getAllVariables();
            const invalidDomains: string[] = [];

            value.forEach((domain: string) => {
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
    }, [envContext]);

    const domainRules = useMemo(() => [{
        required: true,
        validator: domainValidator
    }], [domainValidator]);

    return (
        <Form.Item
            label="Domains"
            name="domains"
            rules={domainRules}
            style={{ marginBottom: 20 }}
        >
            <DomainTags
                validationResults={domainValidation}
            />
        </Form.Item>
    );
};

export default DomainSection;
