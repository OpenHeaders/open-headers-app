import {
  ApiOutlined,
  CopyOutlined,
  CopyrightTwoTone,
  DeleteOutlined,
  EditOutlined,
  EnvironmentOutlined,
  ExclamationCircleOutlined,
  PlusOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Alert, Button, Card, Empty, Popconfirm, Space, Switch, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import type { HeaderRule } from '../../../types/rules';
import { useEnvironments, useNavigation, useSettings, useSources } from '../../contexts';
import { useHeaderRules } from '../../hooks/useCentralizedWorkspace';
import { createRule, RULE_TYPES, showMessage } from '../../utils';
import { createLogger } from '../../utils/error-handling/logger';
import { checkRuleActivation, getResolvedPreview } from '../../utils/validation/environment-variables';
import UnifiedHeaderModal from './header/unified-modal/UnifiedHeaderModal';

const log = createLogger('HeaderRules');

const { Title, Text } = Typography;

type PlaceholderType = 'source_not_found' | 'empty_source' | 'empty_value' | 'missing_env_vars' | null;

const HeaderRules = () => {
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRule, setEditingRule] = useState<HeaderRule | null>(null);

  // All rule mutations go through main process via IPC (WorkspaceStateService)
  const { rules, addRule, updateRule, removeRule, toggleRule } = useHeaderRules();

  // Get sources from context
  const { sources } = useSources();
  const { settings } = useSettings();
  const envContext = useEnvironments();
  const tutorialMode = settings?.tutorialMode !== undefined ? settings.tutorialMode : true;

  // Use ref to always have access to current rules
  const rulesRef = useRef<HeaderRule[]>(rules);
  useEffect(() => {
    rulesRef.current = rules;
  }, [rules]);

  // Get navigation context
  const { getHighlight, applyHighlight, registerActionHandler, flushPendingActions, executeAction, ACTIONS, TARGETS } =
    useNavigation();

  // Apply highlight when table data changes
  useEffect(() => {
    const highlight = getHighlight(TARGETS.RULES_HEADERS);
    if (highlight?.itemId && rules.length > 0) {
      applyHighlight(TARGETS.RULES_HEADERS, highlight.itemId);
    }
  }, [rules, getHighlight, applyHighlight, TARGETS.RULES_HEADERS]);

  // Register action handlers on mount (independent of rules loading)
  useEffect(() => {
    // Register edit action handler
    const unregisterEdit = registerActionHandler(TARGETS.RULES_HEADERS, ACTIONS.EDIT, (itemId) => {
      const rule = rulesRef.current.find((r) => r.id === itemId);
      if (rule) {
        setEditingRule(rule);
        setModalVisible(true);
        showMessage('info', `Editing header rule "${rule.headerName}"`);
      }
    });

    // Register delete action handler
    const unregisterDelete = registerActionHandler(TARGETS.RULES_HEADERS, ACTIONS.DELETE, async (itemId) => {
      try {
        const rule = rulesRef.current.find((r) => r.id === itemId);
        const ruleName = rule ? rule.headerName : 'Rule';
        const success = await removeRule(itemId);
        if (success) showMessage('success', `Header rule "${ruleName}" deleted successfully`);
      } catch (error) {
        log.error('Failed to delete rule:', error);
      }
    });

    // Register toggle action handler
    const unregisterToggle = registerActionHandler(TARGETS.RULES_HEADERS, ACTIONS.TOGGLE, async (itemId) => {
      const rule = rulesRef.current.find((r) => r.id === itemId);
      if (rule) {
        try {
          const success = await toggleRule(itemId, !rule.isEnabled);
          if (success)
            showMessage('success', `Header rule "${rule.headerName}" ${!rule.isEnabled ? 'enabled' : 'disabled'}`);
        } catch (error) {
          log.error('Failed to toggle rule:', error);
        }
      }
    });

    // Register create action handler
    const unregisterCreate = registerActionHandler(TARGETS.RULES_HEADERS, ACTIONS.CREATE, () => {
      setEditingRule(null);
      setModalVisible(true);
      showMessage('info', 'Creating new header rule');
    });

    return () => {
      unregisterEdit();
      unregisterDelete();
      unregisterToggle();
      unregisterCreate();
    };
  }, []); // Empty dependency array - register only once on mount

  // Flush pending navigation actions when rules data arrives
  useEffect(() => {
    if (rules.length > 0) {
      setTimeout(() => flushPendingActions(TARGETS.RULES_HEADERS), 0);
    }
  }, [rules, flushPendingActions, TARGETS.RULES_HEADERS]);

  // Handle add/edit rule — delegates to WorkspaceStateService via useHeaderRules hook
  const handleSaveRule = async (ruleData: Partial<HeaderRule>) => {
    try {
      if (editingRule) {
        // Build the full updated rule shape via createRule, then send as an update
        const updatedRule = createRule(RULE_TYPES.HEADER, {
          ...editingRule,
          ...ruleData,
          id: editingRule.id,
          createdAt: editingRule.createdAt,
          updatedAt: new Date().toISOString(),
        }) as HeaderRule;
        // Send only the changed fields (everything except id)
        const { id: _id, ...updates } = updatedRule;
        await updateRule(editingRule.id, updates);
        showMessage('success', 'Rule updated successfully');
      } else {
        // Build a new rule with proper defaults via createRule
        const newRule = createRule(RULE_TYPES.HEADER, ruleData) as HeaderRule;
        await addRule(newRule);
      }

      setModalVisible(false);
      setEditingRule(null);
    } catch (error) {
      log.error('Failed to save rule:', error);
      showMessage('error', 'Failed to save rule');
    }
  };

  // Helper function to truncate long values
  const truncateValue = (value: string, maxLength: number = 40) => {
    if (!value || value.length <= maxLength) return value;

    const prefixLength = 30;
    const suffixLength = 10;

    if (value.length > maxLength) {
      const prefix = value.substring(0, prefixLength);
      const suffix = value.substring(value.length - suffixLength);
      return `${prefix}...${suffix}`;
    }

    return value;
  };

  // Get dynamic value info for a rule including environment variable resolution
  const getDynamicValueInfo = (rule: HeaderRule) => {
    const result: {
      actualValue: string;
      sourceInfo: string;
      sourceTag: string;
      available: boolean;
      placeholderType: PlaceholderType;
      hasEnvVars: boolean;
      envVarInfo: { missingVars: string[]; totalVars: string[] } | null;
      activationState: string;
      missingDependencies: string[];
    } = {
      actualValue: '',
      sourceInfo: '',
      sourceTag: '',
      available: true,
      placeholderType: null,
      hasEnvVars: false,
      envVarInfo: null,
      activationState: 'active',
      missingDependencies: [],
    };

    // Check environment variable dependencies first
    if (rule.hasEnvVars) {
      result.hasEnvVars = true;

      if (envContext.environmentsReady) {
        const variables = envContext.getAllVariables();
        const activation = checkRuleActivation(rule, variables);

        result.activationState = activation.activationState || 'active';
        result.missingDependencies = activation.missingVars || [];

        if (activation.activationState === 'waiting_for_deps') {
          result.envVarInfo = {
            missingVars: activation.missingVars,
            totalVars: rule.envVars || [],
          };
          result.placeholderType = 'missing_env_vars';
          result.available = false;
        }
      } else {
        // Environment not ready, mark as waiting
        result.activationState = 'waiting_for_deps';
        result.missingDependencies = rule.envVars || [];
        result.placeholderType = 'missing_env_vars';
        result.available = false;
      }
    }

    if (!rule.isDynamic || !rule.sourceId) {
      // Check if this is an empty static value
      if (!rule.headerValue?.trim()) {
        result.actualValue = '[EMPTY_VALUE]';
        result.placeholderType = 'empty_value';
      } else {
        // For static values with env vars, show resolved preview or original if missing deps
        if (rule.hasEnvVars) {
          if (result.activationState === 'waiting_for_deps') {
            // Show original template when waiting for dependencies
            result.actualValue = rule.headerValue;
          } else if (envContext.environmentsReady) {
            const variables = envContext.getAllVariables();
            const preview = getResolvedPreview(rule.headerValue, variables);
            result.actualValue = preview.text ?? '';
          } else {
            result.actualValue = rule.headerValue;
          }
        } else {
          result.actualValue = rule.headerValue;
        }
      }

      return result;
    }

    // Find the source for dynamic values
    const source = sources.find((s) => s.sourceId === rule.sourceId);

    if (!source) {
      result.actualValue = `[SOURCE_NOT_FOUND:${rule.sourceId}]`;
      result.sourceInfo = `Source #${rule.sourceId} (removed)`;
      result.available = false;
      result.placeholderType = 'source_not_found';
      return result;
    }

    const content = source.sourceContent || '';

    if (!content) {
      result.actualValue = `[EMPTY_SOURCE:${rule.sourceId}]`;
      result.sourceInfo = source.sourcePath || `Source #${rule.sourceId}`;
      result.sourceTag = source.sourceTag || '';
      result.placeholderType = 'empty_source';
      return result;
    }

    // Build the actual value with prefix/suffix
    let actualValue: string;
    let prefix = rule.prefix || '';
    let suffix = rule.suffix || '';

    // Resolve env vars in prefix/suffix if needed
    if (rule.hasEnvVars && envContext.environmentsReady) {
      const variables = envContext.getAllVariables();
      if (prefix?.includes('{{')) {
        const prefixPreview = getResolvedPreview(prefix, variables);
        prefix = prefixPreview.text ?? '';
      }
      if (suffix?.includes('{{')) {
        const suffixPreview = getResolvedPreview(suffix, variables);
        suffix = suffixPreview.text ?? '';
      }
    }

    actualValue = `${prefix}${content}${suffix}`;

    const sourceType = source.sourceType || '';
    const sourcePath = source.sourcePath || '';
    const displayPath =
      sourceType.toLowerCase().includes('env') && sourcePath && !sourcePath.startsWith('$')
        ? `$${sourcePath}`
        : sourcePath;

    result.actualValue = actualValue;
    result.sourceInfo = displayPath;
    result.sourceTag = source.sourceTag || '';

    return result;
  };

  // Table columns matching browser extension
  const columns: ColumnsType<HeaderRule> = [
    {
      title: 'Type',
      key: 'type',
      width: 180,
      render: (_: unknown, record: HeaderRule) => {
        const info = getDynamicValueInfo(record);

        return (
          <Space size={4} direction="vertical" align="start">
            <Space size={4}>
              {/* Primary type tag */}
              <Tag color={record.isResponse ? 'blue' : 'green'} style={{ fontSize: '11px', padding: '0 4px' }}>
                {record.isResponse ? 'RESPONSE' : 'REQUEST'}
              </Tag>
              {/* Show if uses environment variables */}
              {info.hasEnvVars && (
                <Tag color="purple" style={{ fontSize: '11px', padding: '0 4px' }}>
                  TEMPLATE
                </Tag>
              )}
            </Space>
            {/* Dependency warning for rules with missing environment variables */}
            {info.activationState === 'waiting_for_deps' && info.missingDependencies?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center', marginTop: '4px' }}>
                <span style={{ fontSize: '10px', color: '#faad14', fontWeight: 500 }}>Waiting for:</span>
                {/* Show first dependency */}
                <Tag
                  color="warning"
                  style={{
                    fontSize: '9px',
                    padding: '0 4px',
                    margin: 0,
                    borderRadius: 3,
                    lineHeight: '16px',
                    height: '16px',
                  }}
                >
                  {info.missingDependencies[0]}
                </Tag>
                {/* Show "+X more" tooltip if there are additional dependencies */}
                {info.missingDependencies.length > 1 && (
                  <Tooltip title={info.missingDependencies.slice(1).join(', ')}>
                    <Tag
                      color="warning"
                      style={{
                        fontSize: '9px',
                        padding: '0 4px',
                        margin: 0,
                        borderRadius: 3,
                        lineHeight: '16px',
                        height: '16px',
                      }}
                    >
                      +{info.missingDependencies.length - 1} more
                    </Tag>
                  </Tooltip>
                )}
              </div>
            )}
          </Space>
        );
      },
    },
    {
      title: 'Tag',
      dataIndex: 'tag',
      key: 'tag',
      width: 80,
      render: (tag: string) => tag || '-', // Display dash when no tag is set
    },
    {
      title: 'Source',
      key: 'source',
      width: 200,
      render: (_: unknown, record: HeaderRule) => {
        const info = getDynamicValueInfo(record);

        if (!record.isDynamic) {
          return (
            <Text
              style={{
                fontSize: '12px',
                color: '#8c8c8c',
                opacity: info.activationState === 'waiting_for_deps' ? 0.5 : 1,
              }}
            >
              Static value
            </Text>
          );
        }

        // Find the source to get its type
        const source = sources.find((s) => s.sourceId === record.sourceId);
        const sourceType = source?.sourceType || 'unknown';

        // Prepare display value based on source type
        let displayValue = info.sourceInfo || '';
        let label: string;

        if (sourceType === 'http') {
          label = 'URL';
          // Remove protocol for display
          displayValue = displayValue.replace(/^https?:\/\//, '');
          // Truncate if too long
          if (displayValue.length > 25) {
            displayValue = `${displayValue.substring(0, 25)}...`;
          }
        } else if (sourceType === 'file') {
          label = 'FILE';
          // Show just filename for files
          const parts = displayValue.split(/[\\/]/);
          displayValue = parts[parts.length - 1] || displayValue;
          // Truncate if too long
          if (displayValue.length > 20) {
            displayValue = `${displayValue.substring(0, 20)}...`;
          }
        } else if (sourceType === 'env') {
          label = 'ENV';
          // Truncate if too long
          if (displayValue.length > 20) {
            displayValue = `${displayValue.substring(0, 20)}...`;
          }
        } else {
          label = sourceType.toUpperCase();
        }

        return (
          <Space size={4} wrap>
            <Tag style={{ fontSize: '11px', margin: 0 }}>ID: {record.sourceId}</Tag>
            <Tooltip title={info.sourceInfo}>
              <Tag style={{ fontSize: '11px', margin: 0, cursor: 'help' }}>
                {label}: {displayValue || 'N/A'}
              </Tag>
            </Tooltip>
          </Space>
        );
      },
    },
    {
      title: 'Header Name',
      dataIndex: 'headerName',
      key: 'headerName',
      width: 160,
      sorter: (a: HeaderRule, b: HeaderRule) => a.headerName.localeCompare(b.headerName),
      render: (text: string, record: HeaderRule) => {
        const info = getDynamicValueInfo(record);
        const hasPlaceholder = info.placeholderType && record.isEnabled;

        // Check if header name has env vars
        let headerNameDisplay = text;
        if (record.hasEnvVars && record.headerName?.includes('{{')) {
          if (info.activationState === 'waiting_for_deps') {
            // Show original template when waiting for dependencies
            headerNameDisplay = record.headerName;
          } else if (envContext.environmentsReady) {
            const variables = envContext.getAllVariables();
            const preview = getResolvedPreview(record.headerName, variables);
            headerNameDisplay = preview.text ?? '';
          }
        }

        // For cookie rules, show cookie name if available
        const isCookieRule = record.headerName === 'Cookie' || record.headerName === 'Set-Cookie';
        if (isCookieRule && record.cookieName) {
          headerNameDisplay = `${headerNameDisplay} (${record.cookieName})`;
        }

        return (
          <Space align="center">
            <Text
              strong
              style={{
                fontSize: '13px',
                opacity: info.activationState === 'waiting_for_deps' ? 0.5 : 1,
              }}
            >
              {headerNameDisplay}
            </Text>
            {isCookieRule && (
              <Tooltip title="Cookie Rule">
                <CopyrightTwoTone style={{ fontSize: '14px' }} />
              </Tooltip>
            )}
            {record.hasEnvVars && record.headerName?.includes('{{') && (
              <Tooltip title={`Uses environment variables: ${record.headerName}`}>
                <EnvironmentOutlined style={{ color: '#1890ff', fontSize: '12px' }} />
              </Tooltip>
            )}
            {hasPlaceholder && info.activationState !== 'waiting_for_deps' && (
              <Tooltip title="This header is being sent with a diagnostic placeholder value">
                <ExclamationCircleOutlined style={{ color: '#ff4d4f', fontSize: '12px' }} />
              </Tooltip>
            )}
          </Space>
        );
      },
    },
    {
      title: 'Value',
      dataIndex: 'headerValue',
      key: 'value',
      width: 200,
      render: (_: unknown, record: HeaderRule) => {
        const info = getDynamicValueInfo(record);
        const hasPlaceholder = info.placeholderType;

        let tooltipMessage: string | null = null;
        let textColor: 'secondary' | 'success' | 'warning' | 'danger' | undefined;
        let icon: React.ReactNode = null;

        if (hasPlaceholder && info.activationState !== 'waiting_for_deps') {
          switch (info.placeholderType) {
            case 'source_not_found':
              tooltipMessage = `Sending '[SOURCE_NOT_FOUND:${record.sourceId}]' because the source was deleted`;
              textColor = 'danger';
              icon = <WarningOutlined style={{ marginRight: 4 }} />;
              break;
            case 'empty_source':
              tooltipMessage = `Sending '[EMPTY_SOURCE:${record.sourceId}]' because the source value is empty`;
              textColor = 'secondary';
              icon = <ExclamationCircleOutlined style={{ marginRight: 4 }} />;
              break;
            case 'empty_value':
              tooltipMessage = "Sending '[EMPTY_VALUE]' because the header value is empty";
              textColor = 'secondary';
              icon = <ExclamationCircleOutlined style={{ marginRight: 4 }} />;
              break;
          }
        }

        const displayValue = truncateValue(info.actualValue);

        // Only show tooltip for error/warning messages, not for truncated values
        if (tooltipMessage) {
          return (
            <Tooltip title={tooltipMessage}>
              <Text
                type={textColor}
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontFamily: hasPlaceholder ? 'monospace' : 'inherit',
                  opacity: record.isEnabled && info.activationState !== 'waiting_for_deps' ? 1 : 0.5,
                  wordBreak: 'break-all',
                }}
              >
                {icon}
                {displayValue}
              </Text>
            </Tooltip>
          );
        }

        return (
          <Text
            type={textColor}
            style={{
              display: 'block',
              fontSize: '13px',
              fontFamily: hasPlaceholder ? 'monospace' : 'inherit',
              opacity: record.isEnabled && info.activationState !== 'waiting_for_deps' ? 1 : 0.5,
              wordBreak: 'break-all',
            }}
          >
            {icon}
            {displayValue}
          </Text>
        );
      },
    },
    {
      title: 'Domains',
      dataIndex: 'domains',
      key: 'domains',
      width: 140,
      sorter: (a: HeaderRule, b: HeaderRule) => (a.domains || []).join(',').localeCompare((b.domains || []).join(',')),
      render: (domains: string[], record: HeaderRule) => {
        // Resolve domains with env vars if needed
        let resolvedDomains = domains;

        if (record.hasEnvVars && envContext.environmentsReady) {
          const variables = envContext.getAllVariables();
          resolvedDomains = domains.flatMap((domain: string) => {
            if (domain?.includes('{{')) {
              const preview = getResolvedPreview(domain, variables);
              const previewText = preview.text ?? '';
              // Unresolved variables — keep original domain
              if (previewText.includes('{{') && previewText.includes('}}')) {
                return domain;
              }
              // Split comma-separated domains from resolved env vars
              return previewText
                .split(',')
                .map((d) => d.trim())
                .filter((d) => d);
            }
            return domain;
          });
        }

        return (
          <Space direction="vertical" size={1}>
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
          </Space>
        );
      },
    },
    {
      title: 'Status',
      key: 'status',
      width: 80,
      align: 'center',
      render: (_: unknown, record: HeaderRule) => {
        const info = getDynamicValueInfo(record);
        const isWaitingForDeps = info.activationState === 'waiting_for_deps';

        return (
          <Tooltip title={isWaitingForDeps ? 'Cannot enable - missing environment variables' : undefined}>
            <Switch
              checked={record.isEnabled && !isWaitingForDeps}
              onChange={(checked) => toggleRule(record.id, checked)}
              size="small"
              disabled={isWaitingForDeps}
            />
          </Tooltip>
        );
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      align: 'center',
      fixed: 'right',
      render: (_: unknown, record: HeaderRule) => {
        const info = getDynamicValueInfo(record);

        const handleCopyValue = async () => {
          try {
            await navigator.clipboard.writeText(info.actualValue);
            showMessage('success', 'Value copied to clipboard');
          } catch (error) {
            showMessage('error', 'Failed to copy to clipboard');
          }
        };

        return (
          <Space size={4}>
            <Tooltip title="Copy value">
              <Button type="text" icon={<CopyOutlined />} size="small" onClick={handleCopyValue} />
            </Tooltip>
            <Tooltip
              title={
                record.headerName === 'Cookie' || record.headerName === 'Set-Cookie'
                  ? 'Edit Cookie rule'
                  : 'Edit Generic rule'
              }
            >
              <Button
                type="text"
                icon={<EditOutlined />}
                size="small"
                onClick={() => executeAction(TARGETS.RULES_HEADERS, ACTIONS.EDIT, record.id)}
              />
            </Tooltip>
            <Popconfirm
              title="Delete this rule?"
              onConfirm={() => executeAction(TARGETS.RULES_HEADERS, ACTIONS.DELETE, record.id)}
              okText="Yes"
              cancelText="No"
            >
              <Tooltip title="Delete rule">
                <Button type="text" danger icon={<DeleteOutlined />} size="small" />
              </Tooltip>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <div className="header-rules-container">
      <Card>
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Title level={4} style={{ margin: 0 }}>
            <ApiOutlined /> Header Rules
          </Title>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingRule(null);
              setModalVisible(true);
            }}
          >
            Add Rule
          </Button>
        </div>

        {tutorialMode && (
          <Alert
            message="Header Rules"
            description={
              <div>
                <div>Header rules allow you to modify HTTP request and response headers for specific domains.</div>
                <div style={{ marginTop: 8 }}>Headers can have static values or dynamic values from sources</div>
                <div style={{ marginTop: 8 }}>
                  Rules are automatically synced with the browser extension and applied in real-time
                </div>
              </div>
            }
            type="info"
            showIcon
            closable
            style={{ marginBottom: 16 }}
          />
        )}

        <Table
          dataSource={rules}
          columns={columns}
          rowKey="id"
          scroll={{ x: 1000, y: 280 }}
          size="small"
          locale={{
            emptyText: (
              <Empty description="No header rules yet" image={Empty.PRESENTED_IMAGE_SIMPLE}>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    setEditingRule(null);
                    setModalVisible(true);
                  }}
                >
                  Add Your First Rule
                </Button>
              </Empty>
            ),
          }}
        />
      </Card>

      <UnifiedHeaderModal
        visible={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          setEditingRule(null);
        }}
        onSave={handleSaveRule}
        initialValues={editingRule}
      />
    </div>
  );
};

export default HeaderRules;
