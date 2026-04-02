import {
  CheckOutlined,
  CopyTwoTone,
  DeleteOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { useHeader } from '@hooks/useHeader';
import { getAppLauncher } from '@utils/app-launcher';
import {
  Alert,
  App,
  Badge,
  Button,
  Empty,
  Input,
  Popconfirm,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { FilterValue, SorterResult } from 'antd/es/table/interface';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRowActionRegistration } from '@/hooks/useRowActionRegistration';
import { useTablePagination } from '@/hooks/useTablePagination';
import { useKeyboardNav } from '@context/KeyboardNavContext';
import { type PageInfo, type RowActions, getTagColor } from '../utils/table-shared';
import { type TagDescriptor, renderDomainTags, renderTagOverflow, renderValueWithCopy, truncateValue } from './columns/sharedColumnRenderers';
import DeleteConfirmOverlay from './DeleteConfirmOverlay';

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
  return (
    <>
      {h}:{m}:{s}
      <span style={{ fontSize: '9px', opacity: 0.6 }}>.{ms}</span>
    </>
  );
}

function formatTimestampFull(timestamp: number): React.ReactNode {
  const d = new Date(timestamp);
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const day = d.getDate();
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return (
    <>
      {day} {month} {year} {h}:{m}:{s}
      <span style={{ fontSize: '9px', opacity: 0.6 }}>.{ms}</span>
    </>
  );
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

interface ActiveRulesProps {
  focusedRowIndex?: number;
  pendingDeleteIndex?: number;
  onPageInfoChange?: (info: PageInfo) => void;
  onRowActionsChange?: (actions: RowActions) => void;
}

const ActiveRules: React.FC<ActiveRulesProps> = ({
  focusedRowIndex = -1,
  pendingDeleteIndex = -1,
  onPageInfoChange,
  onRowActionsChange,
}) => {
  const { message } = App.useApp();
  const { isConnected, disabledTagGroups } = useHeader();
  const appLauncher = getAppLauncher();
  const { expandedRowKey, setNestedRowCount, toggleExpandedRow, setFocusedRowIndex } = useKeyboardNav();
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

  const dataSourceRef = useRef<TableRecord[]>([]);

  // Track how each rule matches the search: by rule properties, by URL, or both
  const urlMatchCountMap = new Map<string, number>();
  const filteredRules = searchText
    ? activeRules.filter((r) => {
        const q = searchText.toLowerCase();
        const matchesByRule =
          r.headerName.toLowerCase().includes(q) ||
          (r.headerValue || '').toLowerCase().includes(q) ||
          (r.tag || '').toLowerCase().includes(q);
        const matchingUrlCount = (r.matchedUrls || []).filter((m) => m.url.toLowerCase().includes(q)).length;
        if (matchingUrlCount > 0 && r.id) urlMatchCountMap.set(r.id, matchingUrlCount);
        return matchesByRule || matchingUrlCount > 0;
      })
    : activeRules;

  // Sort: rules with URL matches first (most relevant), then by name
  const sortedFilteredRules = searchText
    ? [...filteredRules].sort((a, b) => {
        const aUrlMatches = urlMatchCountMap.get(a.id || '') || 0;
        const bUrlMatches = urlMatchCountMap.get(b.id || '') || 0;
        if (aUrlMatches > 0 && bUrlMatches === 0) return -1;
        if (aUrlMatches === 0 && bUrlMatches > 0) return 1;
        return 0;
      })
    : filteredRules;

  const dataSource: TableRecord[] = sortedFilteredRules.map((rule, index) => ({
    ...rule,
    key: (rule.id || index) as string | number,
  }));

  // Keep ref in sync for keyboard callbacks
  dataSourceRef.current = dataSource;

  const { paginationConfig } = useTablePagination({
    dataSource,
    onPageInfoChange,
  });

  // Register row actions for keyboard navigation
  const handleToggleRow = useCallback((index: number) => {
    const record = dataSourceRef.current[index];
    if (!record) return;
    const isEnabled = record.isEnabled !== false;
    setActiveRules((prev) => prev.map((r) => (r.id === record.id ? { ...r, isEnabled: !isEnabled } : r)));
    const bApi = typeof browser !== 'undefined' ? browser : chrome;
    bApi.runtime.sendMessage({ type: 'toggleRule', ruleId: record.id, enabled: !isEnabled }, (response: unknown) => {
      const resp = response as { success?: boolean } | undefined;
      if (resp?.success) {
        bApi.runtime.sendMessage({ type: 'rulesUpdated' });
      } else {
        setActiveRules((prev) => prev.map((r) => (r.id === record.id ? { ...r, isEnabled } : r)));
      }
    });
  }, []);

  const handleEditRow = useCallback(
    (index: number) => {
      const record = dataSourceRef.current[index];
      if (!record) return;
      void appLauncher.launchOrFocus({ tab: 'rules', subTab: 'headers', action: 'edit', itemId: record.id });
      void message.info('Opening edit dialog in OpenHeaders app');
    },
    [appLauncher, message],
  );

  const handleCopyRow = useCallback((index: number) => {
    const record = dataSourceRef.current[index];
    if (!record?.headerValue) return;
    void navigator.clipboard.writeText(record.headerValue);
    setCopiedRowId(record.key);
    setTimeout(() => setCopiedRowId(null), 1000);
  }, []);

  const handleDeleteRow = useCallback(
    (index: number) => {
      const record = dataSourceRef.current[index];
      if (!record) return;
      setActiveRules((prev) => prev.filter((r) => r.id !== record.id));
      const bApi = typeof browser !== 'undefined' ? browser : chrome;
      bApi.runtime.sendMessage({ type: 'deleteRule', ruleId: record.id }, (response: unknown) => {
        const resp = response as { success?: boolean } | undefined;
        if (resp?.success) {
          void message.success('Rule deleted');
        } else {
          void message.error('Failed to delete rule');
        }
      });
    },
    [message],
  );

  useRowActionRegistration(onRowActionsChange, {
    onToggleRow: handleToggleRow,
    onEditRow: handleEditRow,
    onCopyRow: handleCopyRow,
    onDeleteRow: handleDeleteRow,
  });

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
        const display = truncateValue(text);
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
        const displayValue = fullValue ? truncateValue(fullValue) : '[Dynamic]';
        return renderValueWithCopy({ fullValue, displayValue, rowKey: record.key, copiedRowId, setCopiedRowId });
      },
    },
    {
      title: 'Domains',
      dataIndex: 'domains',
      key: 'domains',
      width: 160,
      sorter: (a, b) => (a.domains || []).join(',').localeCompare((b.domains || []).join(',')),
      sortOrder: sortedInfo.columnKey === 'domains' ? sortedInfo.order : null,
      filters: [...new Set(dataSource.flatMap((item) => item.domains || []))].map((domain) => ({
        text: domain,
        value: domain,
      })),
      filteredValue: filteredInfo.domains || null,
      filterSearch: true,
      onFilter: (value, record) => (record.domains || []).includes(value as string),
      render: (domains: string[]) => renderDomainTags(domains),
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
          'Page',
          'Resource',
          ...dataSource.map((item) => (item.isResponse ? 'Response' : 'Request')),
          ...dataSource.filter((item) => item.tag).map((item) => item.tag as string),
          ...dataSource.filter((item) => disabledTagGroups.has(item.tag || '__no_tag__')).map(() => 'Paused'),
        ]),
      ].map((tag) => ({ text: tag, value: tag })),
      filteredValue: filteredInfo.tags || null,
      filterSearch: true,
      onFilter: (value, record) => {
        const urls = record.matchedUrls || [];
        const hasDirectMatch = urls.some((m) => m.url === currentTab?.url) || record.matchType === 'direct';
        const hasIndirectMatch = urls.some((m) => m.url !== currentTab?.url) || record.matchType === 'indirect';
        const tags = [
          ...(hasDirectMatch ? ['Page'] : []),
          ...(hasIndirectMatch ? ['Resource'] : []),
          record.isResponse ? 'Response' : 'Request',
          ...(record.tag ? [record.tag] : []),
          ...(disabledTagGroups.has(record.tag || '__no_tag__') ? ['Paused'] : []),
        ];
        return tags.includes(value as string);
      },
      render: (_: unknown, record: TableRecord) => {
        const allTags: TagDescriptor[] = [];
        const tagGroup = record.tag || '__no_tag__';
        if (disabledTagGroups.has(tagGroup)) {
          allTags.push({
            label: 'Paused',
            color: 'warning',
            tooltip: `Tag group "${record.tag || 'Untagged'}" is paused — rule not injected`,
          });
        }
        // Derive Page/Resource from actual matched URLs, not just matchType
        const urls = record.matchedUrls || [];
        const hasDirectMatch = urls.some((m) => m.url === currentTab?.url) || record.matchType === 'direct';
        const hasIndirectMatch = urls.some((m) => m.url !== currentTab?.url) || record.matchType === 'indirect';
        if (hasDirectMatch) {
          allTags.push({ label: 'Page', tooltip: 'Matches this page directly' });
        }
        if (hasIndirectMatch) {
          allTags.push({ label: 'Resource', tooltip: 'Applied to resources loaded by this page' });
        }
        if (record.tag) {
          allTags.push({ label: record.tag, color: getTagColor(record.tag) });
        }
        allTags.push({ label: record.isResponse ? 'Res' : 'Req', tooltip: record.isResponse ? 'Response' : 'Request' });
        const hasStatusTag = allTags[0]?.label === 'Paused' || allTags[0]?.label === 'Page' || allTags[0]?.label === 'Resource';
        return renderTagOverflow(allTags, hasStatusTag ? 1 : 2);
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
        const groupPaused = disabledTagGroups.has(record.tag || '__no_tag__');
        const tooltip = !isConnected
          ? 'App not connected'
          : groupPaused && isEnabled
            ? 'Enabled but tag group is paused — not being injected'
            : 'Enable/disable rule';
        return (
          <Tooltip title={tooltip}>
            <Switch
              checked={isEnabled}
              disabled={!isConnected}
              onChange={() => {
                setActiveRules((prev) => prev.map((r) => (r.id === record.id ? { ...r, isEnabled: !isEnabled } : r)));
                const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
                browserAPI.runtime.sendMessage(
                  { type: 'toggleRule', ruleId: record.id, enabled: !isEnabled },
                  (response: unknown) => {
                    const resp = response as { success?: boolean } | undefined;
                    if (resp?.success) {
                      browserAPI.runtime.sendMessage({ type: 'rulesUpdated' });
                    } else {
                      setActiveRules((prev) => prev.map((r) => (r.id === record.id ? { ...r, isEnabled } : r)));
                      void message.error('Failed to toggle rule');
                    }
                  },
                );
              }}
              size="small"
            />
          </Tooltip>
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
        <Tooltip title={!isConnected ? 'App not connected' : 'Edit or delete rule'}>
          <Space size={2}>
            <Button
              type="text"
              icon={<EditOutlined />}
              size="small"
              disabled={!isConnected}
              onClick={async () => {
                await appLauncher.launchOrFocus({ tab: 'rules', subTab: 'headers', action: 'edit', itemId: record.id });
                void message.info('Opening edit dialog in OpenHeaders app');
              }}
            />
            <Popconfirm
              title="Delete rule"
              description={`Delete "${record.headerName}"?`}
              onConfirm={() => {
                setActiveRules((prev) => prev.filter((r) => r.id !== record.id));
                const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
                browserAPI.runtime.sendMessage({ type: 'deleteRule', ruleId: record.id }, (response: unknown) => {
                  const resp = response as { success?: boolean } | undefined;
                  if (resp?.success) {
                    void message.success('Rule deleted');
                  } else {
                    void message.error('Failed to delete rule');
                  }
                });
              }}
              okText="Delete"
              okType="danger"
              cancelText="Cancel"
              disabled={!isConnected}
            >
              <Button type="text" danger icon={<DeleteOutlined />} size="small" disabled={!isConnected} />
            </Popconfirm>
          </Space>
        </Tooltip>
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
                {enabledCount} of {activeRules.length} enabled
              </Text>
            </Space>
            {(() => {
              const pausedCount = activeRules.filter((r) => disabledTagGroups.has(r.tag || '__no_tag__')).length;
              return pausedCount > 0 ? (
                <div>
                  <Text type="warning" style={{ fontSize: '11px' }}>
                    {pausedCount} rule{pausedCount !== 1 ? 's' : ''} paused by tag group
                  </Text>
                </div>
              ) : null;
            })()}
          </div>
          <Space align="start">
            <Space align="center" size={6} style={{ height: 24 }}>
              <Badge status="processing" />
              <Text type="secondary" style={{ fontSize: '12px' }}>
                Live — monitoring requests
              </Text>
            </Space>
            <div>
              <Input.Search
                placeholder="Search anything..."
                allowClear
                size="small"
                style={{ width: 300 }}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && searchText) {
                  e.stopPropagation();
                  setSearchText('');
                }
              }}
              />
              <div style={{ textAlign: 'right', marginTop: 2 }}>
                <Text type="secondary" style={{ fontSize: '11px' }}>
                  {(() => {
                    const totalRequests = activeRules.reduce((sum, r) => sum + (r.matchedUrls || []).length, 0);
                    if (!searchText) {
                      return `${activeRules.length} rule${activeRules.length !== 1 ? 's' : ''}, ${totalRequests} request${totalRequests !== 1 ? 's' : ''}`;
                    }
                    const filteredRequests = urlMatchCountMap.size > 0
                      ? Array.from(urlMatchCountMap.values()).reduce((sum, c) => sum + c, 0)
                      : 0;
                    return filteredRequests > 0
                      ? `${sortedFilteredRules.length} rule${sortedFilteredRules.length !== 1 ? 's' : ''}, ${filteredRequests} request${filteredRequests !== 1 ? 's' : ''} matched`
                      : `${sortedFilteredRules.length} rule${sortedFilteredRules.length !== 1 ? 's' : ''} matched`;
                  })()}
                </Text>
              </div>
            </div>
          </Space>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, paddingBottom: '8px' }}>
        <Table
          dataSource={dataSource}
          columns={columns}
          onChange={handleTableChange}
          pagination={paginationConfig}
          size="small"
          scroll={{ x: 770, y: 290 }}
          onRow={(_record: TableRecord, index) => ({
            onClick: () => { if (index !== undefined) { setFocusedRowIndex(index); (document.activeElement as HTMLElement)?.blur(); } },
          })}
          rowClassName={(record: TableRecord, index: number) => {
            const classes: string[] = [];
            if (disabledTagGroups.has(record.tag || '__no_tag__')) classes.push('row-group-paused');
            if (index === focusedRowIndex) classes.push('keyboard-focused-row');
            if (index === pendingDeleteIndex) classes.push('keyboard-pending-delete-row');
            return classes.join(' ');
          }}
          expandable={{
            columnWidth: 40,
            expandRowByClick: true,
            expandedRowKeys: expandedRowKey !== null ? [expandedRowKey] : [],
            expandIcon: ({ record, onExpand }) => {
              const totalRequests = (record.matchedUrls || []).length;
              const searchUrlMatches = searchText && record.id ? (urlMatchCountMap.get(record.id) || 0) : 0;
              const badgeCount = searchText ? searchUrlMatches : totalRequests;
              const bgColor = searchUrlMatches > 0 ? '#1677ff' : '#8c8c8c';
              const badgeTooltip = searchUrlMatches > 0
                ? `${searchUrlMatches} of ${totalRequests} request${totalRequests !== 1 ? 's' : ''} match "${searchText}" — click to expand`
                : badgeCount > 0
                  ? `${badgeCount} matched request${badgeCount !== 1 ? 's' : ''} — click to expand`
                  : 'No matched requests yet — click to expand';
              return (
                <Tooltip title={badgeTooltip}>
                <span
                  style={{
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: 20,
                    height: 18,
                    padding: '0 5px',
                    borderRadius: 5,
                    backgroundColor: badgeCount > 0 ? bgColor : '#d9d9d9',
                    color: '#fff',
                    fontSize: '11px',
                    fontWeight: 600,
                    lineHeight: 1,
                  }}
                  onClick={(e) => onExpand(record, e)}
                >
                  {badgeCount}
                </span>
                </Tooltip>
              );
            },
            onExpand: (_expanded: boolean, record: TableRecord) => {
              const fullIndex = dataSource.findIndex((r) => r.key === record.key);
              const pageStart = (paginationConfig.current - 1) * paginationConfig.pageSize;
              const pageRelativeIndex = fullIndex - pageStart;
              toggleExpandedRow(record.key, pageRelativeIndex >= 0 ? pageRelativeIndex : undefined);
              (document.activeElement as HTMLElement)?.blur();
            },
            expandedRowRender: (record: TableRecord) => {
              const allMatches = record.matchedUrls || [];
              // If this rule has URL matches for the search, filter to those URLs.
              // If the rule matched only by properties (name/value/domain/tag), show all URLs.
              const hasUrlMatches = searchText && record.id ? urlMatchCountMap.has(record.id) : false;
              const matches = hasUrlMatches
                ? allMatches.filter((m) => m.url.toLowerCase().includes(searchText.toLowerCase()))
                : allMatches;

              // Report nested row count to keyboard nav when this is the keyboard-expanded row
              if (record.key === expandedRowKey) {
                queueMicrotask(() => setNestedRowCount(matches.length));
              }

              if (matches.length === 0) {
                return (
                  <Text type="secondary" style={{ fontSize: '12px', fontStyle: 'italic' }}>
                    No matched requests yet — reload the page to capture
                  </Text>
                );
              }

              // Reverse for newest-first (Map insertion order = chronological)
              const reversed = [...matches].reverse();
              const matchedData: MatchedRequestRecord[] = reversed.map((m, i) => ({
                ...m,
                key: `${record.id}-match-${i}`,
                type: m.url === currentTab?.url ? ('direct' as const) : ('resource' as const),
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
                    const display =
                      url.length > 50 ? `${url.substring(0, 30)}...${url.substring(url.length - 15)}` : url;
                    return (
                      <div
                        className="value-cell"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                        }}
                      >
                        <Tooltip
                          title={
                            <div style={{ fontSize: 12, fontFamily: 'monospace' }}>
                              <div style={{ marginBottom: 6 }}>
                                {renderHighlightedUrl(matchRecord.url, matchRecord.pattern)}
                              </div>
                              <div
                                style={{
                                  borderTop: '1px solid rgba(255,255,255,0.15)',
                                  paddingTop: 4,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 6,
                                }}
                              >
                                <span style={{ opacity: 0.5, fontSize: 11 }}>matched by</span>
                                <span style={{ color: '#69b1ff', fontSize: 11 }}>{matchRecord.pattern}</span>
                              </div>
                            </div>
                          }
                          styles={{ root: { maxWidth: 500 } }}
                        >
                          <Text
                            style={{
                              fontSize: '12px',
                              fontFamily: 'monospace',
                              cursor: 'default',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
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
                        {pattern.length > 18
                          ? `${pattern.substring(0, 10)}...${pattern.substring(pattern.length - 5)}`
                          : pattern}
                      </Tag>
                    </Tooltip>
                  ),
                },
              ];

              return (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Text type="secondary" style={{ fontSize: '11px' }}>
                      {hasUrlMatches
                        ? `${matches.length} of ${allMatches.length} request${allMatches.length !== 1 ? 's' : ''} matching "${searchText}"`
                        : `${matches.length} request${matches.length !== 1 ? 's' : ''} matched`}
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
                    <Text type="secondary">No rules match this page</Text>
                    <Text type="secondary" style={{ fontSize: '11px' }}>
                      No rules are configured for this domain
                    </Text>
                  </Space>
                }
                style={{ padding: '24px 0' }}
              />
            ),
          }}
          className="header-rules-table"
        />
        <DeleteConfirmOverlay
          pendingDeleteIndex={pendingDeleteIndex}
          itemName={dataSource[pendingDeleteIndex]?.headerName ?? ''}
        />
      </div>
    </div>
  );
};

export default ActiveRules;
