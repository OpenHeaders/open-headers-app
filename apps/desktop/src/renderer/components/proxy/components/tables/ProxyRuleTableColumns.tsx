import { DeleteOutlined, EditOutlined, EnvironmentOutlined, LinkOutlined, SolutionOutlined } from '@ant-design/icons';
import { Button, Popconfirm, Space, Switch, Tag, Tooltip, Typography } from 'antd';
import type { ProxyRule } from '../../../../../types/proxy';
import type { HeaderRule } from '../../../../../types/rules';
import type { Source } from '../../../../../types/source';
import { useEnvironments } from '../../../../contexts';
import { checkRuleActivation, getResolvedPreview } from '../../../../utils/validation/environment-variables';
import { truncateValue } from '../../utils';

export type { ProxyRule } from '../../../../../types/proxy';
export type { HeaderRule } from '../../../../../types/rules';

const { Text } = Typography;

export type ProxySource = Pick<Source, 'sourceId' | 'sourceContent'>;

/**
 * Check if a proxy rule (or its referenced header rule) has unresolved env vars.
 * Returns { isWaiting, missingVars } for display in the table.
 */
function useProxyRuleActivation(record: ProxyRule, headerRules: HeaderRule[]) {
  const envContext = useEnvironments();

  // Determine the effective rule to check (referenced header rule or inline proxy rule)
  let ruleToCheck: {
    headerName?: string;
    headerValue?: string;
    isDynamic?: boolean;
    prefix?: string;
    suffix?: string;
    domains?: string[];
    isEnabled?: boolean;
    hasEnvVars?: boolean;
    envVars?: string[];
  };

  if (record.headerRuleId) {
    const headerRule = headerRules.find((r) => r.id === record.headerRuleId);
    if (!headerRule) return { isWaiting: false, missingVars: [] as string[] };
    ruleToCheck = headerRule;
  } else {
    const hasEnvVars = !!(
      record.hasEnvVars ||
      record.headerName?.includes('{{') ||
      record.headerValue?.includes('{{') ||
      record.prefix?.includes('{{') ||
      record.suffix?.includes('{{') ||
      record.domains?.some((d) => d?.includes('{{'))
    );

    if (!hasEnvVars) return { isWaiting: false, missingVars: [] as string[] };

    ruleToCheck = {
      headerName: record.headerName,
      headerValue: record.headerValue,
      isDynamic: record.isDynamic,
      prefix: record.prefix,
      suffix: record.suffix,
      domains: record.domains,
      isEnabled: record.enabled !== false,
      hasEnvVars: true,
    };
  }

  if (!envContext.environmentsReady) {
    return { isWaiting: true, missingVars: [] as string[] };
  }

  const variables = envContext.getAllVariables();
  const activation = checkRuleActivation(ruleToCheck, variables);

  return {
    isWaiting: activation.activationState === 'waiting_for_deps',
    missingVars: activation.missingVars || [],
  };
}

/**
 * Proxy Rule Table Column Definitions
 *
 * Modular column definitions for the proxy rules table.
 * Separates column logic from table component for better maintainability.
 */

/**
 * Get header rule information by ID for reference resolution
 */
const getHeaderRuleInfo = (headerRuleId: string, headerRules: HeaderRule[]) => {
  return headerRules.find((r) => r.id === headerRuleId);
};

/**
 * Name Column - Simple rule name display
 */
export const createNameColumn = () => ({
  title: 'Name',
  dataIndex: 'name',
  key: 'name',
  width: '20%',
});

// Domains Column Component
const DomainsColumnContent = ({ record, headerRules }: { record: ProxyRule; headerRules: HeaderRule[] }) => {
  const envContext = useEnvironments();

  let domains;
  let hasEnvVars = false;

  if (record.headerRuleId) {
    // For header rule references, show the domains from the referenced rule
    const headerRule = getHeaderRuleInfo(record.headerRuleId, headerRules);
    domains = headerRule?.domains || [];
    hasEnvVars = headerRule?.hasEnvVars ?? false;
  } else {
    // For custom headers, show the proxy rule's own domains
    domains = record.domains;
    hasEnvVars = domains?.some((d) => d?.includes('{{')) ?? false;
  }

  // Resolve domains with env vars if needed
  let resolvedDomains = domains;
  if (hasEnvVars && envContext.environmentsReady && domains) {
    const variables = envContext.getAllVariables();
    resolvedDomains = domains.flatMap((domain: string) => {
      if (domain?.includes('{{')) {
        const preview = getResolvedPreview(domain, variables);
        // Split comma-separated domains from resolved env vars
        return (preview.text ?? '')
          .split(',')
          .map((d) => d.trim())
          .filter((d) => d);
      }
      return domain;
    });
  }

  return (
    <Space direction="vertical" size={1}>
      {resolvedDomains && resolvedDomains.length > 0 ? (
        <>
          {resolvedDomains.slice(0, 1).map((domain: string, index: number) => {
            const isTruncated = domain.length > 18;
            const displayDomain = isTruncated ? `${domain.substring(0, 18)}...` : domain;
            const isUnresolved = domain.includes('{{') && domain.includes('}}');

            return isTruncated ? (
              <Tooltip key={`${domain}-${index}`} title={domain}>
                <Tag color={isUnresolved ? 'warning' : undefined} style={{ fontSize: '12px', cursor: 'help' }}>
                  {displayDomain}
                </Tag>
              </Tooltip>
            ) : (
              <Tag key={`${domain}-${index}`} color={isUnresolved ? 'warning' : undefined} style={{ fontSize: '12px' }}>
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
        <Text type="secondary" style={{ fontSize: 12 }}>
          All domains
        </Text>
      )}
    </Space>
  );
};

/**
 * Domains Column - Shows domains for custom rules or inherited domains for references with env var resolution
 */
export const createDomainsColumn = (headerRules: HeaderRule[]) => ({
  title: 'Domains',
  key: 'domains',
  width: '20%',
  render: (_: unknown, record: ProxyRule) => <DomainsColumnContent record={record} headerRules={headerRules} />,
});

// Header Column Component
const HeaderColumnContent = ({
  record,
  sources,
  headerRules,
}: {
  record: ProxyRule;
  sources: ProxySource[];
  headerRules: HeaderRule[];
}) => {
  const envContext = useEnvironments();
  const { isWaiting } = useProxyRuleActivation(record, headerRules);

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
        hasEnvVars: headerRule.hasEnvVars,
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
      hasEnvVars:
        record.hasEnvVars ||
        record.headerName?.includes('{{') ||
        record.headerValue?.includes('{{') ||
        record.prefix?.includes('{{') ||
        record.suffix?.includes('{{'),
    };
  }

  // Resolve header name if it has env vars
  let displayName: string | undefined = headerInfo.name;
  const nameHasEnvVars = headerInfo.name?.includes('{{');
  if (nameHasEnvVars && envContext.environmentsReady) {
    const variables = envContext.getAllVariables();
    const preview = getResolvedPreview(headerInfo.name, variables);
    displayName = preview.text ?? '';
  }

  // Resolve header value
  let displayValue: string | undefined = headerInfo.value;
  let resolvedFullValue = '';
  let sourceValue = '';

  if (headerInfo.isDynamic && headerInfo.sourceId) {
    // For dynamic values, get the source content
    const source = sources?.find((s) => s.sourceId === String(headerInfo.sourceId));
    sourceValue = source?.sourceContent || '[SOURCE_NOT_FOUND]';

    // Resolve prefix/suffix if they have env vars
    let displayPrefix: string = headerInfo.prefix || '';
    let displaySuffix: string = headerInfo.suffix || '';
    if (envContext.environmentsReady) {
      const variables = envContext.getAllVariables();
      if (displayPrefix?.includes('{{')) {
        const preview = getResolvedPreview(displayPrefix, variables);
        displayPrefix = preview.text ?? '';
      }
      if (displaySuffix?.includes('{{')) {
        const preview = getResolvedPreview(displaySuffix, variables);
        displaySuffix = preview.text ?? '';
      }
    }

    // Build the full resolved value
    resolvedFullValue = `${displayPrefix}${sourceValue}${displaySuffix}`;
  } else if (headerInfo.value?.includes('{{') && envContext.environmentsReady) {
    // For static values with env vars
    const variables = envContext.getAllVariables();
    const preview = getResolvedPreview(headerInfo.value, variables);
    displayValue = preview.text ?? '';
    resolvedFullValue = displayValue;
  } else {
    // For plain static values
    resolvedFullValue = headerInfo.value || '';
  }

  return (
    <Space direction="vertical" size="small" style={{ opacity: isWaiting ? 0.5 : 1 }}>
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
export const createHeaderColumn = (sources: ProxySource[], headerRules: HeaderRule[]) => ({
  title: 'Header',
  key: 'header',
  width: '28%',
  render: (_: unknown, record: ProxyRule) => (
    <HeaderColumnContent record={record} sources={sources} headerRules={headerRules} />
  ),
});

/**
 * Type Column - Shows whether rule is custom or reference, and if it uses environment variables
 */
// Type Column Component (needs hook access for env var checking)
const TypeColumnContent = ({ record, headerRules }: { record: ProxyRule; headerRules: HeaderRule[] }) => {
  const { isWaiting, missingVars } = useProxyRuleActivation(record, headerRules);

  let hasEnvVars = false;
  if (record.headerRuleId) {
    const headerRule = getHeaderRuleInfo(record.headerRuleId, headerRules);
    hasEnvVars = headerRule?.hasEnvVars ?? false;
  } else {
    hasEnvVars = !!(
      record.hasEnvVars ||
      record.headerName?.includes('{{') ||
      record.headerValue?.includes('{{') ||
      record.prefix?.includes('{{') ||
      record.suffix?.includes('{{') ||
      record.domains?.some((d) => d?.includes('{{'))
    );
  }

  return (
    <div>
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
      {isWaiting && missingVars.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center', marginTop: '4px' }}>
          <span style={{ fontSize: '10px', color: '#faad14', fontWeight: 500 }}>Waiting for:</span>
          <Tag color="warning" style={{ fontSize: '9px', padding: '0 4px', margin: 0 }}>
            {missingVars[0]}
          </Tag>
          {missingVars.length > 1 && (
            <Tooltip title={missingVars.slice(1).join(', ')}>
              <Tag style={{ fontSize: '9px', padding: '0 4px', margin: 0 }}>+{missingVars.length - 1} more</Tag>
            </Tooltip>
          )}
        </div>
      )}
    </div>
  );
};

export const createTypeColumn = (headerRules: HeaderRule[]) => ({
  title: 'Type',
  key: 'type',
  width: '15%',
  align: 'center',
  render: (_: unknown, record: ProxyRule) => <TypeColumnContent record={record} headerRules={headerRules} />,
});

/**
 * Status Column - Toggle switch for enabling/disabling rules
 */
// Status Column Component (needs hook access for env var checking)
const StatusColumnContent = ({
  record,
  headerRules,
  onToggle,
}: {
  record: ProxyRule;
  headerRules: HeaderRule[];
  onToggle: (id: string, checked: boolean) => void;
}) => {
  const { isWaiting } = useProxyRuleActivation(record, headerRules);

  return (
    <Tooltip title={isWaiting ? 'Skipped — missing environment variables' : undefined}>
      <Switch
        checked={record.enabled !== false && !isWaiting}
        onChange={(checked: boolean) => onToggle?.(record.id, checked)}
        size="small"
        disabled={isWaiting}
      />
    </Tooltip>
  );
};

export const createStatusColumn = (headerRules: HeaderRule[], onToggle: (id: string, checked: boolean) => void) => ({
  title: 'Status',
  key: 'status',
  width: '8%',
  align: 'center',
  render: (_: unknown, record: ProxyRule) => (
    <StatusColumnContent record={record} headerRules={headerRules} onToggle={onToggle} />
  ),
});

/**
 * Actions Column - Edit and delete buttons
 */
export const createActionsColumn = (onEdit: (record: ProxyRule) => void, onDelete: (id: string) => void) => ({
  title: 'Actions',
  key: 'actions',
  width: '12%',
  render: (_: unknown, record: ProxyRule) => (
    <Space>
      <Button type="text" icon={<EditOutlined />} onClick={() => onEdit(record)} />
      <Popconfirm title="Delete this rule?" onConfirm={() => onDelete(record.id)} okText="Yes" cancelText="No">
        <Button type="text" danger icon={<DeleteOutlined />} />
      </Popconfirm>
    </Space>
  ),
});

/**
 * Create all table columns
 * Factory function that creates all columns with proper dependencies
 */
export const createAllColumns = (
  sources: ProxySource[],
  headerRules: HeaderRule[],
  onEdit: (record: ProxyRule) => void,
  onDelete: (id: string) => void,
  onToggle: (id: string, checked: boolean) => void,
) => [
  createNameColumn(),
  createTypeColumn(headerRules),
  createDomainsColumn(headerRules),
  createHeaderColumn(sources, headerRules),
  createStatusColumn(headerRules, onToggle),
  createActionsColumn(onEdit, onDelete),
];
