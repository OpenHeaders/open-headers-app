import {
  CheckOutlined,
  CopyTwoTone,
  DeleteOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { getAppLauncher } from '@utils/app-launcher';
import { Alert, App, Badge, Button, Empty, Input, Popconfirm, Space, Spin, Switch, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { FilterValue, SorterResult } from 'antd/es/table/interface';
import type React from 'react';
import { useEffect, useState } from 'react';

declare const browser: typeof chrome | undefined;

const { Text } = Typography;

interface MatchedRequest {
  url: string;
  pattern: string;
  timestamp: number;
}

interface MatchedRequestRecord extends MatchedRequest {
  key: string;
  type: 'direct' | 'resource';
}

function formatTimestampShort(timestamp: number): React.ReactNode {
  const d = new Date(timestamp);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return <>{h}:{m}:{s}<span style={{ fontSize: '9px', opacity: 0.6 }}>.{ms}</span></>;
}

function formatTimestampFull(timestamp: number): React.ReactNode {
  const d = new Date(timestamp);
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const day = d.getDate();
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return <>{day} {month} {year} {h}:{m}:{s}<span style={{ fontSize: '9px', opacity: 0.6 }}>.{ms}</span></>;
}

interface ActiveRule {
  id?: string;
  headerName: string;
  headerValue?: string;
  isResponse?: boolean;
  isEnabled?: boolean;
  domains?: string[];
  tag?: string;
  matchType?: string;
  matchedUrls?: MatchedRequest[];
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

/**
 * Renders a URL with the portion matching the pattern highlighted.
 * Strips wildcards from the pattern to find the core string in the URL.
 */
function renderHighlightedUrl(url: string, pattern: string): React.ReactNode {
  // Strip wildcard prefixes to get the matchable core: "*.example.com" → "example.com"
  const core = pattern.replace(/^\*\.?/, '').toLowerCase();
  if (!core || core === '*') {
    return <span style={{ wordBreak: 'break-all' }}>{url}</span>;
  }

  const lowerUrl = url.toLowerCase();
  const matchIndex = lowerUrl.indexOf(core);
  if (matchIndex === -1) {
    return <span style={{ wordBreak: 'break-all' }}>{url}</span>;
  }

  const before = url.substring(0, matchIndex);
  const matched = url.substring(matchIndex, matchIndex + core.length);
  const after = url.substring(matchIndex + core.length);

  return (
    <span style={{ wordBreak: 'break-all' }}>
      <span style={{ opacity: 0.6 }}>{before}</span>
      <span style={{ color: '#69b1ff', fontWeight: 600 }}>{matched}</span>
      <span style={{ opacity: 0.6 }}>{after}</span>
    </span>
  );
}

const ActiveRules: React.FC = () => {
  const { message } = App.useApp();
  const appLauncher = getAppLauncher();
  const [currentTab, setCurrentTab] = useState<CurrentTabInfo | null>(null);
  const [activeRules, setActiveRules] = useState<ActiveRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedRowId, setCopiedRowId] = useState<string | number | null>(null);
  const [searchText, setSearchText] = useState('');
  const [filteredInfo, setFilteredInfo] = useState<Record<string, FilterValue | null>>({});
  const [sortedInfo, setSortedInfo] = useState<SorterResult<TableRecord>>({});

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

    // Listen for tracked URL changes pushed from the background
    // when the request monitor intercepts new requests.
    const handleRuntimeMessage = (msg: Record<string, unknown>) => {
      if (msg.type === 'trackedUrlsUpdated') {
        void fetchActiveRules();
      }
    };
    browserAPI.runtime.onMessage.addListener(handleRuntimeMessage);

    return () => {
      browserAPI.tabs.onUpdated.removeListener(handleTabUpdate);
      browserAPI.tabs.onActivated.removeListener(fetchActiveRules);
      browserAPI.storage.onChanged.removeListener(handleStorageChange);
      browserAPI.runtime.onMessage.removeListener(handleRuntimeMessage);
    };
  }, []);

  const filteredRules = searchText
    ? activeRules.filter((r) => {
        const q = searchText.toLowerCase();
        return (
          r.headerName.toLowerCase().includes(q) ||
          (r.headerValue || '').toLowerCase().includes(q) ||
          (r.domains || []).some((d) => d.toLowerCase().includes(q)) ||
          (r.tag || '').toLowerCase().includes(q) ||
          (r.matchedUrls || []).some((m) => m.url.toLowerCase().includes(q))
        );
      })
    : activeRules;

  const dataSource: TableRecord[] = filteredRules.map((rule, index) => ({
    ...rule,
    key: (rule.id || index) as string | number,
  }));

  const handleTableChange = (
    _pagination: unknown,
    filters: Record<string, FilterValue | null>,
    sorter: SorterResult<TableRecord> | SorterResult<TableRecord>[],
  ) => {
    setFilteredInfo(filters);
    setSortedInfo(Array.isArray(sorter) ? sorter[0] : sorter);
  };

  const columns: ColumnsType<TableRecord> = [
    {
      title: 'Header Name',
      dataIndex: 'headerName',
      key: 'headerName',
      width: 130,
      sorter: (a, b) => a.headerName.localeCompare(b.headerName),
      sortOrder: sortedInfo.columnKey === 'headerName' ? sortedInfo.order : null,
      filters: [...new Set(dataSource.map((item) => item.headerName))].map((name) => ({ text: name, value: name })),
      filteredValue: filteredInfo.headerName || null,
      filterSearch: true,
      onFilter: (value, record) => record.headerName === value,
      render: (text: string) => {
        const display = text.length > 16 ? `${text.substring(0, 9)}...${text.substring(text.length - 4)}` : text;
        return (
          <Tooltip title={text.length > 16 ? text : undefined}>
            <Text strong style={{ fontSize: '13px' }}>
              {display}
            </Text>
          </Tooltip>
        );
      },
    },
    {
      title: 'Value',
      dataIndex: 'headerValue',
      key: 'headerValue',
      width: 150,
      sorter: (a, b) => (a.headerValue || '').localeCompare(b.headerValue || ''),
      sortOrder: sortedInfo.columnKey === 'headerValue' ? sortedInfo.order : null,
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
      sorter: (a, b) => (a.domains || []).join(',').localeCompare((b.domains || []).join(',')),
      sortOrder: sortedInfo.columnKey === 'domains' ? sortedInfo.order : null,
      filters: [...new Set(dataSource.flatMap((item) => item.domains || []))].map((domain) => ({ text: domain, value: domain })),
      filteredValue: filteredInfo.domains || null,
      filterSearch: true,
      onFilter: (value, record) => (record.domains || []).includes(value as string),
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
      sorter: (a, b) => {
        const tagA = `${a.matchType}${a.tag ? `-${a.tag}` : ''}`;
        const tagB = `${b.matchType}${b.tag ? `-${b.tag}` : ''}`;
        return tagA.localeCompare(tagB);
      },
      sortOrder: sortedInfo.columnKey === 'tags' ? sortedInfo.order : null,
      filters: [
        ...new Set([
          'Page', 'Resource',
          ...dataSource.map((item) => (item.isResponse ? 'Response' : 'Request')),
          ...dataSource.filter((item) => item.tag).map((item) => item.tag as string),
        ]),
      ].map((tag) => ({ text: tag, value: tag })),
      filteredValue: filteredInfo.tags || null,
      filterSearch: true,
      onFilter: (value, record) => {
        const tags = [
          record.matchType === 'indirect' ? 'Resource' : 'Page',
          record.isResponse ? 'Response' : 'Request',
          ...(record.tag ? [record.tag] : []),
        ];
        return tags.includes(value as string);
      },
      render: (_: unknown, record: TableRecord) => {
        const tagStyle = { margin: 0, fontSize: '11px' };

        // Build tag descriptors ordered by display priority:
        // 1. Match type (Page or Resource)
        // 2. Custom tag (user-assigned, e.g. DEV)
        // 3. Req/Res — always present, least important
        const allTags: { label: string; color?: string; tooltip?: string }[] = [];
        if (record.matchType === 'indirect') {
          allTags.push({ label: 'Resource', tooltip: 'Applied to resources loaded by this page, not the page itself' });
        } else {
          allTags.push({ label: 'Page', tooltip: 'Matches this page directly' });
        }
        if (record.tag) {
          allTags.push({ label: record.tag, color: getTagColor(record.tag) });
        }
        allTags.push({ label: record.isResponse ? 'Res' : 'Req', tooltip: record.isResponse ? 'Response' : 'Request' });

        const hasStatusTag = allTags.length > 0 && (allTags[0].label === 'Resource' || allTags[0].label === 'Page');
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
      sorter: (a, b) => Number(b.isEnabled !== false) - Number(a.isEnabled !== false),
      sortOrder: sortedInfo.columnKey === 'isEnabled' ? sortedInfo.order : null,
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
                    void message.error('Failed to toggle rule');
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
      width: 70,
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
                    void message.success('Rule deleted');
                  } else {
                    void message.error('Failed to delete rule');
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

  // Auto-expand rules that match the search via their matched URLs
  const autoExpandedKeys = searchText
    ? filteredRules
        .filter((r) => (r.matchedUrls || []).some((m) => m.url.toLowerCase().includes(searchText.toLowerCase())))
        .map((r) => r.id || '')
        .filter(Boolean)
    : [];

  return (
    <div className="header-rules-section" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="table-toolbar">
        <div className="header-rules-title">
          <div>
            <Space align="center" size={8}>
              <Tooltip title={currentTab.domain.length > 30 ? currentTab.domain : undefined}>
                <Text style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {currentTab.domain.length > 30
                    ? `${currentTab.domain.substring(0, 20)}...${currentTab.domain.substring(currentTab.domain.length - 7)}`
                    : currentTab.domain}
                </Text>
              </Tooltip>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                {enabledCount} of {activeRules.length} active
              </Text>
              <Tooltip title="Monitoring requests and updating matched rules in real-time">
                <Badge status="processing" />
              </Tooltip>
            </Space>
            {indirectMatches > 0 && (
              <div>
                <Text type="secondary" style={{ fontSize: '11px' }}>
                  {directMatches} direct, {indirectMatches} via resources
                </Text>
              </div>
            )}
          </div>
          <div>
            <Input.Search
              placeholder="Search anything..."
              allowClear
              size="small"
              style={{ width: 300 }}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
            <div style={{ textAlign: 'right', marginTop: 2, height: 16 }}>
              {searchText && (() => {
                const matchedRequestCount = filteredRules.reduce(
                  (sum, r) => sum + (r.matchedUrls || []).filter((m) => m.url.toLowerCase().includes(searchText.toLowerCase())).length, 0,
                );
                return (
                  <Text type="secondary" style={{ fontSize: '11px' }}>
                    {filteredRules.length} rule{filteredRules.length !== 1 ? 's' : ''}, {matchedRequestCount} request{matchedRequestCount !== 1 ? 's' : ''} matched
                  </Text>
                );
              })()}
            </div>
          </div>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, paddingBottom: '8px' }}>
        <Table
          dataSource={dataSource}
          columns={columns}
          onChange={handleTableChange}
          pagination={{
            pageSize: 10,
            size: 'small',
            showSizeChanger: false,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total}`,
            style: { marginBottom: 0, marginTop: 4 },
          }}
          size="small"
          scroll={{ x: 770, y: 290 }}
          expandable={{
            columnWidth: 32,
            ...(searchText && autoExpandedKeys.length > 0 ? { expandedRowKeys: autoExpandedKeys } : {}),
            expandedRowRender: (record: TableRecord) => {
              const allMatches = record.matchedUrls || [];
              // Filter matched URLs when searching
              const matches = searchText
                ? allMatches.filter((m) => m.url.toLowerCase().includes(searchText.toLowerCase()))
                : allMatches;
              if (matches.length === 0) {
                return (
                  <Text type="secondary" style={{ fontSize: '12px', fontStyle: 'italic' }}>
                    {searchText ? 'No matched requests for this search' : 'No matched requests observed yet — reload the page to capture'}
                  </Text>
                );
              }

              // Reverse for newest-first (Map insertion order = chronological)
              const reversed = [...matches].reverse();
              const matchedData: MatchedRequestRecord[] = reversed.map((m, i) => ({
                ...m,
                key: `${record.id}-match-${i}`,
                type: m.url === currentTab?.url ? 'direct' as const : 'resource' as const,
              }));

              const matchedColumns: ColumnsType<MatchedRequestRecord> = [
                {
                  title: 'Time',
                  dataIndex: 'timestamp',
                  key: 'timestamp',
                  width: 100,
                  align: 'center',
                  sorter: (a, b) => a.timestamp - b.timestamp,
                  defaultSortOrder: 'descend',
                  render: (ts: number) => (
                    <Tooltip title={formatTimestampFull(ts)}>
                      <Text type="secondary" style={{ fontSize: '11px', fontFamily: 'monospace', cursor: 'default' }}>
                        {formatTimestampShort(ts)}
                      </Text>
                    </Tooltip>
                  ),
                },
                {
                  title: 'Request URL',
                  dataIndex: 'url',
                  key: 'url',
                  width: 380,
                  sorter: (a, b) => a.url.localeCompare(b.url),
                  render: (url: string, matchRecord: MatchedRequestRecord) => {
                    const display = url.length > 50 ? `${url.substring(0, 30)}...${url.substring(url.length - 15)}` : url;
                    return (
                        <div
                          className="value-cell"
                          style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', overflow: 'hidden' }}
                        >
                          <Tooltip
                            title={
                              <div style={{ fontSize: 12, fontFamily: 'monospace' }}>
                                <div style={{ marginBottom: 6 }}>
                                  {renderHighlightedUrl(matchRecord.url, matchRecord.pattern)}
                                </div>
                                <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ opacity: 0.5, fontSize: 11 }}>matched by</span>
                                  <span style={{ color: '#69b1ff', fontSize: 11 }}>{matchRecord.pattern}</span>
                                </div>
                              </div>
                            }
                            styles={{ root: { maxWidth: 500 } }}
                          >
                            <Text style={{ fontSize: '12px', fontFamily: 'monospace', cursor: 'default', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {display}
                            </Text>
                          </Tooltip>
                          <span style={{ flex: 1 }} />
                          {copiedRowId === matchRecord.key ? (
                            <CheckOutlined
                              className="value-copy-icon"
                              style={{ fontSize: '11px', color: '#52c41a', flexShrink: 0, opacity: 1 }}
                            />
                          ) : (
                            <CopyTwoTone
                              className="value-copy-icon"
                              style={{ fontSize: '11px', cursor: 'pointer', flexShrink: 0, opacity: 0 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                void navigator.clipboard.writeText(url);
                                setCopiedRowId(matchRecord.key);
                                setTimeout(() => setCopiedRowId(null), 1000);
                              }}
                            />
                          )}
                        </div>
                    );
                  },
                },
                {
                  title: 'Type',
                  dataIndex: 'type',
                  key: 'type',
                  width: 80,
                  align: 'center',
                  sorter: (a, b) => a.type.localeCompare(b.type),
                  render: (type: string) => (
                    <Tag variant="outlined" style={{ margin: 0, fontSize: '11px' }}>
                      {type === 'direct' ? 'Page' : 'Resource'}
                    </Tag>
                  ),
                },
                {
                  title: 'Pattern',
                  dataIndex: 'pattern',
                  key: 'pattern',
                  width: 140,
                  sorter: (a, b) => a.pattern.localeCompare(b.pattern),
                  render: (pattern: string) => (
                    <Tooltip title={pattern}>
                      <Tag variant="outlined" style={{ margin: 0, fontSize: '11px' }}>
                        {pattern.length > 18 ? `${pattern.substring(0, 10)}...${pattern.substring(pattern.length - 5)}` : pattern}
                      </Tag>
                    </Tooltip>
                  ),
                },
              ];

              return (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Text type="secondary" style={{ fontSize: '11px' }}>
                      {matches.length} request{matches.length !== 1 ? 's' : ''} matched
                    </Text>
                    <Badge status="processing" />
                  </div>
                  <Table<MatchedRequestRecord>
                    columns={matchedColumns}
                    dataSource={matchedData}
                    pagination={false}
                    size="small"
                    scroll={matches.length > 3 ? { y: 120 } : undefined}
                    showHeader={matches.length > 1}
                  />
                </div>
              );
            },
            rowExpandable: () => true,
          }}
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
