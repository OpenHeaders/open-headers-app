import { AppstoreTwoTone, TagsTwoTone, ThunderboltTwoTone } from '@ant-design/icons';
import { useKeyboardNav } from '@context/KeyboardNavContext';
import { Tabs } from 'antd';
import type React from 'react';
import ActiveRules from './ActiveRules';
import HeaderTable from './HeaderTable';
import TagManager from './TagManager';

const RulesList: React.FC = () => {
  const { activeTab, onTabChange, focusedRowIndex, pendingDeleteIndex, setPageInfo, setRowActions } = useKeyboardNav();

  const items = [
    {
      key: 'active-rules',
      label: 'This Page',
      children: (
        <ActiveRules
          focusedRowIndex={activeTab === 'active-rules' ? focusedRowIndex : -1}
          pendingDeleteIndex={activeTab === 'active-rules' ? pendingDeleteIndex : -1}
          onPageInfoChange={activeTab === 'active-rules' ? setPageInfo : undefined}
          onRowActionsChange={activeTab === 'active-rules' ? setRowActions : undefined}
        />
      ),
      icon: <ThunderboltTwoTone />,
    },
    {
      key: 'all-rules',
      label: 'All Rules',
      children: (
        <HeaderTable
          focusedRowIndex={activeTab === 'all-rules' ? focusedRowIndex : -1}
          pendingDeleteIndex={activeTab === 'all-rules' ? pendingDeleteIndex : -1}
          onPageInfoChange={activeTab === 'all-rules' ? setPageInfo : undefined}
          onRowActionsChange={activeTab === 'all-rules' ? setRowActions : undefined}
        />
      ),
      icon: <AppstoreTwoTone />,
    },
    {
      key: 'tag-manager',
      label: 'Tags',
      children: (
        <TagManager
          focusedRowIndex={activeTab === 'tag-manager' ? focusedRowIndex : -1}
          pendingDeleteIndex={activeTab === 'tag-manager' ? pendingDeleteIndex : -1}
          onPageInfoChange={activeTab === 'tag-manager' ? setPageInfo : undefined}
          onRowActionsChange={activeTab === 'tag-manager' ? setRowActions : undefined}
        />
      ),
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
