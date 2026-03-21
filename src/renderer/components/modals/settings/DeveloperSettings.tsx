import React from 'react';
import { Button, Space } from 'antd';
import { FolderOpenOutlined, FileSearchOutlined, FolderOutlined } from '@ant-design/icons';
import SettingItem from './SettingItem';
import { getSettingsConfig, settingsStyles } from './SettingsConfig';
import type { AppSettings, ScreenRecordingPermission } from '../../../../types/settings';

/**
 * DeveloperSettings component for displaying developer/diagnostics settings
 *
 * Only visible when developerMode is enabled in Appearance settings.
 * Provides log level control and quick access to app directories.
 *
 * @param {Object} formValues - Current form values containing all settings
 * @param {Object} screenRecordingPermission - Screen recording permission state
 * @param {function} onChange - Callback function for handling setting changes
 */
interface DeveloperSettingsProps { formValues: Partial<AppSettings>; screenRecordingPermission: ScreenRecordingPermission | null; onChange: (key: string, value: unknown) => void; }
const DeveloperSettings = ({ formValues, screenRecordingPermission, onChange }: DeveloperSettingsProps) => {
    const settingsConfig = getSettingsConfig(formValues, screenRecordingPermission);

    const renderSettingItems = (items: ReturnType<typeof getSettingsConfig>['developer']) => (
        <>
            {items.map((setting, index: number) => (
                <SettingItem
                    key={`${setting.fieldName}-${index}`}
                    {...setting as React.ComponentProps<typeof SettingItem>}
                    onChange={onChange}
                />
            ))}
        </>
    );

    const handleOpenPath = (pathKey: string) => {
        window.electronAPI.openAppPath(pathKey);
    };

    return (
        <div style={settingsStyles.tabContent}>
            <div style={settingsStyles.section}>Diagnostics</div>
            {renderSettingItems(settingsConfig.developer || [])}

            <div style={settingsStyles.section}>Quick Access</div>
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
                <Button
                    icon={<FolderOpenOutlined />}
                    onClick={() => handleOpenPath('logs')}
                    block
                    style={{ textAlign: 'left' }}
                >
                    Open Logs Folder
                </Button>
                <Button
                    icon={<FolderOutlined />}
                    onClick={() => handleOpenPath('userData')}
                    block
                    style={{ textAlign: 'left' }}
                >
                    Open App Data Folder
                </Button>
                <Button
                    icon={<FileSearchOutlined />}
                    onClick={() => handleOpenPath('settings')}
                    block
                    style={{ textAlign: 'left' }}
                >
                    Reveal Settings File
                </Button>
            </Space>
        </div>
    );
};

export default DeveloperSettings;
