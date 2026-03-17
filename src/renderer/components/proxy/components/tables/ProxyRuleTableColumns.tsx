import React from 'react';
import { Tag, Button, Space, Popconfirm, Typography, Switch, Tooltip } from 'antd';
import { EditOutlined, DeleteOutlined, LinkOutlined, SolutionOutlined, EnvironmentOutlined } from '@ant-design/icons';
import { getSourceName, truncateValue, truncateDomain } from '../../utils';
import { useEnvironments } from '../../../../contexts';
import { getResolvedPreview } from '../../../../utils/validation/environment-variables';

const { Text } = Typography;

/**
 * Proxy Rule Table Column Definitions
 * 
 * Modular column definitions for the proxy rules table.
 * Separates column logic from table component for better maintainability.
 */

/**
 * Get header rule information by ID for reference resolution
 */
const getHeaderRuleInfo = (headerRuleId, headerRules) => {
    return headerRules.find(r => r.id === headerRuleId);
};

/**
 * Name Column - Simple rule name display
 */
export const createNameColumn = () => ({
    title: 'Name',
    dataIndex: 'name',
    key: 'name',
    width: '20%'
});

// Domains Column Component
const DomainsColumnContent = ({ record, headerRules }) => {
    const envContext = useEnvironments();
    
    let domains;
    let hasEnvVars = false;
    
    if (record.headerRuleId) {
        // For header rule references, show the domains from the referenced rule
        const headerRule = getHeaderRuleInfo(record.headerRuleId, headerRules);
        domains = headerRule?.domains || [];
        hasEnvVars = headerRule?.hasEnvVars || false;
    } else {
        // For custom headers, show the proxy rule's own domains
        domains = record.domains;
        hasEnvVars = domains?.some(d => d && d.includes('{{'));
    }
    
    // Resolve domains with env vars if needed
    let resolvedDomains = domains;
    if (hasEnvVars && envContext.environmentsReady && domains) {
        const variables = envContext.getAllVariables();
        resolvedDomains = domains.flatMap(domain => {
            if (domain && domain.includes('{{')) {
                const preview = getResolvedPreview(domain, variables);
                // Split comma-separated domains from resolved env vars
                return preview.text.split(',').map(d => d.trim()).filter(d => d);
            }
            return domain;
        });
    }
    
    return (
        <Space direction="vertical" size={1}>
            {resolvedDomains && resolvedDomains.length > 0 ? (
                <>
                    {resolvedDomains.slice(0, 1).map((domain, index) => {
                        const isTruncated = domain.length > 18;
                        const displayDomain = isTruncated ? `${domain.substring(0, 18)}...` : domain;
                        const isUnresolved = domain.includes('{{') && domain.includes('}}');
                        
                        return isTruncated ? (
                            <Tooltip key={`${domain}-${index}`} title={domain}>
                                <Tag 
                                    color={isUnresolved ? 'warning' : undefined}
                                    style={{ fontSize: '12px', cursor: 'help' }}
                                >
                                    {displayDomain}
                                </Tag>
                            </Tooltip>
                        ) : (
                            <Tag 
                                key={`${domain}-${index}`} 
                                color={isUnresolved ? 'warning' : undefined}
                                style={{ fontSize: '12px' }}
                            >
                                {displayDomain}
                            </Tag>
                        );
                    })}
                    {resolvedDomains.length > 1 && (
                        <Tooltip title={resolvedDomains.slice(1).join(', ')}>
                            <Tag style={{ fontSize: '11px' }}>+{resolvedDomains.length - 1} more</Tag>
                        </Tooltip>
                    )}
                </>
            ) : (
                <Text type="secondary" style={{ fontSize: 12 }}>All domains</Text>
            )}
        </Space>
    );
};

/**
 * Domains Column - Shows domains for custom rules or inherited domains for references with env var resolution
 */
export const createDomainsColumn = (headerRules) => ({
    title: 'Domains',
    key: 'domains',
    width: '20%',
    render: (_, record) => <DomainsColumnContent record={record} headerRules={headerRules} />
});

// Header Column Component
const HeaderColumnContent = ({ record, sources, headerRules }) => {
    const envContext = useEnvironments();
    
    let headerInfo;
    if (record.headerRuleId) {
        // Reference to existing header rule
        const headerRule = getHeaderRuleInfo(record.headerRuleId, headerRules);
        if (headerRule) {
            headerInfo = {
                name: headerRule.headerName,
                isDynamic: headerRule.isDynamic,
                value: headerRule.headerValue,
                sourceId: headerRule.sourceId,
                prefix: headerRule.prefix,
                suffix: headerRule.suffix,
                hasEnvVars: headerRule.hasEnvVars
            };
        } else {
            return <Text type="secondary">Referenced rule not found</Text>;
        }
    } else {
        // Custom header
        headerInfo = {
            name: record.headerName,
            isDynamic: record.isDynamic,
            value: record.headerValue,
            sourceId: record.sourceId,
            prefix: record.prefix,
            suffix: record.suffix,
            hasEnvVars: record.hasEnvVars || 
                       (record.headerName && record.headerName.includes('{{')) ||
                       (record.headerValue && record.headerValue.includes('{{')) ||
                       (record.prefix && record.prefix.includes('{{')) ||
                       (record.suffix && record.suffix.includes('{{'))
        };
    }
    
    // Resolve header name if it has env vars
    let displayName = headerInfo.name;
    const nameHasEnvVars = headerInfo.name && headerInfo.name.includes('{{');
    if (nameHasEnvVars && envContext.environmentsReady) {
        const variables = envContext.getAllVariables();
        const preview = getResolvedPreview(headerInfo.name, variables);
        displayName = preview.text;
    }
    
    // Resolve header value
    let displayValue = headerInfo.value;
    let resolvedFullValue = '';
    let sourceValue = '';
    
    if (headerInfo.isDynamic && headerInfo.sourceId) {
        // For dynamic values, get the source content
        const source = sources?.find(s => s.sourceId === String(headerInfo.sourceId));
        sourceValue = source?.sourceContent || '[SOURCE_NOT_FOUND]';
        
        // Resolve prefix/suffix if they have env vars
        let displayPrefix = headerInfo.prefix || '';
        let displaySuffix = headerInfo.suffix || '';
        if (envContext.environmentsReady) {
            const variables = envContext.getAllVariables();
            if (displayPrefix && displayPrefix.includes('{{')) {
                const preview = getResolvedPreview(displayPrefix, variables);
                displayPrefix = preview.text;
            }
            if (displaySuffix && displaySuffix.includes('{{')) {
                const preview = getResolvedPreview(displaySuffix, variables);
                displaySuffix = preview.text;
            }
        }
        
        // Build the full resolved value
        resolvedFullValue = `${displayPrefix}${sourceValue}${displaySuffix}`;
    } else if (headerInfo.value && headerInfo.value.includes('{{') && envContext.environmentsReady) {
        // For static values with env vars
        const variables = envContext.getAllVariables();
        const preview = getResolvedPreview(headerInfo.value, variables);
        displayValue = preview.text;
        resolvedFullValue = displayValue;
    } else {
        // For plain static values
        resolvedFullValue = headerInfo.value || '';
    }
    
    return (
        <Space direction="vertical" size="small">
            <Space align="center">
                <Text strong>{displayName}</Text>
                {nameHasEnvVars && (
                    <Tooltip title={`Uses environment variables: ${headerInfo.name}`}>
                        <EnvironmentOutlined style={{ color: '#1890ff', fontSize: '12px' }} />
                    </Tooltip>
                )}
            </Space>
            <Text type="secondary" style={{ fontSize: 12 }}>
                Value: {truncateValue(resolvedFullValue)}
            </Text>
        </Space>
    );
};

/**
 * Header Column - Shows header name and value information with env var resolution
 */
export const createHeaderColumn = (sources, headerRules) => ({
    title: 'Header',
    key: 'header',
    width: '28%',
    render: (_, record) => <HeaderColumnContent record={record} sources={sources} headerRules={headerRules} />
});

/**
 * Type Column - Shows whether rule is custom or reference, and if it uses environment variables
 */
export const createTypeColumn = (headerRules) => ({
    title: 'Type',
    key: 'type',
    width: '15%',
    align: 'center',
    render: (_, record) => {
        let hasEnvVars = false;
        
        if (record.headerRuleId) {
            // Check if referenced header rule has env vars
            const headerRule = getHeaderRuleInfo(record.headerRuleId, headerRules);
            hasEnvVars = headerRule?.hasEnvVars || false;
        } else {
            // Check if custom rule has env vars in any field
            hasEnvVars = record.hasEnvVars || 
                        (record.headerName && record.headerName.includes('{{')) ||
                        (record.headerValue && record.headerValue.includes('{{')) ||
                        (record.prefix && record.prefix.includes('{{')) ||
                        (record.suffix && record.suffix.includes('{{')) ||
                        (record.domains && record.domains.some(d => d && d.includes('{{')));
        }
        
        return (
            <Space size={4}>
                {record.headerRuleId ? (
                    <Tooltip title="Using existing header rule">
                        <LinkOutlined />
                    </Tooltip>
                ) : (
                    <Tooltip title="Using static value">
                        <SolutionOutlined />
                    </Tooltip>
                )}
                {hasEnvVars && (
                    <Tag color="purple" style={{ fontSize: '11px', padding: '0 4px' }}>
                        TEMPLATE
                    </Tag>
                )}
            </Space>
        );
    }
});

/**
 * Status Column - Toggle switch for enabling/disabling rules
 */
export const createStatusColumn = (onToggle) => ({
    title: 'Status',
    key: 'status',
    width: '8%',
    align: 'center',
    render: (_, record) => (
        <Switch
            checked={record.enabled !== false}
            onChange={(checked) => onToggle && onToggle(record.id, checked)}
            size="small"
        />
    )
});

/**
 * Actions Column - Edit and delete buttons
 */
export const createActionsColumn = (onEdit, onDelete) => ({
    title: 'Actions',
    key: 'actions',
    width: '12%',
    render: (_, record) => (
        <Space>
            <Button
                type="text"
                icon={<EditOutlined />}
                onClick={() => onEdit(record)}
            />
            <Popconfirm
                title="Delete this rule?"
                onConfirm={() => onDelete(record.id)}
                okText="Yes"
                cancelText="No"
            >
                <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                />
            </Popconfirm>
        </Space>
    )
});

/**
 * Create all table columns
 * Factory function that creates all columns with proper dependencies
 */
export const createAllColumns = (sources, headerRules, onEdit, onDelete, onToggle) => [
    createNameColumn(),
    createTypeColumn(headerRules),
    createDomainsColumn(headerRules),
    createHeaderColumn(sources, headerRules),
    createStatusColumn(onToggle),
    createActionsColumn(onEdit, onDelete)
];