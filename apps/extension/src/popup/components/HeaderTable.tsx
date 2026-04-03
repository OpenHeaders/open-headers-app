import {
  ApiOutlined,
  CodeOutlined,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  FileTextOutlined,
  LinkOutlined,
  MoreOutlined,
  PlusOutlined,
  SendOutlined,
  StopOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import type { DynamicSource, HeaderEntry } from '@context/HeaderContext';
import { useKeyboardNav } from '@context/KeyboardNavContext';
import { useHeader } from '@hooks/useHeader';
import { getAppLauncher } from '@utils/app-launcher';
import { App, Button, Dropdown, Empty, Input, Popconfirm, Space, Switch, Table, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { FilterValue, SorterResult } from 'antd/es/table/interface';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRowActionRegistration } from '@/hooks/useRowActionRegistration';
import { useTablePagination } from '@/hooks/useTablePagination';
import { getTagColor, type PageInfo, type RowActions } from '../utils/table-shared';
import {
  renderDomainTags,
  renderTagOverflow,
  renderValueWithCopy,
  type TagDescriptor,
  truncateValue,
} from './columns/sharedColumnRenderers';
import DeleteConfirmOverlay from './DeleteConfirmOverlay';

const { Search } = Input;
const { Text } = Typography;

type PlaceholderType = 'source_not_found' | 'empty_source' | 'empty_value' | null;

interface TableRecord {
  key: string;
  id: string;
  headerName: string;
  headerValue: string;
  domains: string[];
  isDynamic: boolean | undefined;
  sourceId: string | number | null | undefined;
  prefix: string;
  suffix: string;
  isResponse: boolean | undefined;
  isEnabled: boolean;
  sourceInfo: string;
  sourceTag: string;
  placeholderType: PlaceholderType;
  actualValue: string;
  tag: string;
  isCachedValue: boolean;
}

interface DynamicValueInfo {
  sourceInfo: string;
  sourceTag: string;
  placeholderType: PlaceholderType;
  actualValue: string;
  isCachedValue: boolean;
}

interface HeaderTableProps {
  focusedRowIndex?: number;
  pendingDeleteIndex?: number;
  onPageInfoChange?: (info: PageInfo) => void;
  onRowActionsChange?: (actions: RowActions) => void;
}

const HeaderTable: React.FC<HeaderTableProps> = ({
  focusedRowIndex = -1,
  pendingDeleteIndex = -1,
  onPageInfoChange,
  onRowActionsChange,
}) => {
  const { message } = App.useApp();
  const appLauncher = getAppLauncher();

  const { headerEntries, dynamicSources, isConnected, uiState, updateUiState, disabledTagGroups } = useHeader();
  const { setFocusedRowIndex } = useKeyboardNav();

  const [copiedRowId, setCopiedRowId] = useState<string | number | null>(null);
  const [searchText, setSearchText] = useState(uiState?.tableState?.searchText || '');
  const [filteredInfo, setFilteredInfo] = useState<Record<string, FilterValue | null>>(
    (uiState?.tableState?.filteredInfo as Record<string, FilterValue | null>) || {},
  );
  const [sortedInfo, setSortedInfo] = useState<SorterResult<TableRecord>>(
    (uiState?.tableState?.sortedInfo as SorterResult<TableRecord>) || {},
  );

  useEffect(() => {
    if (uiState?.tableState) {
      setSearchText((uiState.tableState.searchText as string) || '');
      setFilteredInfo((uiState.tableState.filteredInfo as Record<string, FilterValue | null>) || {});
      setSortedInfo((uiState.tableState.sortedInfo as SorterResult<TableRecord>) || {});
    }
  }, [uiState?.tableState]);

  function getDynamicValueInfo(entry: HeaderEntry, sources: DynamicSource[], connected: boolean): DynamicValueInfo {
    if (!entry.isDynamic || !entry.sourceId) {
      if (!entry.headerValue?.trim()) {
        return { sourceInfo: '', sourceTag: '', placeholderType: 'empty_value', actualValue: '', isCachedValue: false };
      }
      return {
        sourceInfo: '',
        sourceTag: '',
        placeholderType: null,
        actualValue: entry.headerValue,
        isCachedValue: false,
      };
    }

    const source = sources.find(
      (s) =>
        s.sourceId?.toString() === entry.sourceId?.toString() ||
        s.locationId?.toString() === entry.sourceId?.toString(),
    );

    const sourceTag = source ? source.sourceTag || source.locationTag || '' : '';
    const sourcePath = source
      ? source.sourcePath || source.locationPath || source.sourceUrl || source.locationUrl || ''
      : '';
    const sourceType = source ? source.sourceType || source.locationType || '' : '';
    const displayPath =
      sourceType.toLowerCase().includes('env') && sourcePath && !sourcePath.startsWith('$')
        ? `$${sourcePath}`
        : sourcePath;
    const sourceInfo = displayPath || `Source #${entry.sourceId}`;
    const content = source ? source.sourceContent || source.locationContent || '' : '';
    const actualValue = content ? `${entry.prefix || ''}${content}${entry.suffix || ''}` : '';

    if (!source) {
      return { sourceInfo, sourceTag, placeholderType: 'source_not_found', actualValue: '', isCachedValue: false };
    }

    if (!content) {
      return { sourceInfo, sourceTag, placeholderType: 'empty_source', actualValue: '', isCachedValue: false };
    }

    return { sourceInfo, sourceTag, placeholderType: null, actualValue, isCachedValue: !connected };
  }

  const dataSource: TableRecord[] = Object.entries(headerEntries).map(([id, entry]) => {
    const dynamicInfo = getDynamicValueInfo(entry, dynamicSources, isConnected);
    return {
      key: id,
      id,
      headerName: entry.headerName,
      headerValue: entry.headerValue,
      domains: entry.domains || [],
      isDynamic: entry.isDynamic,
      sourceId: entry.sourceId,
      prefix: entry.prefix || '',
      suffix: entry.suffix || '',
      isResponse: entry.isResponse,
      isEnabled: entry.isEnabled !== false,
      sourceInfo: dynamicInfo.sourceInfo,
      sourceTag: dynamicInfo.sourceTag,
      placeholderType: dynamicInfo.placeholderType,
      actualValue: dynamicInfo.actualValue,
      isCachedValue: dynamicInfo.isCachedValue,
      tag: entry.tag || '',
    };
  });

  const dataSourceRef = useRef<TableRecord[]>([]);

  const filteredData = dataSource.filter(
    (item) =>
      item.headerName.toLowerCase().includes(searchText.toLowerCase()) ||
      item.domains.some((domain) => domain.toLowerCase().includes(searchText.toLowerCase())) ||
      item.actualValue.toLowerCase().includes(searchText.toLowerCase()) ||
      item.tag.toLowerCase().includes(searchText.toLowerCase()),
  );

  // Keep ref in sync for keyboard callbacks
  dataSourceRef.current = filteredData;

  const enabledCount = dataSource.filter((item) => item.isEnabled).length;
  const injectingCount = dataSource.filter((item) => item.isEnabled && !item.placeholderType).length;
  const pausedCount = dataSource.filter(
    (item) => item.isEnabled && disabledTagGroups.has(item.tag || '__no_tag__'),
  ).length;
  const totalCount = dataSource.length;

  const { paginationConfig } = useTablePagination({
    dataSource: filteredData,
    onPageInfoChange,
  });

  // Register row actions for keyboard navigation
  const handleToggleRow = useCallback(
    async (index: number) => {
      const record = dataSourceRef.current[index];
      if (!record || !isConnected) return;
      const { runtime } = await import('../../utils/browser-api');
      runtime.sendMessage(
        { type: 'toggleRule', ruleId: record.id, enabled: !record.isEnabled },
        (response: unknown) => {
          const resp = response as { success?: boolean } | undefined;
          if (!resp?.success) {
            message.error('Failed to toggle rule');
          }
        },
      );
    },
    [isConnected, message],
  );

  const handleEditRow = useCallback(
    async (index: number) => {
      const record = dataSourceRef.current[index];
      if (!record || !isConnected) return;
      await appLauncher.launchOrFocus({ tab: 'rules', subTab: 'headers', action: 'edit', itemId: record.id });
      message.info('Opening edit dialog in OpenHeaders app');
    },
    [isConnected, appLauncher, message],
  );

  const handleCopyRow = useCallback((index: number) => {
    const record = dataSourceRef.current[index];
    if (!record?.actualValue) return;
    void navigator.clipboard.writeText(record.actualValue);
    setCopiedRowId(record.id);
    setTimeout(() => setCopiedRowId(null), 1000);
  }, []);

  const handleDeleteRow = useCallback(
    async (index: number) => {
      const record = dataSourceRef.current[index];
      if (!record || !isConnected) return;
      const { runtime } = await import('../../utils/browser-api');
      runtime.sendMessage({ type: 'deleteRule', ruleId: record.id }, (response: unknown) => {
        const resp = response as { success?: boolean } | undefined;
        if (resp?.success) {
          message.success('Rule deleted');
        } else {
          message.error('Failed to delete rule');
        }
      });
    },
    [isConnected, message],
  );

  const handleAddRule = useCallback(() => {
    const btn = document.querySelector('.add-rule-button') as HTMLButtonElement | null;
    if (!btn) return;
    btn.click();
    // Dropdown renders async — focus the first menu item so arrow keys work
    const tryFocus = (attempts: number) => {
      const firstItem = document.querySelector(
        '.ant-dropdown:not(.ant-dropdown-hidden) .ant-dropdown-menu-item:not(.ant-dropdown-menu-item-disabled)',
      ) as HTMLElement | null;
      if (firstItem) {
        firstItem.focus();
      } else if (attempts > 0) {
        requestAnimationFrame(() => tryFocus(attempts - 1));
      }
    };
    requestAnimationFrame(() => tryFocus(5));
  }, []);

  useRowActionRegistration(onRowActionsChange, {
    onToggleRow: handleToggleRow,
    onEditRow: handleEditRow,
    onCopyRow: handleCopyRow,
    onDeleteRow: handleDeleteRow,
    onAddRule: handleAddRule,
  });

  const handleChange = (
    _pagination: unknown,
    filters: Record<string, FilterValue | null>,
    sorter: SorterResult<TableRecord> | SorterResult<TableRecord>[],
  ) => {
    setFilteredInfo(filters);
    const singleSorter = Array.isArray(sorter) ? sorter[0] : sorter;
    setSortedInfo(singleSorter);
    if (updateUiState) {
      updateUiState({
        tableState: {
          searchText,
          filteredInfo: filters,
          sortedInfo: singleSorter as unknown as Record<string, unknown>,
        },
      });
    }
  };

  const handleSearchChange = (value: string) => {
    setSearchText(value);
    if (updateUiState) {
      updateUiState({
        tableState: { searchText: value, filteredInfo, sortedInfo: sortedInfo as unknown as Record<string, unknown> },
      });
    }
  };

  const clearAll = () => {
    setSearchText('');
    setFilteredInfo({});
    setSortedInfo({});
    if (updateUiState) {
      updateUiState({
        tableState: { searchText: '', filteredInfo: {}, sortedInfo: {} as unknown as Record<string, unknown> },
      });
    }
  };

  function getPlaceholderTooltip(type: PlaceholderType, sourceId?: string | number | null): string {
    switch (type) {
      case 'source_not_found':
        return `Not injecting — source #${sourceId} was deleted. Recreate to resume.`;
      case 'empty_source':
        return `Not injecting — source #${sourceId} is empty. Will resume when it has content.`;
      case 'empty_value':
        return 'Not injecting — header value is empty. Set a value to activate.';
      default:
        return '';
    }
  }

  const columns: ColumnsType<TableRecord> = [
    {
      title: 'Header Name',
      dataIndex: 'headerName',
      key: 'headerName',
      width: 160,
      fixed: 'left',
      sorter: (a, b) => a.headerName.localeCompare(b.headerName),
      filters: [...new Set(dataSource.map((item) => item.headerName))].map((name) => ({ text: name, value: name })),
      filteredValue: filteredInfo.headerName || null,
      filterSearch: true,
      onFilter: (value, record) => record.headerName === value,
      sortOrder: sortedInfo.columnKey === 'headerName' ? sortedInfo.order : null,
      render: (text: string, record: TableRecord) => {
        const hasPlaceholder = record.placeholderType && record.isEnabled;
        const tooltipMessage = hasPlaceholder ? getPlaceholderTooltip(record.placeholderType, record.sourceId) : '';
        return (
          <Space align="center">
            <Text strong style={{ fontSize: '13px' }}>
              {text}
            </Text>
            {hasPlaceholder && (
              <Tooltip title={tooltipMessage}>
                <ExclamationCircleOutlined style={{ color: '#ff4d4f', fontSize: '12px' }} />
              </Tooltip>
            )}
          </Space>
        );
      },
    },
    {
      title: 'Value',
      dataIndex: 'actualValue',
      key: 'actualValue',
      width: 150,
      sorter: (a, b) => (a.actualValue || '').localeCompare(b.actualValue || ''),
      sortOrder: sortedInfo.columnKey === 'actualValue' ? sortedInfo.order : null,
      render: (text: string, record: TableRecord) => {
        const fullValue = text || '';
        return renderValueWithCopy({
          fullValue,
          displayValue: truncateValue(fullValue),
          rowKey: record.id,
          copiedRowId,
          setCopiedRowId,
          opacity: record.isEnabled ? 1 : 0.5,
        });
      },
    },
    {
      title: 'Domains',
      dataIndex: 'domains',
      key: 'domains',
      width: 160,
      sorter: (a, b) => a.domains.join(',').localeCompare(b.domains.join(',')),
      filters: [...new Set(dataSource.flatMap((item) => item.domains))].map((domain) => ({
        text: domain,
        value: domain,
      })),
      filteredValue: filteredInfo.domains || null,
      filterSearch: true,
      onFilter: (value, record) => record.domains.includes(value as string),
      sortOrder: sortedInfo.columnKey === 'domains' ? sortedInfo.order : null,
      render: (domains: string[]) => renderDomainTags(domains, false),
    },
    {
      title: 'Tags',
      key: 'tags',
      width: 130,
      align: 'center',
      sorter: (a, b) => {
        const tagA = `${a.isResponse ? 'Response' : 'Request'}${a.tag ? `-${a.tag}` : ''}`;
        const tagB = `${b.isResponse ? 'Response' : 'Request'}${b.tag ? `-${b.tag}` : ''}`;
        return tagA.localeCompare(tagB);
      },
      filters: [
        ...new Set([
          ...dataSource.map((item) => (item.isResponse ? 'Response' : 'Request')),
          ...dataSource.filter((item) => item.tag).map((item) => item.tag),
          ...dataSource.filter((item) => disabledTagGroups.has(item.tag || '__no_tag__')).map(() => 'Paused'),
          ...dataSource.filter((item) => item.isCachedValue).map(() => 'Cached'),
          ...dataSource
            .filter((item) => item.placeholderType)
            .map((item) => {
              switch (item.placeholderType) {
                case 'source_not_found':
                  return 'Missing';
                case 'empty_source':
                  return 'Empty Source';
                case 'empty_value':
                  return 'Empty Value';
                default:
                  return '';
              }
            })
            .filter(Boolean),
        ]),
      ].map((tag) => ({ text: tag, value: tag })),
      filteredValue: filteredInfo.tags || null,
      filterSearch: true,
      onFilter: (value, record) => {
        const tags = [record.isResponse ? 'Response' : 'Request', ...(record.tag ? [record.tag] : [])];
        if (disabledTagGroups.has(record.tag || '__no_tag__')) tags.push('Paused');
        if (record.isCachedValue) tags.push('Cached');
        if (record.placeholderType) {
          switch (record.placeholderType) {
            case 'source_not_found':
              tags.push('Missing');
              break;
            case 'empty_source':
              tags.push('Empty Source');
              break;
            case 'empty_value':
              tags.push('Empty Value');
              break;
          }
        }
        return tags.includes(value as string);
      },
      sortOrder: sortedInfo.columnKey === 'tags' ? sortedInfo.order : null,
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
        if (!record.placeholderType && record.isCachedValue && record.isEnabled) {
          allTags.push({
            label: 'Cached',
            color: 'warning',
            tooltip: 'Using cached value — app disconnected, source may be outdated',
          });
        }
        if (record.placeholderType) {
          allTags.push({
            label: record.placeholderType === 'source_not_found' ? 'Missing' : 'Empty',
            color: record.placeholderType === 'source_not_found' ? 'error' : 'warning',
            tooltip: getPlaceholderTooltip(record.placeholderType, record.sourceId),
          });
        }
        if (record.tag) {
          allTags.push({ label: record.tag, color: getTagColor(record.tag) });
        }
        allTags.push({ label: record.isResponse ? 'Res' : 'Req', tooltip: record.isResponse ? 'Response' : 'Request' });

        const hasStatusTag =
          allTags[0]?.label === 'Paused' ||
          allTags[0]?.label === 'Cached' ||
          allTags[0]?.label === 'Missing' ||
          allTags[0]?.label === 'Empty';
        return renderTagOverflow(allTags, hasStatusTag ? 1 : 2);
      },
    },
    {
      title: 'Source',
      dataIndex: 'sourceInfo',
      key: 'sourceInfo',
      width: 150,
      sorter: (a, b) => (a.isDynamic ? a.sourceInfo : 'Static').localeCompare(b.isDynamic ? b.sourceInfo : 'Static'),
      sortOrder: sortedInfo.columnKey === 'sourceInfo' ? sortedInfo.order : null,
      render: (sourceInfo: string, record: TableRecord) => {
        if (!record.isDynamic) {
          return <Text style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Static value</Text>;
        }
        return (
          <Tooltip title={sourceInfo}>
            <Text ellipsis style={{ display: 'block', fontSize: '12px' }}>
              {sourceInfo}
            </Text>
          </Tooltip>
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
      sorter: (a, b) => Number(b.isEnabled) - Number(a.isEnabled),
      sortOrder: sortedInfo.columnKey === 'isEnabled' ? sortedInfo.order : null,
      render: (enabled: boolean, record: TableRecord) => {
        const groupPaused = disabledTagGroups.has(record.tag || '__no_tag__');
        const tooltip = !isConnected
          ? 'App not connected'
          : groupPaused && enabled
            ? 'Enabled but tag group is paused — not being injected'
            : 'Enable/disable rule';
        return (
          <Tooltip title={tooltip}>
            <Switch
              checked={enabled}
              disabled={!isConnected}
              onChange={async () => {
                const { runtime } = await import('../../utils/browser-api');
                runtime.sendMessage(
                  { type: 'toggleRule', ruleId: record.id, enabled: !enabled },
                  (response: unknown) => {
                    const resp = response as { success?: boolean } | undefined;
                    if (!resp?.success) {
                      message.error('Failed to toggle rule');
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
      width: 90,
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
                message.info('Opening edit dialog in OpenHeaders app');
              }}
            />
            <Popconfirm
              title="Delete rule"
              description={`Delete "${record.headerName}"?`}
              onConfirm={async () => {
                const { runtime } = await import('../../utils/browser-api');
                runtime.sendMessage({ type: 'deleteRule', ruleId: record.id }, (response: unknown) => {
                  const resp = response as { success?: boolean } | undefined;
                  if (resp?.success) {
                    message.success('Rule deleted');
                  } else {
                    message.error('Failed to delete rule');
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

  const addRuleMenuItems = [
    {
      key: 'modify-headers',
      icon: <SwapOutlined />,
      label: !isConnected ? (
        <Tooltip title="App not connected" placement="right">
          <span>Modify Headers (Request/Response)</span>
        </Tooltip>
      ) : (
        'Modify Headers (Request/Response)'
      ),
      disabled: !isConnected,
      onClick: async () => {
        await appLauncher.launchOrFocus({ tab: 'rules', subTab: 'headers', action: 'create' });
        message.info('Opening new rule dialog in OpenHeaders app');
      },
    },
    {
      key: 'modify-payload',
      icon: <ApiOutlined />,
      label: !isConnected ? (
        <Tooltip title="App not connected" placement="right">
          <span>Modify Payload (Request/Response)</span>
        </Tooltip>
      ) : (
        'Modify Payload (Request/Response)'
      ),
      disabled: !isConnected,
      onClick: async () => {
        await appLauncher.launchOrFocus({ tab: 'rules', subTab: 'payload', action: 'create' });
        message.info('Opening payload rules in OpenHeaders app');
      },
    },
    {
      key: 'modify-params',
      icon: <LinkOutlined />,
      label: !isConnected ? (
        <Tooltip title="App not connected" placement="right">
          <span>Modify URL Query Params</span>
        </Tooltip>
      ) : (
        'Modify URL Query Params'
      ),
      disabled: !isConnected,
      onClick: async () => {
        await appLauncher.launchOrFocus({ tab: 'rules', subTab: 'query-params', action: 'create' });
        message.info('Opening query params rules in OpenHeaders app');
      },
    },
    {
      key: 'block-requests',
      icon: <StopOutlined />,
      label: !isConnected ? (
        <Tooltip title="App not connected" placement="right">
          <span>Block Requests</span>
        </Tooltip>
      ) : (
        'Block Requests'
      ),
      disabled: !isConnected,
      onClick: async () => {
        await appLauncher.launchOrFocus({ tab: 'rules', subTab: 'block', action: 'create' });
        message.info('Opening block rules in OpenHeaders app');
      },
    },
    {
      key: 'redirect-requests',
      icon: <SendOutlined />,
      label: !isConnected ? (
        <Tooltip title="App not connected" placement="right">
          <span>Redirect Requests</span>
        </Tooltip>
      ) : (
        'Redirect Requests'
      ),
      disabled: !isConnected,
      onClick: async () => {
        await appLauncher.launchOrFocus({ tab: 'rules', subTab: 'redirect', action: 'create' });
        message.info('Opening redirect rules in OpenHeaders app');
      },
    },
    {
      key: 'inject-scripts',
      icon: <CodeOutlined />,
      label: !isConnected ? (
        <Tooltip title="App not connected" placement="right">
          <span>Inject Scripts/CSS</span>
        </Tooltip>
      ) : (
        'Inject Scripts/CSS'
      ),
      disabled: !isConnected,
      onClick: async () => {
        await appLauncher.launchOrFocus({ tab: 'rules', subTab: 'inject', action: 'create' });
        message.info('Opening inject rules in OpenHeaders app');
      },
    },
    { type: 'divider' as const },
    {
      key: 'more-options',
      icon: <MoreOutlined />,
      label: !isConnected ? (
        <Tooltip title="App not connected" placement="right">
          <span>And more inside the app...</span>
        </Tooltip>
      ) : (
        'And more inside the app...'
      ),
      disabled: !isConnected,
      onClick: async () => {
        await appLauncher.launchOrFocus({ tab: 'rules', subTab: 'headers' });
        message.info('Switch to OpenHeaders app to add rule');
      },
    },
  ];

  return (
    <div className="header-rules-section">
      <div className="table-toolbar">
        <div className="header-rules-title">
          <div>
            <Space align="center" size={8}>
              <Text style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Header Rules</Text>
              {totalCount > 0 && (
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  {injectingCount} of {totalCount} enabled
                  {injectingCount < enabledCount ? `, ${enabledCount - injectingCount} unresolved` : ''}
                </Text>
              )}
            </Space>
            {pausedCount > 0 && (
              <div>
                <Text type="warning" style={{ fontSize: '11px' }}>
                  {pausedCount} rule{pausedCount !== 1 ? 's' : ''} paused by tag group
                </Text>
              </div>
            )}
          </div>
          <Space>
            <Dropdown menu={{ items: addRuleMenuItems }} placement="bottomRight" trigger={['click']}>
              <Button type="primary" size="middle" className="add-rule-button">
                <Space>
                  <PlusOutlined />
                  Add Rule
                  <DownOutlined style={{ fontSize: '10px' }} />
                </Space>
              </Button>
            </Dropdown>
            <div>
              <Search
                placeholder="Search anything..."
                allowClear
                size="small"
                style={{ width: 300 }}
                value={searchText}
                onChange={(e) => handleSearchChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && searchText) {
                    e.stopPropagation();
                    handleSearchChange('');
                  }
                }}
              />
              {(searchText || Object.keys(filteredInfo).length > 0 || sortedInfo.columnKey) && (
                <div style={{ textAlign: 'right', marginTop: 2 }}>
                  <Button
                    onClick={clearAll}
                    type="link"
                    size="small"
                    style={{ fontSize: '11px', padding: 0, height: 'auto' }}
                  >
                    Clear filters and sorting
                  </Button>
                </div>
              )}
            </div>
          </Space>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, paddingBottom: '8px' }}>
        <Table
          dataSource={filteredData}
          columns={columns}
          pagination={paginationConfig}
          size="small"
          scroll={{ x: 920, y: 290 }}
          onChange={handleChange}
          onRow={(_record: TableRecord, index) => ({
            onClick: () => {
              if (index !== undefined) {
                setFocusedRowIndex(index);
                (document.activeElement as HTMLElement)?.blur();
              }
            },
          })}
          rowClassName={(record: TableRecord, index: number) => {
            const classes: string[] = [];
            if (record.isEnabled && record.placeholderType) classes.push('row-not-injecting');
            if (disabledTagGroups.has(record.tag || '__no_tag__')) classes.push('row-group-paused');
            if (index === focusedRowIndex) classes.push('keyboard-focused-row');
            if (index === pendingDeleteIndex) classes.push('keyboard-pending-delete-row');
            return classes.join(' ');
          }}
          locale={{
            emptyText: (
              <Empty
                image={<FileTextOutlined style={{ fontSize: 28, color: 'var(--text-tertiary)' }} />}
                description={
                  searchText ? (
                    <Text type="secondary">No matching headers found</Text>
                  ) : (
                    <Space orientation="vertical" size={4}>
                      <Text type="secondary">No header rules yet</Text>
                      <Text type="secondary" style={{ fontSize: '12px' }}>
                        Click "Add Rule" above to create rules in the desktop app
                      </Text>
                    </Space>
                  )
                }
                style={{ padding: '32px 0' }}
              />
            ),
          }}
          className="header-rules-table"
          style={{ width: '100%', flex: 1 }}
        />
        <DeleteConfirmOverlay
          pendingDeleteIndex={pendingDeleteIndex}
          itemName={filteredData[pendingDeleteIndex]?.headerName ?? ''}
        />
      </div>
    </div>
  );
};

export default HeaderTable;
