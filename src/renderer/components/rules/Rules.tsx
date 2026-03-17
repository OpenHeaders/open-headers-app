import { useNavigation } from '../../contexts';
import React, { useState, useEffect } from 'react';
import { Tabs } from 'antd';
import { 
    FileDoneOutlined, 
    FilePptOutlined,
    LinkOutlined,
    FileSearchOutlined,
    FileMarkdownOutlined
} from '@ant-design/icons';
import HeaderRules from './HeaderRules';
import PayloadRules from './PayloadRules';
import UrlRules from './UrlRules';
import ScriptsCssRules from './ScriptsCssRules';
import MoreRules from './MoreRules';

const Rules = () => {
    const [activeTab, setActiveTab] = useState('headers');
    const { navigationIntent, clearHighlight, TARGETS } = useNavigation();
    
    // Handle navigation from extension
    useEffect(() => {
        if (navigationIntent && navigationIntent.tab === 'rules' && navigationIntent.subTab) {
            setActiveTab(navigationIntent.subTab);
        }
    }, [navigationIntent]);
    
    // Clear highlight when switching tabs
    const handleTabChange = (key) => {
        setActiveTab(key);
        // Clear highlights for all rule types
        clearHighlight(TARGETS.RULES_HEADERS);
        clearHighlight(TARGETS.RULES_PAYLOAD);
        clearHighlight(TARGETS.RULES_URL);
    };

    const items = [
        {
            key: 'headers',
            label: (
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <FileDoneOutlined />
                    Headers
                </span>
            ),
            children: <HeaderRules />
        },
        {
            key: 'payload',
            label: (
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <FilePptOutlined />
                    Payload
                </span>
            ),
            children: <PayloadRules />
        },
        {
            key: 'url',
            label: (
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <LinkOutlined />
                    URL
                </span>
            ),
            children: <UrlRules />
        },
        {
            key: 'scripts',
            label: (
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <FileSearchOutlined />
                    Scripts/CSS
                </span>
            ),
            children: <ScriptsCssRules />
        },
        {
            key: 'more',
            label: (
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <FileMarkdownOutlined />
                    More
                </span>
            ),
            children: <MoreRules />
        }
    ];

    return (
        <Tabs
            activeKey={activeTab}
            onChange={handleTabChange}
            items={items}
            type="card"
            style={{ height: '100%' }}
        />
    );
};

export default Rules;