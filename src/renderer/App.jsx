import React, { useState, useEffect } from 'react';
import { Layout, Typography, Button, Space, Dropdown, Tag } from 'antd';
import {
    SettingOutlined,
    ExportOutlined,
    ImportOutlined,
    DownOutlined,
    MenuOutlined,
    QuestionCircleOutlined,
    DownloadOutlined
} from '@ant-design/icons';
import SourceForm from './components/SourceForm';
import SourceTable from './components/SourceTable';
import SettingsModal from './components/SettingsModal';
import AboutModal from './components/AboutModal';
import TrayMenu from './components/TrayMenu';
import { useSources } from './contexts/SourceContext';
import { useSettings } from './contexts/SettingsContext';
import { WebSocketProvider } from './contexts/WebSocketContext';
import UpdateNotification from './components/UpdateNotification';
import { showMessage } from './utils/messageUtil';

const { Header, Content } = Layout;
const { Title, Text } = Typography;

const AppComponent = () => {
    const {
        sources,
        addSource,
        removeSource,
        refreshSource,
        updateRefreshOptions,
        updateSource,
        exportSources,
        importSources
    } = useSources();

    const { settings, saveSettings } = useSettings();

    const [settingsVisible, setSettingsVisible] = useState(false);
    const [aboutModalVisible, setAboutModalVisible] = useState(false);
    const [loading, setLoading] = useState({
        export: false,
        import: false
    });
    const [appVersion, setAppVersion] = useState('');

    // Get application version on component mount
    useEffect(() => {
        // Try to get the app version from the electron API
        const getAppVersion = async () => {
            try {
                if (window.electronAPI && window.electronAPI.getAppVersion) {
                    const version = await window.electronAPI.getAppVersion();
                    setAppVersion(version);
                }
            } catch (error) {
                console.error('Failed to get app version:', error);
            }
        };

        getAppVersion();
    }, []);

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
            showMessage('success', 'Source added successfully');
        } else {
            console.log('Failed to add source');
        }
    };

    // Handle export
    const handleExport = async () => {
        if (sources.length === 0) {
            showMessage('warning', 'No sources to export');
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
                showMessage('success', `Successfully exported ${sources.length} source(s)`);
            }
        } catch (error) {
            showMessage('error', `Error exporting sources: ${error.message}`);
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
                showMessage('success', `Successfully imported ${result.count} source(s)`);
            } else {
                showMessage('warning', result.message || 'No sources were imported');
            }
        } catch (error) {
            console.error('Error importing sources:', error);
            showMessage('error', `Error importing sources: ${error.message}`);
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

    // Handle about modal
    const handleOpenAbout = () => {
        setAboutModalVisible(true);
    };

    const handleAboutCancel = () => {
        setAboutModalVisible(false);
    };

    const handleSettingsSave = async (newSettings) => {
        const success = await saveSettings(newSettings);
        if (success) {
            setSettingsVisible(false);
            showMessage('success', 'Settings saved successfully');
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
            key: 'check-updates',
            icon: <DownloadOutlined />,
            label: 'Check for Updates',
            onClick: () => window.electronAPI.checkForUpdates()
        },
        {
            key: 'settings',
            icon: <SettingOutlined />,
            label: 'Settings',
            onClick: handleOpenSettings
        },
        {
            key: 'about',
            icon: <QuestionCircleOutlined />,
            label: 'About',
            onClick: handleOpenAbout
        }
    ];

    return (
        // Wrap the entire application with WebSocketProvider
        <WebSocketProvider>
            <Layout className="app-container">
                <Header className="app-header">
                    <div className="logo-title">
                        <img src="./images/icon128.png" alt="Open Headers Logo" className="app-logo" />
                        <div className="title-version">
                            <Title level={3}>Open Headers - Dynamic Sources</Title>
                            {appVersion && (
                                <Tag color="default" className="version-tag">v{appVersion}</Tag>
                            )}
                        </div>
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
                    <div className="content-container">
                        <SourceForm onAddSource={handleAddSource} />

                        <SourceTable
                            sources={sources}
                            onRemoveSource={removeSource}
                            onRefreshSource={refreshSource}
                            onUpdateSource={updateSource}
                        />
                    </div>
                </Content>

                <SettingsModal
                    open={settingsVisible}
                    settings={settings}
                    onCancel={handleSettingsCancel}
                    onSave={handleSettingsSave}
                />

                <AboutModal
                    open={aboutModalVisible}
                    onClose={handleAboutCancel}
                    appVersion={appVersion}
                />

                <TrayMenu />
                <UpdateNotification />
            </Layout>
        </WebSocketProvider>
    );
};

export default AppComponent;