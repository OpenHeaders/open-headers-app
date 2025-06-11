import React, { useState, useEffect, useRef } from 'react';
import { Layout, Typography, Button, Space, Dropdown, Tag, notification } from 'antd';
import {
    SettingOutlined,
    ExportOutlined,
    ImportOutlined,
    DownOutlined,
    MenuOutlined,
    QuestionCircleOutlined,
    DownloadOutlined,
    LoadingOutlined
} from '@ant-design/icons';
import SourceForm from './components/SourceForm';
import SourceTable from './components/SourceTable';
import SettingsModal from './components/SettingsModal';
import AboutModal from './components/AboutModal';
import UpdateNotification from './components/UpdateNotification';
import TrayMenu from './components/TrayMenu';
import { useSources } from './contexts/SourceContext';
import { CircuitBreakerStatus } from './components/CircuitBreakerStatus';
import { useSettings } from './contexts/SettingsContext';
import { useTheme } from './contexts/ThemeContext';
const { createLogger } = require('./utils/logger');
const log = createLogger('App');
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
    const { isDarkMode } = useTheme();

    const [settingsVisible, setSettingsVisible] = useState(false);
    const [aboutModalVisible, setAboutModalVisible] = useState(false);
    const [loading, setLoading] = useState({
        export: false,
        import: false
    });
    const [appVersion, setAppVersion] = useState('');

    // Create a ref for the UpdateNotification component
    const updateNotificationRef = useRef(null);

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
                log.error('Failed to get app version:', error);
            }
        };

        getAppVersion();
    }, []);

    // Handle file change events
    useEffect(() => {
        const unsubscribe = window.electronAPI.onFileChanged((sourceId, content) => {
            // File content has changed, update UI
            log.debug('File changed event for sourceId:', sourceId, 'content:', content.substring(0, 50));
            const updatedSource = sources.find(s => s.sourceId === sourceId);
            if (updatedSource) {
                log.debug('Source found, refreshing...');
                refreshSource(sourceId);
            } else {
                log.debug('Source not found in list');
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
        log.debug('Adding source:', sourceData);
        const success = await addSource(sourceData);
        if (success) {
            log.debug('Source added successfully');
            log.debug('Current sources after add:', sources);
            showMessage('success', 'Source added successfully');
        } else {
            log.debug('Failed to add source');
        }
        return success;
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
            log.error('Error importing sources:', error);
            showMessage('error', `Error importing sources: ${error.message}`);
        } finally {
            setLoading(prev => ({ ...prev, import: false }));
        }
    };

    // Handle check for updates
    const handleCheckForUpdates = () => {
        if (updateNotificationRef.current?.checkForUpdates) {
            // Pass true to indicate this is a manual check
            updateNotificationRef.current.checkForUpdates(true);
        } else {
            // Only fall back to direct API call if the component method isn't available
            window.electronAPI.checkForUpdates(true); // Pass true to indicate manual check

            // Show loading notification only if we're not using the component method
            const loadingIcon = <LoadingOutlined spin />;
            notification.open({
                message: 'Checking for Updates',
                description: 'Looking for new versions…',
                duration: 0,
                key: 'checking-updates',
                icon: loadingIcon
            });
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
            onClick: handleCheckForUpdates
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
        <Layout className={`app-container ${isDarkMode ? 'dark' : ''}`}>
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

                <UpdateNotification ref={updateNotificationRef} />

                <TrayMenu />
                
                {/* Show circuit breaker status in development */}
                <CircuitBreakerStatus />
            </Layout>
    );
};

export default AppComponent;