import {
  AppstoreOutlined,
  EditOutlined,
  FileTextOutlined,
  GlobalOutlined,
  InfoCircleOutlined,
  NodeExpandOutlined,
  PlaySquareOutlined,
  SettingOutlined,
  TrademarkCircleTwoTone,
  VideoCameraTwoTone,
} from '@ant-design/icons';
import { useHeader } from '@hooks/useHeader';
import { getAppLauncher } from '@utils/app-launcher';
import { runtime } from '@utils/browser-api';
import { sendMessage } from '@utils/messaging';
import { App, Button, Dropdown, Space, Switch, Tag, Tooltip, Typography, theme } from 'antd';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { getBrowserAPI } from '@/types/browser';
import RecordingButton from './RecordingButton';

const { Text } = Typography;

const formatHotkeyForDisplay = (hotkey: string): string => {
  if (!hotkey) return 'Not set';
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  return hotkey
    .replace('CommandOrControl', isMac ? 'Cmd' : 'Ctrl')
    .replace('Command', 'Cmd')
    .replace('Control', 'Ctrl');
};

const Footer: React.FC = () => {
  const version = __APP_VERSION__;
  const { token } = theme.useToken();
  const [useWidget, setUseWidget] = useState(true);
  const [enableVideoRecording, setEnableVideoRecording] = useState(false);
  const [recordingHotkey, setRecordingHotkey] = useState('Cmd+Shift+E');
  const [recordingHotkeyEnabled, setRecordingHotkeyEnabled] = useState(true);
  const [optionsTooltipOpen, setOptionsTooltipOpen] = useState(false);
  const [isRulesExecutionPaused, setIsRulesExecutionPaused] = useState(false);
  const { message } = App.useApp();
  const appLauncher = getAppLauncher();

  const { headerEntries, isConnected } = useHeader();
  const totalRules = Object.keys(headerEntries).length;
  const _enabledRules = Object.values(headerEntries).filter((rule) => rule.isEnabled !== false).length;

  const checkVideoRecordingState = useCallback(async () => {
    try {
      const response = await sendMessage({ type: 'getVideoRecordingState' });
      if (response && response.enabled !== undefined) setEnableVideoRecording(response.enabled);
    } catch (error) {
      console.log(new Date().toISOString(), 'INFO ', '[Footer]', 'Could not get video recording state:', error);
    }
  }, []);

  const checkRecordingHotkey = useCallback(async () => {
    try {
      const response = await sendMessage({ type: 'getRecordingHotkey' });
      if (response) {
        if (response.hotkey) setRecordingHotkey(formatHotkeyForDisplay(response.hotkey));
        if (response.enabled !== undefined) setRecordingHotkeyEnabled(response.enabled);
      }
    } catch (error) {
      console.log(new Date().toISOString(), 'INFO ', '[Footer]', 'Could not get recording hotkey:', error);
    }
  }, []);

  useEffect(() => {
    const browserAPI = getBrowserAPI();
    browserAPI.storage.sync.get(['useRecordingWidget', 'isRulesExecutionPaused'], (result: Record<string, unknown>) => {
      if (browserAPI.runtime.lastError) {
        console.error(
          new Date().toISOString(),
          'ERROR',
          '[Footer]',
          'Error loading preferences:',
          browserAPI.runtime.lastError,
        );
        return;
      }
      if (result.useRecordingWidget !== undefined) setUseWidget(result.useRecordingWidget as boolean);
      if (result.isRulesExecutionPaused !== undefined)
        setIsRulesExecutionPaused(result.isRulesExecutionPaused as boolean);
    });
    checkVideoRecordingState();
    checkRecordingHotkey();

    const handleVideoRecordingStateChange = (msg: { type?: string; enabled?: boolean; hotkey?: string }) => {
      if (msg.type === 'videoRecordingStateChanged' && msg.enabled !== undefined) setEnableVideoRecording(msg.enabled);
      if (msg.type === 'recordingHotkeyResponse' || msg.type === 'recordingHotkeyChanged') {
        if (msg.hotkey !== undefined) setRecordingHotkey(formatHotkeyForDisplay(msg.hotkey));
        if (msg.enabled !== undefined) setRecordingHotkeyEnabled(msg.enabled);
      }
    };
    runtime.onMessage.addListener(
      handleVideoRecordingStateChange as (
        message: unknown,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response?: unknown) => void,
      ) => void,
    );
    return () => {
      runtime.onMessage.removeListener(
        handleVideoRecordingStateChange as (
          message: unknown,
          sender: chrome.runtime.MessageSender,
          sendResponse: (response?: unknown) => void,
        ) => void,
      );
    };
  }, [checkVideoRecordingState, checkRecordingHotkey]);

  const handleWidgetToggle = (checked: boolean) => {
    setUseWidget(checked);
    const browserAPI = getBrowserAPI();
    browserAPI.storage.sync.set({ useRecordingWidget: checked }, () => {
      if (browserAPI.runtime.lastError)
        console.error(
          new Date().toISOString(),
          'ERROR',
          '[Footer]',
          'Error saving widget preference:',
          browserAPI.runtime.lastError,
        );
    });
  };

  const handleOpenWebsite = async () => {
    const response = await sendMessage({ type: 'openTab', url: 'https://openheaders.io' });
    if (!response.error) window.close();
  };

  const handleOpenRecordViewer = async () => {
    if (!isConnected) {
      message.warning('Please connect to the desktop app to view workflows');
      return;
    }
    await appLauncher.launchOrFocus({ tab: 'record-viewer' });
    message.info('Switch to OpenHeaders app to view workflows');
  };

  const handleVideoRecordingToggle = async (checked: boolean) => {
    if (!isConnected) {
      message.warning('Please connect to the desktop app to change video recording settings');
      return;
    }
    const response = await sendMessage({ type: 'toggleVideoRecording', enabled: checked });
    if (!response?.success) {
      message.error('Failed to toggle video recording');
    }
  };

  const handleEditHotkey = async () => {
    if (!isConnected) {
      message.warning('Please connect to the desktop app to edit hotkey settings');
      return;
    }
    await appLauncher.launchOrFocus({ tab: 'settings', settingsTab: 'workflows', action: 'editHotkey' });
    message.info('Switch to OpenHeaders app to edit recording hotkey');
  };

  const handleHotkeyToggle = async (checked: boolean) => {
    if (!isConnected) {
      message.warning('Please connect to the desktop app to change hotkey settings');
      return;
    }
    const response = await sendMessage({ type: 'toggleRecordingHotkey', enabled: checked });
    if (!response?.success) {
      message.error('Failed to toggle recording hotkey');
    }
  };

  const handleGlobalRulesToggle = async (checked: boolean) => {
    const browserAPI = getBrowserAPI();
    browserAPI.storage.sync.set({ isRulesExecutionPaused: !checked }, () => {
      if (browserAPI.runtime.lastError) {
        console.error(
          new Date().toISOString(),
          'ERROR',
          '[Footer]',
          'Error saving pause state:',
          browserAPI.runtime.lastError,
        );
        message.error('Failed to update rules state');
        return;
      }
      setIsRulesExecutionPaused(!checked);
      sendMessage({ type: 'setRulesExecutionPaused', paused: !checked });
      message.success(checked ? 'Rules execution resumed' : 'Rules execution paused');
    });
  };

  const optionsMenuItems = [
    {
      key: 'general-label',
      label: (
        <Text type="secondary" style={{ fontSize: '11px', fontWeight: 600 }}>
          GENERAL
        </Text>
      ),
      disabled: true,
    },
    {
      key: 'widget',
      label: (
        // biome-ignore lint/a11y/noStaticElementInteractions: stopPropagation prevents menu close
        // biome-ignore lint/a11y/useKeyWithClickEvents: not a true interactive element
        <div
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: '270px' }}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        >
          <Tooltip title="Display recording widget with a timer (drag to reposition)" placement="top">
            <Space>
              <AppstoreOutlined />
              <span>Show Widget</span>
              <InfoCircleOutlined style={{ fontSize: '12px', color: token.colorTextSecondary }} />
            </Space>
          </Tooltip>
          <Switch size="small" checked={useWidget} onChange={handleWidgetToggle} />
        </div>
      ),
    },
    {
      key: 'hotkey',
      label: (
        // biome-ignore lint/a11y/noStaticElementInteractions: stopPropagation prevents menu close
        // biome-ignore lint/a11y/useKeyWithClickEvents: not a true interactive element
        <div
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: '270px' }}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        >
          <Tooltip title="Global keyboard shortcut to start/stop recording" placement="top">
            <Space>
              <TrademarkCircleTwoTone />
              <span>Hotkey</span>
              <InfoCircleOutlined style={{ fontSize: '12px', color: token.colorTextSecondary }} />
            </Space>
          </Tooltip>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {recordingHotkey && recordingHotkey !== 'Not set' ? (
              <Space size={4}>
                {recordingHotkey.split('+').map((key, index) => (
                  <Tag
                    key={index}
                    style={{
                      margin: 0,
                      fontSize: '11px',
                    }}
                  >
                    {key}
                  </Tag>
                ))}
              </Space>
            ) : (
              <Text type="secondary" style={{ fontSize: '12px', fontStyle: 'italic' }}>
                Not set
              </Text>
            )}
            <Tooltip title={!isConnected ? 'App not connected' : 'Edit hotkey in settings'}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <Button
                  type="text"
                  icon={<EditOutlined />}
                  size="small"
                  disabled={!isConnected}
                  onClick={handleEditHotkey}
                  style={{ padding: '0 4px', height: '20px', minWidth: 'auto' }}
                />
                <Switch
                  size="small"
                  checked={isConnected && recordingHotkeyEnabled}
                  disabled={!isConnected}
                  onChange={handleHotkeyToggle}
                />
              </span>
            </Tooltip>
          </div>
        </div>
      ),
    },
    { key: 'divider1', type: 'divider' as const },
    {
      key: 'recording-types-label',
      label: (
        <Text type="secondary" style={{ fontSize: '11px', fontWeight: 600 }}>
          RECORDING TYPES
        </Text>
      ),
      disabled: true,
    },
    {
      key: 'session',
      label: (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: '250px' }}>
          <Tooltip
            title="Record all browser events (DOM, console, network, storage) and interactions (page, mouse, input)"
            placement="top"
          >
            <Space>
              <FileTextOutlined />
              <span>Session</span>
              <InfoCircleOutlined style={{ fontSize: '12px', color: token.colorTextSecondary }} />
            </Space>
          </Tooltip>
          <Tooltip title="Session recording is always enabled by default" placement="top">
            <Switch size="small" checked={true} disabled={true} style={{ opacity: 0.5 }} />
          </Tooltip>
        </div>
      ),
    },
    {
      key: 'video',
      label: (
        // biome-ignore lint/a11y/noStaticElementInteractions: stopPropagation prevents menu close
        // biome-ignore lint/a11y/useKeyWithClickEvents: not a true interactive element
        <div
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: '270px' }}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        >
          <Tooltip title="Record current screen in video format (.webm/.mp4)" placement="top">
            <Space>
              <VideoCameraTwoTone />
              <span>Video</span>
              <InfoCircleOutlined style={{ fontSize: '12px', color: token.colorTextSecondary }} />
            </Space>
          </Tooltip>
          <Tooltip
            title={!isConnected ? 'App not connected' : 'Video recording might require additional system permissions'}
            placement="top"
          >
            <Switch
              size="small"
              checked={enableVideoRecording}
              disabled={!isConnected}
              onChange={handleVideoRecordingToggle}
            />
          </Tooltip>
        </div>
      ),
    },
  ];

  return (
    <div
      className="footer"
      style={{ backgroundColor: token.colorBgContainer, borderTop: `1px solid ${token.colorBorderSecondary}` }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <RecordingButton useWidget={useWidget} />
        <Tooltip title={!isConnected ? 'App not connected' : 'View and manage recorded workflows in desktop app'}>
          <Button
            icon={<PlaySquareOutlined />}
            onClick={handleOpenRecordViewer}
            size="middle"
            disabled={!isConnected}
            style={{ height: '36px', padding: '0 20px', fontWeight: 500, boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)' }}
          >
            View Workflows
          </Button>
        </Tooltip>
        <Dropdown
          menu={{ items: optionsMenuItems }}
          placement="topRight"
          trigger={['click']}
          onOpenChange={(open) => {
            if (open) setOptionsTooltipOpen(false);
          }}
        >
          <Tooltip title="Recording options" open={optionsTooltipOpen} onOpenChange={setOptionsTooltipOpen}>
            <Button
              icon={<SettingOutlined />}
              size="middle"
              style={{ height: '36px', padding: '0 10px', fontWeight: 500, boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)' }}
            >
              Options
            </Button>
          </Tooltip>
        </Dropdown>

        {totalRules > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '0 8px',
              borderLeft: `1px solid ${token.colorBorderSecondary}`,
              marginLeft: '8px',
            }}
          >
            <NodeExpandOutlined
              style={{
                fontSize: '14px',
                color: isRulesExecutionPaused ? token.colorWarning : token.colorTextSecondary,
              }}
            />
            <Text
              style={{
                fontSize: '12px',
                color: isRulesExecutionPaused ? token.colorWarning : token.colorTextSecondary,
              }}
            >
              Rules
            </Text>
            <Tooltip
              title={
                isRulesExecutionPaused
                  ? 'Resume rules execution'
                  : 'Pause all rules (preserves individual rule settings)'
              }
            >
              <Switch
                size="default"
                checked={!isRulesExecutionPaused}
                onChange={handleGlobalRulesToggle}
                checkedChildren="Active"
                unCheckedChildren="Paused"
              />
            </Tooltip>
          </div>
        )}
      </div>

      <div>
        <Space size={8} align="center">
          <Text style={{ fontSize: '11px', color: token.colorTextTertiary }}>v{version}</Text>
          <Button
            type="text"
            icon={<GlobalOutlined />}
            onClick={handleOpenWebsite}
            size="small"
            style={{ padding: '0 4px', height: '20px', minWidth: 'auto' }}
          />
        </Space>
      </div>
    </div>
  );
};

export default Footer;
