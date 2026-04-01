import {
  CheckOutlined,
  CopyTwoTone,
  DeleteOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  FileTextOutlined,
  GlobalOutlined,
} from '@ant-design/icons';
import { getAppLauncher } from '@utils/app-launcher';
import { Alert, App, Button, Divider, Empty, Popconfirm, Space, Spin, Switch, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type React from 'react';
import { useEffect, useState } from 'react';

declare const browser: typeof chrome | undefined;

const { Text } = Typography;

interface ActiveRule {
  id?: string;
  headerName: string;
  headerValue?: string;
  isResponse?: boolean;
  isEnabled?: boolean;
  domains?: string[];
  tag?: string;
  matchType?: string;
  [key: string]: unknown;
}

interface CurrentTabInfo {
  id: number;
  url: string;
  domain: string;
  title: string;
}

interface TableRecord extends ActiveRule {
  key: string | number;
}

const TAG_COLORS = ['blue', 'volcano', 'green', 'purple', 'orange', 'cyan', 'magenta', 'gold', 'geekblue', 'red'] as const;

function getTagColor(tag: string): string {
  let hash = 5381;
  for (let i = 0; i < tag.length; i++) {
    hash = ((hash * 33) ^ tag.charCodeAt(i)) >>> 0;
  }
  return TAG_COLORS[hash % TAG_COLORS.length];
}

const ActiveRules: React.FC = () => {
  const { message } = App.useApp();
  const appLauncher = getAppLauncher();
  const [currentTab, setCurrentTab] = useState<CurrentTabInfo | null>(null);
  const [activeRules, setActiveRules] = useState<ActiveRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedRowId, setCopiedRowId] = useState<string | number | null>(null);

  useEffect(() => {
    const fetchActiveRules = async () => {
      try {
        const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
        const tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]) {
          const tab = tabs[0];
          const url = new URL(tab.url!);
          const response = await new Promise<{ activeRules?: ActiveRule[] }>((resolve) => {
            browserAPI.runtime.sendMessage({ type: 'getActiveRulesForTab', tabId: tab.id, tabUrl: tab.url }, (resp) => {
              resolve((resp as { activeRules?: ActiveRule[] }) || { activeRules: [] });
            });
          });
          setCurrentTab({ id: tab.id!, url: tab.url!, domain: url.hostname, title: tab.title || '' });
          setActiveRules(response.activeRules || []);
        }
      } catch (error) {
        console.error(new Date().toISOString(), 'ERROR', '[ActiveRules]', 'Error getting active rules:', error);
        setActiveRules([]);
      } finally {
        setLoading(false);
      }
    };

    void fetchActiveRules();

    const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
    const handleTabUpdate = (_tabId: number, changeInfo: chrome.tabs.OnUpdatedInfo, tab: chrome.tabs.Tab) => {
      if (changeInfo.status === 'complete' && tab.active) void fetchActiveRules();
    };
    browserAPI.tabs.onUpdated.addListener(handleTabUpdate);
    browserAPI.tabs.onActivated.addListener(fetchActiveRules);
    const handleStorageChange = () => {
      void fetchActiveRules();
    };
    browserAPI.storage.onChanged.addListener(handleStorageChange);

    return () => {
      browserAPI.tabs.onUpdated.removeListener(handleTabUpdate);
      browserAPI.tabs.onActivated.removeListener(fetchActiveRules);
      browserAPI.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const columns: ColumnsType<TableRecord> = [
    {
      title: 'Header Name',
      dataIndex: 'headerName',
      key: 'headerName',
      width: 160,
      render: (text: string) => (
        <Text strong style={{ fontSize: '13px' }}>
          {text}
        </Text>
      ),
    },
    {
      title: 'Value',
      dataIndex: 'headerValue',
      key: 'headerValue',
      width: 150,
      render: (text: string, record: TableRecord) => {
        const fullValue = text || '';
        let displayValue = fullValue || '[Dynamic]';
        if (displayValue !== '[Dynamic]' && displayValue.length > 16) {
          displayValue = `${displayValue.substring(0, 9)}...${displayValue.substring(displayValue.length - 4)}`;
        }
        const rowKey = record.key;
        return (
          <div
            className="value-cell"
            style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', overflow: 'hidden' }}
          >
            <Text style={{ fontSize: '13px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {displayValue}
            </Text>
            {fullValue && (
              copiedRowId === rowKey ? (
                <CheckOutlined
                  className="value-copy-icon"
                  style={{ fontSize: '12px', color: '#52c41a', flexShrink: 0, opacity: 1 }}
                />
              ) : (
                <CopyTwoTone
                  className="value-copy-icon"
                  style={{ fontSize: '12px', cursor: 'pointer', flexShrink: 0, opacity: 0 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    void navigator.clipboard.writeText(fullValue);
                    setCopiedRowId(rowKey);
                    setTimeout(() => setCopiedRowId(null), 1000);
                  }}
                />
              )
            )}
          </div>
        );
      },
    },
    {
      title: 'Domains',
      dataIndex: 'domains',
      key: 'domains',
      width: 160,
      render: (domains: string[]) => {
        if (!domains || domains.length === 0) return <Tag variant="outlined" color="default">All domains</Tag>;
        const first = domains[0].length > 14 ? `${domains[0].substring(0, 14)}...` : domains[0];
        const overflowCount = domains.length - 1;
        const tooltip = (
          <div style={{ fontFamily: 'monospace', fontSize: 12 }}>
            {domains.map((d, i) => (
              <div key={i}>
                <span style={{ opacity: 0.6 }}>{i + 1}. </span>
                {d}
              </div>
            ))}
          </div>
        );
        return (
          <Tooltip title={tooltip} styles={{ root: { maxWidth: 500 } }}>
            <Space size={2}>
              <Tag variant="outlined" style={{ fontSize: '12px', cursor: 'default', margin: 0 }}>{first}</Tag>
              {overflowCount > 0 && (
                <Tag variant="outlined" style={{ fontSize: '12px', cursor: 'default', margin: 0 }}>+{overflowCount}</Tag>
              )}
            </Space>
          </Tooltip>
        );
      },
    },
    {
      title: 'Tags',
      key: 'tags',
      width: 130,
      align: 'center',
      render: (_: unknown, record: TableRecord) => {
        const tagStyle = { margin: 0, fontSize: '11px' };

        // Build tag descriptors ordered by display priority:
        // 1. Match type (Resource) — only for indirect matches
        // 2. Custom tag (user-assigned, e.g. DEV)
        // 3. Req/Res — always present, least important
        const allTags: { label: string; color?: string; tooltip?: string }[] = [];
        if (record.matchType === 'indirect') {
          allTags.push({ label: 'Resource', color: 'processing', tooltip: 'Applied to resources loaded by this page, not the page itself' });
        }
        if (record.tag) {
          allTags.push({ label: record.tag, color: getTagColor(record.tag) });
        }
        allTags.push({ label: record.isResponse ? 'Res' : 'Req', tooltip: record.isResponse ? 'Response' : 'Request' });

        const hasStatusTag = allTags.length > 0 && allTags[0].label === 'Resource';
        const maxVisible = hasStatusTag ? 1 : 2;
        const visible = allTags.slice(0, maxVisible);
        const overflowCount = allTags.length - maxVisible;

        return (
          <Space size={2}>
            {visible.map((t, i) =>
              t.tooltip ? (
                <Tooltip key={i} title={t.tooltip}>
                  <Tag color={t.color} variant="outlined" style={{ ...tagStyle, cursor: 'help' }}>
                    {t.label}
                  </Tag>
                </Tooltip>
              ) : (
                <Tag key={i} color={t.color} variant="outlined" style={tagStyle}>
                  {t.label}
                </Tag>
              ),
            )}
            {overflowCount > 0 && (
              <Tooltip
                title={
                  <div style={{ fontSize: 12 }}>
                    {allTags.map((t, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: i < allTags.length - 1 ? 4 : 0 }}>
                        <span style={{ opacity: 0.6 }}>{i + 1}. </span>
                        <Tag color={t.color} variant="outlined" style={{ margin: 0, fontSize: '11px' }}>
                          {t.label}
                        </Tag>
                      </div>
                    ))}
                  </div>
                }
                styles={{ root: { maxWidth: 400 } }}
              >
                <Tag variant="outlined" style={{ ...tagStyle, cursor: 'help' }}>+{overflowCount}</Tag>
              </Tooltip>
            )}
          </Space>
        );
      },
    },
    {
      title: 'Status',
      dataIndex: 'isEnabled',
      key: 'isEnabled',
      width: 80,
      align: 'center',
      fixed: 'right',
      render: (enabled: unknown, record: TableRecord) => {
        const isEnabled = enabled !== false;
        return (
          <Switch
            checked={isEnabled}
            onChange={() => {
              // Optimistic update — immediately reflect in UI
              setActiveRules((prev) =>
                prev.map((r) => (r.id === record.id ? { ...r, isEnabled: !isEnabled } : r)),
              );
              const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
              browserAPI.runtime.sendMessage(
                { type: 'toggleRule', ruleId: record.id, enabled: !isEnabled },
                (response: unknown) => {
                  const resp = response as { success?: boolean } | undefined;
                  if (resp?.success) {
                    // Trigger immediate badge refresh
                    browserAPI.runtime.sendMessage({ type: 'rulesUpdated' });
                  } else {
                    // Revert on failure
                    setActiveRules((prev) =>
                      prev.map((r) => (r.id === record.id ? { ...r, isEnabled } : r)),
                    );
                    message.error('Failed to toggle rule');
                  }
                },
              );
            }}
            size="small"
          />
        );
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 90,
      align: 'center',
      fixed: 'right',
      render: (_: unknown, record: TableRecord) => (
        <Space size={2}>
          <Tooltip title="Edit in desktop app">
            <Button
              type="text"
              icon={<EditOutlined />}
              size="small"
              onClick={async () => {
                await appLauncher.launchOrFocus({ tab: 'rules', subTab: 'headers', action: 'edit', itemId: record.id });
                message.info('Opening edit dialog in OpenHeaders app');
              }}
            />
          </Tooltip>
          <Popconfirm
            title="Delete rule"
            description={`Delete "${record.headerName}"?`}
            onConfirm={() => {
              // Optimistic removal
              setActiveRules((prev) => prev.filter((r) => r.id !== record.id));
              const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
              browserAPI.runtime.sendMessage(
                { type: 'deleteRule', ruleId: record.id },
                (response: unknown) => {
                  const resp = response as { success?: boolean } | undefined;
                  if (resp?.success) {
                    message.success('Rule deleted');
                  } else {
                    message.error('Failed to delete rule');
                  }
                },
              );
            }}
            okText="Delete"
            okType="danger"
            cancelText="Cancel"
          >
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              size="small"
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  if (loading)
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <Spin size="large" />
        <Text type="secondary" style={{ display: 'block', marginTop: '16px' }}>
          Loading current tab information...
        </Text>
      </div>
    );
  if (!currentTab)
    return (
      <Empty
        image={<ExclamationCircleOutlined style={{ fontSize: 32, color: 'var(--text-tertiary)' }} />}
        description="Unable to get current tab information"
        style={{ padding: '40px 0' }}
      />
    );
  if (!currentTab.domain || currentTab.url.startsWith('chrome://') || currentTab.url.startsWith('edge://'))
    return (
      <div style={{ padding: '20px' }}>
        <Alert
          title="System Page"
          description="Header rules do not apply to browser system pages"
          type="info"
          showIcon
        />
      </div>
    );

  const enabledCount = activeRules.filter((r) => r.isEnabled !== false).length;
  const directMatches = activeRules.filter((r) => r.matchType === 'direct').length;
  const indirectMatches = activeRules.filter((r) => r.matchType === 'indirect').length;

  return (
    <div className="header-rules-section" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="table-toolbar">
        <div className="header-rules-title" style={{ justifyContent: 'center', gap: '12px' }}>
          <GlobalOutlined style={{ fontSize: '14px', color: 'var(--text-secondary)' }} />
          <Tooltip title={currentTab.domain.length > 30 ? currentTab.domain : undefined}>
            <Text strong style={{ fontSize: '13px' }}>
              {currentTab.domain.length > 30
                ? `${currentTab.domain.substring(0, 20)}...${currentTab.domain.substring(currentTab.domain.length - 7)}`
                : currentTab.domain}
            </Text>
          </Tooltip>
          <Divider orientation="vertical" style={{ margin: '0 4px', height: '14px' }} />
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {enabledCount} of {activeRules.length} active
            {indirectMatches > 0 && ` (${directMatches} direct, ${indirectMatches} via resources)`}
          </Text>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, paddingBottom: '8px' }}>
        <Table
          dataSource={activeRules.map((rule, index) => ({ ...rule, key: rule.id || index }))}
          columns={columns}
          pagination={false}
          size="small"
          scroll={{ x: 770 }}
          locale={{
            emptyText: (
              <Empty
                image={<FileTextOutlined style={{ fontSize: 24, color: 'var(--text-tertiary)' }} />}
                description={
                  <Space orientation="vertical" size={4}>
                    <Text type="secondary">No rules active on this page</Text>
                    <Text type="secondary" style={{ fontSize: '11px' }}>
                      Rules may be disabled or configured for other domains
                    </Text>
                  </Space>
                }
                style={{ padding: '24px 0' }}
              />
            ),
          }}
          className="header-rules-table"
        />
      </div>
    </div>
  );
};

export default ActiveRules;
