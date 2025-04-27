import React, { useState, useEffect } from 'react';
import { Layout, Typography, Button, Space, Dropdown, message } from 'antd';
import {
    SettingOutlined,
    ExportOutlined,
    ImportOutlined,
    DownOutlined,
    MenuOutlined
} from '@ant-design/icons';
import SourceForm from './components/SourceForm';
import SourceTable from './components/SourceTable';
import SettingsModal from './components/SettingsModal';
import TrayMenu from './components/TrayMenu';
import { useSources } from './contexts/SourceContext';
import { useSettings } from './contexts/SettingsContext';

const { Header, Content } = Layout;
const { Title } = Typography;

const App = () => {
    const {
        sources,
        addSource,
        removeSource,
        refreshSource,
        updateRefreshOptions,
        exportSources,
        importSources
    } = useSources();

    const { settings, saveSettings } = useSettings();

    const [settingsVisible, setSettingsVisible] = useState(false);
    const [loading, setLoading] = useState({
        export: false,
        import: false
    });

    // Handle file change events
    useEffect(() => {
        const unsubscribe = window.electronAPI.onFileChanged((sourceId, content) => {
            // File content has changed, update UI
            console.log('File changed event for sourceId:', sourceId, 'content:', content.substring(0, 50));
            const updatedSource = sources.find(s => s.sourceId === sourceId);
            if (updatedSource) {
                console.log('Source found, refreshing...');
                refreshSource(sourceId);
            } else {
                console.log('Source not found in list');
            }
        });

        return () => {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        };
    }, [sources, refreshSource]);

    // Handle add source
    const handleAddSource = async (sourceData) => {
        console.log('Adding source:', sourceData);
        const success = await addSource(sourceData);
        if (success) {
            console.log('Source added successfully');
            console.log('Current sources after add:', sources);
            message.success('Source added successfully');
        } else {
            console.log('Failed to add source');
        }
    };

    // Handle export
    const handleExport = async () => {
        if (sources.length === 0) {
            message.warning('No sources to export');
            return;
        }

        try {
            setLoading(prev => ({ ...prev, export: true }));

            // Show save file dialog
            const filePath = await window.electronAPI.saveFileDialog({
                title: 'Export Sources',
                buttonLabel: 'Export',
                defaultPath: 'open-headers_config.json',
                filters: [
                    { name: 'JSON Files', extensions: ['json'] },
                    { name: 'All Files', extensions: ['*'] }
                ]
            });

            if (!filePath) {
                // User cancelled
                return;
            }

            // Export sources
            const success = await exportSources(filePath);
            if (success) {
                message.success(`Successfully exported ${sources.length} source(s)`);
            }
        } catch (error) {
            message.error(`Error exporting sources: ${error.message}`);
        } finally {
            setLoading(prev => ({ ...prev, export: false }));
        }
    };

    // Handle import
    const handleImport = async () => {
        try {
            setLoading(prev => ({ ...prev, import: true }));

            // Show open file dialog
            const filePath = await window.electronAPI.openFileDialog();

            if (!filePath) {
                // User cancelled
                return;
            }

            // Import sources
            const result = await importSources(filePath);
            if (result.success) {
                message.success(`Successfully imported ${result.count} source(s)`);
            } else {
                message.warning(result.message || 'No sources were imported');
            }
        } catch (error) {
            message.error(`Error importing sources: ${error.message}`);
        } finally {
            setLoading(prev => ({ ...prev, import: false }));
        }
    };

    // Handle settings
    const handleOpenSettings = () => {
        setSettingsVisible(true);
    };

    const handleSettingsCancel = () => {
        setSettingsVisible(false);
    };

    const handleSettingsSave = async (newSettings) => {
        const success = await saveSettings(newSettings);
        if (success) {
            setSettingsVisible(false);
            message.success('Settings saved successfully');
        }
    };

    // Header actions menu items
    const actionsMenuItems = [
        {
            key: 'export',
            icon: <ExportOutlined />,
            label: 'Export Sources',
            onClick: handleExport
        },
        {
            key: 'import',
            icon: <ImportOutlined />,
            label: 'Import Sources',
            onClick: handleImport
        },
        {
            type: 'divider'
        },
        {
            key: 'settings',
            icon: <SettingOutlined />,
            label: 'Settings',
            onClick: handleOpenSettings
        }
    ];

    return (
        <Layout className="app-container">
            <Header className="app-header">
                <div className="logo-title">
                    <img src="./images/icon128.png" alt="Open Headers Logo" className="app-logo" />
                    <Title level={3}>Open Headers - Dynamic Sources</Title>
                </div>

                <Space>
                    <Dropdown menu={{ items: actionsMenuItems }} trigger={['click']}>
                        <Button icon={<MenuOutlined />}>
                            Menu <DownOutlined />
                        </Button>
                    </Dropdown>
                </Space>
            </Header>

            <Content className="app-content">
                <SourceForm onAddSource={handleAddSource} />

                <SourceTable
                    sources={sources}
                    onRemoveSource={removeSource}
                    onRefreshSource={refreshSource}
                    onUpdateRefreshOptions={updateRefreshOptions}
                />
            </Content>

            <SettingsModal
                open={settingsVisible}
                settings={settings}
                onCancel={handleSettingsCancel}
                onSave={handleSettingsSave}
            />

            <TrayMenu />
        </Layout>
    );
};

export default App;