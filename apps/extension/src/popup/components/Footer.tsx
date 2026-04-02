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
import { useKeyboardNav } from '@context/KeyboardNavContext';
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
  const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
  return hotkey
    .replace('CommandOrControl', isMac ? 'Cmd' : 'Ctrl')
    .replace('Command', 'Cmd')
    .replace('Control', 'Ctrl');
};

const Footer: React.FC = () => {
  const { setFooterActions, setIsShortcutsOverlayVisible } = useKeyboardNav();
  const version = __APP_VERSION__;
  const { token } = theme.useToken();
  const [useWidget, setUseWidget] = useState(true);
  const [enableVideoRecording, setEnableVideoRecording] = useState(false);
  const [recordingHotkey, setRecordingHotkey] = useState('Cmd+Shift+E');
  const [recordingHotkeyEnabled, setRecordingHotkeyEnabled] = useState(true);
  const [optionsTooltipOpen, setOptionsTooltipOpen] = useState(false);
  const [optionsDropdownOpen, setOptionsDropdownOpen] = useState(false);
  const [isRulesExecutionPaused, setIsRulesExecutionPaused] = useState(false);
  const { message } = App.useApp();
  const appLauncher = getAppLauncher();

  const { headerEntries, isConnected } = useHeader();
  const totalRules = Object.keys(headerEntries).length;

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
    void checkVideoRecordingState();
    void checkRecordingHotkey();

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

  // Register keyboard-accessible actions with parent
  // biome-ignore lint/correctness/useExhaustiveDependencies: handleGlobalRulesToggle is stable in practice — including it would cause infinite re-registration
  const handleTogglePauseForKeyboard = useCallback(() => {
    void handleGlobalRulesToggle(isRulesExecutionPaused);
  }, [isRulesExecutionPaused]);

  const handleToggleRecordingForKeyboard = useCallback(() => {
    const recordBtn = document.querySelector('.recording-button') as HTMLButtonElement | null;
    if (recordBtn && !recordBtn.disabled) recordBtn.click();
  }, []);

  const handleToggleOptionsForKeyboard = useCallback(() => {
    setOptionsDropdownOpen((prev) => {
      if (!prev) {
        // Opening — focus first interactive menu item after render
        const tryFocus = (attempts: number) => {
          const firstItem = document.querySelector(
            '.ant-dropdown:not(.ant-dropdown-hidden) .ant-dropdown-menu-item:not(.ant-dropdown-menu-item-disabled)',
          ) as HTMLElement | null;
          if (firstItem) {
            firstItem.focus();
          } else if (attempts > 0) {
            requestAnimationFrame(() => tryFocus(attempts - 1));
          }
        };
        requestAnimationFrame(() => tryFocus(5));
      }
      return !prev;
    });
  }, []);

  useEffect(() => {
    setFooterActions({
      onToggleRecording: handleToggleRecordingForKeyboard,
      onToggleRulesPause: handleTogglePauseForKeyboard,
      onToggleOptions: handleToggleOptionsForKeyboard,
    });
  }, [setFooterActions, handleToggleRecordingForKeyboard, handleTogglePauseForKeyboard, handleToggleOptionsForKeyboard]);

  // When options dropdown is open, handle keyboard actions on focused menu items
  useEffect(() => {
    if (!optionsDropdownOpen) return;
    const handleOptionsKeyDown = (e: KeyboardEvent) => {
      const focused = document.activeElement as HTMLElement | null;
      if (!focused?.closest('.ant-dropdown-menu-item')) return;

      // Enter/Space — toggle the switch inside the focused item
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const toggle = focused.querySelector('.ant-switch') as HTMLButtonElement | null;
        if (toggle) toggle.click();
        return;
      }

      // 'e' — click the edit button inside the focused item (e.g. hotkey edit)
      if (e.key === 'e') {
        const editBtn = focused.querySelector('.ant-btn .anticon-edit, .anticon-edit')?.closest('button') as HTMLButtonElement | null;
        if (editBtn && !editBtn.disabled) {
          e.preventDefault();
          editBtn.click();
        }
        return;
      }
    };
    document.addEventListener('keydown', handleOptionsKeyDown, true);
    return () => document.removeEventListener('keydown', handleOptionsKeyDown, true);
  }, [optionsDropdownOpen]);

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
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <Tooltip title={!isConnected ? 'App not connected' : 'Edit hotkey in settings'}>
                <Button
                  type="text"
                  icon={<EditOutlined />}
                  size="small"
                  disabled={!isConnected}
                  onClick={handleEditHotkey}
                  style={{ padding: '0 4px', height: '20px', minWidth: 'auto' }}
                />
              </Tooltip>
              <Switch
                size="small"
                checked={isConnected && recordingHotkeyEnabled}
                disabled={!isConnected}
                onChange={handleHotkeyToggle}
              />
            </span>
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
          open={optionsDropdownOpen}
          onOpenChange={(open, info) => {
            // Don't close when interacting with menu items (Enter/click) — these are toggle items
            if (!open && info.source === 'menu') return;
            setOptionsDropdownOpen(open);
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

        <Tooltip title="Keyboard shortcuts">
          <span
            className="kbd-key"
            onClick={() => setIsShortcutsOverlayVisible((prev: boolean) => !prev)}
            style={{ cursor: 'pointer', marginLeft: '4px' }}
          >
            ?
          </span>
        </Tooltip>
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
