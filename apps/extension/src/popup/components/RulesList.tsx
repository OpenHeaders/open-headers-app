import { AppstoreTwoTone, TagsTwoTone, ThunderboltTwoTone } from '@ant-design/icons';
import { Tabs } from 'antd';
import type React from 'react';
import { useEffect, useState } from 'react';
import { getBrowserAPI } from '@/types/browser';
import ActiveRules from './ActiveRules';
import HeaderTable from './HeaderTable';
import TagManager from './TagManager';

const RulesList: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string | null>(null);

  useEffect(() => {
    const browserAPI = getBrowserAPI();
    browserAPI.storage.local.get(['activeRulesTab'], (result: Record<string, unknown>) => {
      setActiveTab((result.activeRulesTab as string) || 'all-rules');
    });
  }, []);

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    const browserAPI = getBrowserAPI();
    browserAPI.storage.local.set({ activeRulesTab: key });
  };

  const items = [
    { key: 'active-rules', label: 'Active', children: <ActiveRules />, icon: <ThunderboltTwoTone /> },
    { key: 'all-rules', label: 'Rules', children: <HeaderTable />, icon: <AppstoreTwoTone /> },
    { key: 'tag-manager', label: 'Tags', children: <TagManager />, icon: <TagsTwoTone /> },
  ];

  if (activeTab === null) return null;

  return (
    <Tabs
      activeKey={activeTab}
      onChange={handleTabChange}
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
