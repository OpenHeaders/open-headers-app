import { AppstoreOutlined, FolderOpenOutlined, FolderOutlined, TagsOutlined } from '@ant-design/icons';
import type { HeaderEntry } from '@context/HeaderContext';
import { useKeyboardNav } from '@context/KeyboardNavContext';
import { useHeader } from '@hooks/useHeader';
import { App, Empty, Input, Space, Switch, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type React from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useRowActionRegistration } from '@/hooks/useRowActionRegistration';
import { useTablePagination } from '@/hooks/useTablePagination';
import type { PageInfo, RowActions } from '../utils/table-shared';
import { renderDomainTags } from './columns/sharedColumnRenderers';

const { Text } = Typography;

interface RuleWithId extends HeaderEntry {
  id: string;
}

interface TagGroupRecord {
  key: string;
  groupKey: string;
  name: string;
  rules: RuleWithId[];
  totalCount: number;
  enabledCount: number;
  allEnabled: boolean;
}

interface NestedRuleRecord {
  key: string;
  id: string;
  headerName: string;
  isResponse: boolean | undefined;
  isEnabled: boolean;
  domains: string[];
  tag: string;
}

interface TagManagerProps {
  focusedRowIndex?: number;
  pendingDeleteIndex?: number;
  onPageInfoChange?: (info: PageInfo) => void;
  onRowActionsChange?: (actions: RowActions) => void;
}

const TagManager: React.FC<TagManagerProps> = ({
  focusedRowIndex = -1,
  pendingDeleteIndex = -1,
  onPageInfoChange,
  onRowActionsChange,
}) => {
  const { headerEntries, isConnected } = useHeader();
  const { message } = App.useApp();
  const { expandedRowKey, setNestedRowCount, toggleExpandedRow } = useKeyboardNav();
  const [searchText, setSearchText] = useState('');

  const groupedRules = useMemo((): TagGroupRecord[] => {
    const groups: Record<string, { name: string; rules: RuleWithId[] }> = {};
    groups.__no_tag__ = { name: 'Untagged Rules', rules: [] };

    Object.entries(headerEntries).forEach(([id, rule]) => {
      const tag = rule.tag || '__no_tag__';
      if (tag !== '__no_tag__' && !groups[tag]) {
        groups[tag] = { name: tag, rules: [] };
      }
      groups[tag].rules.push({ id, ...rule });
    });

    // Remove empty groups
    for (const key of Object.keys(groups)) {
      if (groups[key].rules.length === 0) delete groups[key];
    }

    const sorted = Object.entries(groups).sort(([a], [b]) => {
      if (a === '__no_tag__') return 1;
      if (b === '__no_tag__') return -1;
      return a.localeCompare(b);
    });

    return sorted.map(([groupKey, groupData]) => {
      const enabled = groupData.rules.filter((r) => r.isEnabled !== false).length;
      return {
        key: groupKey,
        groupKey,
        name: groupData.name,
        rules: groupData.rules,
        totalCount: groupData.rules.length,
        enabledCount: enabled,
        allEnabled: enabled === groupData.rules.length && groupData.rules.length > 0,
      };
    });
  }, [headerEntries]);

  // Filter by search
  const filteredGroups = useMemo(() => {
    if (!searchText) return groupedRules;
    const q = searchText.toLowerCase();
    return groupedRules
      .map((group) => {
        const nameMatch = group.name.toLowerCase().includes(q);
        const matchingRules = group.rules.filter(
          (r) =>
            r.headerName.toLowerCase().includes(q) ||
            (r.domains || []).some((d) => d.toLowerCase().includes(q)) ||
            (r.tag || '').toLowerCase().includes(q),
        );
        if (nameMatch) return group;
        if (matchingRules.length > 0) {
          const enabled = matchingRules.filter((r) => r.isEnabled !== false).length;
          return {
            ...group,
            rules: matchingRules,
            totalCount: matchingRules.length,
            enabledCount: enabled,
            allEnabled: enabled === matchingRules.length && matchingRules.length > 0,
          };
        }
        return null;
      })
      .filter((g): g is TagGroupRecord => g !== null);
  }, [groupedRules, searchText]);

  const dataSourceRef = useRef<TagGroupRecord[]>([]);
  dataSourceRef.current = filteredGroups;

  const { paginationConfig } = useTablePagination({
    dataSource: filteredGroups,
    onPageInfoChange,
  });

  const handleGroupToggle = useCallback(
    async (groupKey: string, enabled: boolean) => {
      const group = dataSourceRef.current.find((g) => g.groupKey === groupKey);
      if (!group) return;
      if (!isConnected) {
        message.warning('Please connect to the desktop app to toggle rules');
        return;
      }
      const { runtime } = await import('../../utils/browser-api');
      for (const rule of group.rules) {
        runtime.sendMessage({ type: 'toggleRule', ruleId: rule.id, enabled }, (response: unknown) => {
          if (!(response as { success?: boolean })?.success)
            console.error(new Date().toISOString(), 'ERROR', '[TagManager]', `Failed to toggle rule ${rule.id}`);
        });
      }
      message.success(`${enabled ? 'Enabled' : 'Disabled'} ${group.rules.length} rules in "${group.name}"`);
    },
    [isConnected, message],
  );

  // Row actions for keyboard navigation
  const handleToggleRow = useCallback(
    (index: number) => {
      const record = dataSourceRef.current[index];
      if (!record) return;
      void handleGroupToggle(record.groupKey, !record.allEnabled);
    },
    [handleGroupToggle],
  );

  useRowActionRegistration(onRowActionsChange, {
    onToggleRow: handleToggleRow,
  });

  const totalRules = Object.keys(headerEntries).length;

  const columns: ColumnsType<TagGroupRecord> = [
    {
      title: 'Tag',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (name: string, record: TagGroupRecord) => {
        const isExpanded = expandedRowKey === record.key;
        return (
          <Space>
            {isExpanded ? (
              <FolderOpenOutlined style={{ color: 'var(--text-secondary)' }} />
            ) : (
              <FolderOutlined style={{ color: 'var(--text-secondary)' }} />
            )}
            <Text strong style={{ fontSize: '13px' }}>
              {name}
            </Text>
          </Space>
        );
      },
    },
    {
      title: 'Stats',
      key: 'stats',
      width: 140,
      render: (_: unknown, record: TagGroupRecord) => (
        <Text type="secondary" style={{ fontSize: '12px' }}>
          {record.enabledCount} of {record.totalCount} enabled
        </Text>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 80,
      align: 'center',
      fixed: 'right',
      render: (_: unknown, record: TagGroupRecord) => (
        <span onClick={(e: React.MouseEvent) => e.stopPropagation()}>
          <Tooltip
            title={
              isConnected
                ? `${record.allEnabled ? 'Disable' : 'Enable'} all rules in this group`
                : 'App not connected'
            }
          >
            <Switch
              size="small"
              checked={record.allEnabled}
              disabled={!isConnected}
              onChange={(checked) => void handleGroupToggle(record.groupKey, checked)}
            />
          </Tooltip>
        </span>
      ),
    },
  ];

  const nestedColumns: ColumnsType<NestedRuleRecord> = [
    {
      title: 'Header Name',
      dataIndex: 'headerName',
      key: 'headerName',
      width: 160,
      render: (text: string) => (
        <Tooltip title={text.length > 20 ? text : undefined}>
          <Text style={{ fontSize: '13px' }}>
            {text.length > 20 ? `${text.substring(0, 14)}...${text.substring(text.length - 4)}` : text}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: 'Type',
      key: 'type',
      width: 80,
      align: 'center',
      render: (_: unknown, record: NestedRuleRecord) => (
        <Tag color={record.isResponse ? 'blue' : 'green'} variant="outlined" style={{ margin: 0, fontSize: '11px' }}>
          {record.isResponse ? 'Res' : 'Req'}
        </Tag>
      ),
    },
    {
      title: 'Domains',
      dataIndex: 'domains',
      key: 'domains',
      width: 160,
      render: (domains: string[]) => renderDomainTags(domains),
    },
    {
      title: 'Status',
      key: 'status',
      width: 70,
      align: 'center',
      render: (_: unknown, record: NestedRuleRecord) => (
        <Tooltip title={isConnected ? (record.isEnabled ? 'Disable rule' : 'Enable rule') : 'App not connected'}>
          <Switch
            size="small"
            checked={record.isEnabled}
            disabled={!isConnected}
            onChange={async (checked) => {
              if (!isConnected) {
                message.warning('Please connect to the desktop app to toggle rules');
                return;
              }
              const { runtime } = await import('../../utils/browser-api');
              runtime.sendMessage({ type: 'toggleRule', ruleId: record.id, enabled: checked }, (response: unknown) => {
                if ((response as { success?: boolean })?.success)
                  message.success(`Rule ${checked ? 'enabled' : 'disabled'}`);
                else message.error('Failed to toggle rule');
              });
            }}
          />
        </Tooltip>
      ),
    },
  ];

  if (groupedRules.length === 0) {
    return (
      <Empty
        image={<AppstoreOutlined style={{ fontSize: 32, color: 'var(--text-tertiary)' }} />}
        description={
          <Space orientation="vertical" size={4}>
            <Text type="secondary">No rules to organize</Text>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              Add rules and tag them for better organization
            </Text>
          </Space>
        }
        style={{ padding: '40px 0' }}
      />
    );
  }

  return (
    <div className="header-rules-section" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="table-toolbar">
        <div className="header-rules-title">
          <div>
            <Space align="center" size={8}>
              <Text style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Tags</Text>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                {filteredGroups.length} group{filteredGroups.length !== 1 ? 's' : ''}, {totalRules} rule
                {totalRules !== 1 ? 's' : ''}
              </Text>
            </Space>
          </div>
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
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, paddingBottom: '8px' }}>
        <Table<TagGroupRecord>
          dataSource={filteredGroups}
          columns={columns}
          pagination={paginationConfig}
          size="small"
          scroll={{ x: 470, y: 290 }}
          rowClassName={(_record: TagGroupRecord, index: number) => {
            const classes: string[] = [];
            if (index === focusedRowIndex) classes.push('keyboard-focused-row');
            if (index === pendingDeleteIndex) classes.push('keyboard-pending-delete-row');
            return classes.join(' ');
          }}
          expandable={{
            columnWidth: 40,
            expandRowByClick: true,
            expandedRowKeys: expandedRowKey !== null ? [expandedRowKey] : [],
            expandIcon: ({ record, onExpand }) => {
              const badgeCount = record.totalCount;
              return (
                <Tooltip
                  title={`${badgeCount} rule${badgeCount !== 1 ? 's' : ''} in this group — click to expand`}
                >
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
                      backgroundColor: badgeCount > 0 ? '#8c8c8c' : '#d9d9d9',
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
            onExpand: (_expanded: boolean, record: TagGroupRecord) => {
              const fullIndex = filteredGroups.findIndex((g) => g.key === record.key);
              const pageStart = (paginationConfig.current - 1) * paginationConfig.pageSize;
              const pageRelativeIndex = fullIndex - pageStart;
              toggleExpandedRow(record.key, pageRelativeIndex >= 0 ? pageRelativeIndex : undefined);
              (document.activeElement as HTMLElement)?.blur();
            },
            expandedRowRender: (record: TagGroupRecord) => {
              const nestedData: NestedRuleRecord[] = record.rules.map((rule) => ({
                key: rule.id,
                id: rule.id,
                headerName: rule.headerName,
                isResponse: rule.isResponse,
                isEnabled: rule.isEnabled !== false,
                domains: rule.domains || [],
                tag: rule.tag || '',
              }));

              // Report nested row count to keyboard nav when this is the keyboard-expanded row
              if (record.key === expandedRowKey) {
                queueMicrotask(() => setNestedRowCount(nestedData.length));
              }

              if (nestedData.length === 0) {
                return (
                  <Text type="secondary" style={{ fontSize: '12px', fontStyle: 'italic' }}>
                    No rules in this group
                  </Text>
                );
              }

              return (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Text type="secondary" style={{ fontSize: '11px' }}>
                      {record.enabledCount} of {record.totalCount} rule{record.totalCount !== 1 ? 's' : ''} enabled
                    </Text>
                  </div>
                  <Table<NestedRuleRecord>
                    columns={nestedColumns}
                    dataSource={nestedData}
                    pagination={false}
                    size="small"
                    scroll={nestedData.length > 3 ? { y: 120 } : undefined}
                    showHeader={nestedData.length > 1}
                  />
                </div>
              );
            },
            rowExpandable: () => true,
          }}
          locale={{
            emptyText: (
              <Empty
                image={<TagsOutlined style={{ fontSize: 24, color: 'var(--text-tertiary)' }} />}
                description={
                  searchText ? (
                    <Text type="secondary">No matching tag groups found</Text>
                  ) : (
                    <Space orientation="vertical" size={4}>
                      <Text type="secondary">No tag groups</Text>
                      <Text type="secondary" style={{ fontSize: '11px' }}>
                        Tag your rules for better organization
                      </Text>
                    </Space>
                  )
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

export default TagManager;
