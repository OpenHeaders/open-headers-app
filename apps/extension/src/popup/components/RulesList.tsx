import { AppstoreTwoTone, TagsTwoTone, ThunderboltTwoTone } from '@ant-design/icons';
import { Tabs } from 'antd';
import type React from 'react';
import ActiveRules from './ActiveRules';
import HeaderTable from './HeaderTable';
import TagManager from './TagManager';

interface PageInfo {
  visibleRowCount: number;
  visibleRowIds: readonly (string | number)[];
  hasNextPage: boolean;
  hasPrevPage: boolean;
  onNextPage?: () => void;
  onPrevPage?: () => void;
}

interface RulesListProps {
  activeTab: string | null;
  onTabChange: (key: string) => void;
  focusedRowIndex: number;
  pendingDeleteIndex: number;
  onPageInfoChange: (info: PageInfo) => void;
  onRowActionsChange: (actions: {
    onToggleRow?: (index: number) => void;
    onExpandRow?: (index: number) => void;
    onCollapseRow?: (index: number) => void;
    onEditRow?: (index: number) => void;
    onCopyRow?: (index: number) => void;
    onDeleteRow?: (index: number) => void;
    onAddRule?: () => void;
  }) => void;
}

const RulesList: React.FC<RulesListProps> = ({
  activeTab,
  onTabChange,
  focusedRowIndex,
  pendingDeleteIndex,
  onPageInfoChange,
  onRowActionsChange,
}) => {
  const items = [
    {
      key: 'active-rules',
      label: 'Active',
      children: (
        <ActiveRules
          focusedRowIndex={activeTab === 'active-rules' ? focusedRowIndex : -1}
          pendingDeleteIndex={activeTab === 'active-rules' ? pendingDeleteIndex : -1}
          onPageInfoChange={activeTab === 'active-rules' ? onPageInfoChange : undefined}
          onRowActionsChange={activeTab === 'active-rules' ? onRowActionsChange : undefined}
        />
      ),
      icon: <ThunderboltTwoTone />,
    },
    {
      key: 'all-rules',
      label: 'Rules',
      children: (
        <HeaderTable
          focusedRowIndex={activeTab === 'all-rules' ? focusedRowIndex : -1}
          pendingDeleteIndex={activeTab === 'all-rules' ? pendingDeleteIndex : -1}
          onPageInfoChange={activeTab === 'all-rules' ? onPageInfoChange : undefined}
          onRowActionsChange={activeTab === 'all-rules' ? onRowActionsChange : undefined}
        />
      ),
      icon: <AppstoreTwoTone />,
    },
    {
      key: 'tag-manager',
      label: 'Tags',
      children: <TagManager />,
      icon: <TagsTwoTone />,
    },
  ];

  if (activeTab === null) return null;

  return (
    <Tabs
      activeKey={activeTab}
      onChange={onTabChange}
      items={items}
      type="card"
      size="middle"
      animated={{ inkBar: true, tabPane: false }}
      destroyOnHidden={false}
      className="header-rules-tabs"
      style={{ height: '100%' }}
      tabBarStyle={{ marginBottom: 8, paddingLeft: 8, paddingRight: 8 }}
      tabBarGutter={4}
    />
  );
};

export default RulesList;
