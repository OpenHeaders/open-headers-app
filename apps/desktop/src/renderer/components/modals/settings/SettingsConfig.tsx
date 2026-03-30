import {
  ApiOutlined,
  AppstoreOutlined,
  BgColorsOutlined,
  BranchesOutlined,
  BugOutlined,
  CloseCircleOutlined,
  CloudDownloadOutlined,
  CodeOutlined,
  CompressOutlined,
  DatabaseOutlined,
  EyeInvisibleOutlined,
  FileTextOutlined,
  HighlightOutlined,
  InfoCircleOutlined,
  LoginOutlined,
  MenuOutlined,
  MoonOutlined,
  QuestionCircleOutlined,
  SettingOutlined,
  SunOutlined,
  SyncOutlined,
  TrademarkCircleOutlined,
  VerticalAlignMiddleOutlined,
  VideoCameraOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Tooltip } from 'antd';
import type { AppSettings, ScreenRecordingPermission } from '../../../../types/settings';
import { THEME_MODES } from '../../../contexts';

/**
 * Settings configuration factory
 *
 * Provides centralized configuration for all settings sections and items.
 * This factory approach allows for dynamic configuration based on current
 * form values and system state (like permissions).
 *
 * Configuration Structure:
 * - general: Basic app behavior settings
 * - appearance: UI customization and theme settings
 * - records: Recording and workflow-related settings
 *
 * Each setting item includes:
 * - icon: Visual icon component
 * - title: Main label
 * - description: Explanatory text
 * - fieldName: Property name in settings object
 * - type: Input type (switch, select)
 * - options: For select types
 * - value: Current setting value
 * - isActive: Visual state based on dependencies
 * - disabled: Whether control is disabled
 * - tooltip: Contextual help text
 *
 * @param {Object} formValues - Current form values
 * @param {Object} screenRecordingPermission - Screen recording permission state
 * @param {boolean} screenRecordingPermission.hasPermission - Whether permission is granted
 * @param {string} screenRecordingPermission.platform - Operating system platform
 * @returns {Object} Configuration object with general, appearance, and records sections
 */
export const getSettingsConfig = (
  formValues: Partial<AppSettings>,
  screenRecordingPermission: ScreenRecordingPermission | null,
) => ({
  // General application behavior settings
  general: [
    {
      // Auto-launch setting - controls whether app starts at system startup
      icon: LoginOutlined,
      title: 'Open at login',
      description: 'Start automatically when you log in',
      fieldName: 'launchAtLogin',
      value: formValues.launchAtLogin,
    },
    {
      // Hide on startup setting - dependent on auto-launch being enabled
      icon: EyeInvisibleOutlined,
      title: 'Hide on start',
      description: 'Start automatically in background mode',
      fieldName: 'hideOnLaunch',
      isActive: formValues.launchAtLogin, // Only active when auto-launch is enabled
      disabled: !formValues.launchAtLogin, // Disabled when auto-launch is off
      tooltip: !formValues.launchAtLogin ? "Enable 'Open at login' to use this option" : '',
      value: formValues.hideOnLaunch,
    },
    {
      // Developer mode shows technical debug information
      icon: CodeOutlined,
      title: 'Developer mode',
      description: 'Show technical information and debug panels',
      fieldName: 'developerMode',
      value: formValues.developerMode,
    },
    {
      icon: CloudDownloadOutlined,
      title: 'Auto-update',
      description: 'Automatically check for and download updates',
      fieldName: 'autoUpdate',
      value: formValues.autoUpdate !== false,
    },
    {
      icon: BranchesOutlined,
      title: 'Update channel',
      description: (
        <>
          Choose which releases to receive{' '}
          <Tooltip
            overlayStyle={{ maxWidth: 340 }}
            title={
              <>
                <div>
                  <strong>Production:</strong> <span style={{ opacity: 0.75 }}>Fully tested and stable releases</span>
                </div>
                <div>
                  <strong>Beta:</strong>{' '}
                  <span style={{ opacity: 0.75 }}>Early access to new features and improvements</span>
                </div>
              </>
            }
          >
            <QuestionCircleOutlined style={{ fontSize: 11, cursor: 'help' }} />
          </Tooltip>
        </>
      ),
      fieldName: 'updateChannel',
      type: 'select',
      value: formValues.updateChannel || 'production',
      options: [
        {
          value: 'production',
          label: (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <CloudDownloadOutlined style={{ fontSize: 12, color: '#52c41a' }} />
              <span>Production</span>
            </div>
          ),
        },
        {
          value: 'beta',
          label: (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <BranchesOutlined style={{ fontSize: 12, color: '#faad14' }} />
              <span>Beta</span>
            </div>
          ),
        },
      ],
    },
  ],
  // UI customization and visual appearance settings
  appearance: [
    {
      // macOS-specific Dock icon visibility
      icon: AppstoreOutlined,
      title: 'Show in Dock',
      description: 'Display app icon in the Dock (MacOS)',
      fieldName: 'showDockIcon',
      value: formValues.showDockIcon,
    },
    {
      // Cross-platform system tray/menu bar icon
      icon: MenuOutlined,
      title: 'Show in menu bar',
      description: 'Display app icon in the system tray/menu bar',
      fieldName: 'showStatusBarIcon',
      value: formValues.showStatusBarIcon,
    },
    {
      // Theme selection with auto, light, and dark options
      icon: BgColorsOutlined,
      title: 'Theme',
      description: 'Choose your preferred theme',
      fieldName: 'theme',
      type: 'select',
      value: formValues.theme,
      options: [
        {
          // Auto theme follows system preference
          value: THEME_MODES.AUTO,
          label: (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <SyncOutlined style={{ fontSize: 12 }} />
              <span>Auto</span>
            </div>
          ),
        },
        {
          // Light theme always uses light colors
          value: THEME_MODES.LIGHT,
          label: (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <SunOutlined style={{ fontSize: 12 }} />
              <span>Light</span>
            </div>
          ),
        },
        {
          // Dark theme always uses dark colors
          value: THEME_MODES.DARK,
          label: (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <MoonOutlined style={{ fontSize: 12 }} />
              <span>Dark</span>
            </div>
          ),
        },
      ],
    },
    {
      // Compact interface mode for reduced spacing
      icon: CompressOutlined,
      title: 'Compact mode',
      description: 'Reduce spacing for a more compact interface',
      fieldName: 'compactMode',
      value: formValues.compactMode,
    },
    {
      // Tutorial mode shows helpful information panels
      icon: QuestionCircleOutlined,
      title: 'Tutorial mode',
      description: 'Show helpful information panels throughout the app',
      fieldName: 'tutorialMode',
      value: formValues.tutorialMode,
    },
  ],
  // Recording and workflow-related settings
  records: [
    {
      // Proxy server auto-start for seamless recording
      icon: ApiOutlined,
      title: 'Proxy Server Auto-start',
      description: 'Start automatically when app launches',
      fieldName: 'autoStartProxy',
      value: formValues.autoStartProxy,
    },
    {
      // Proxy resource caching for improved performance
      icon: DatabaseOutlined,
      title: 'Proxy Resource Cache',
      description: 'Cache resources for faster recording playback',
      fieldName: 'proxyCacheEnabled',
      value: formValues.proxyCacheEnabled,
    },
    {
      // Enable/disable recording hotkey
      icon: TrademarkCircleOutlined,
      title: 'Enable Recording Hotkey',
      description: 'Enable global keyboard shortcut for recording',
      fieldName: 'recordingHotkeyEnabled',
      value: formValues.recordingHotkeyEnabled !== undefined ? formValues.recordingHotkeyEnabled : true, // Default to true
    },
    {
      // Global hotkey for starting/stopping recording
      icon: TrademarkCircleOutlined,
      title: 'Recording Hotkey',
      description: 'Global keyboard shortcut to start/stop recording (toggles if recording is active)',
      fieldName: 'recordingHotkey',
      type: 'hotkey',
      placeholder: 'e.g., CommandOrControl+Shift+E',
      value: formValues.recordingHotkey || 'CommandOrControl+Shift+E',
      isActive: formValues.recordingHotkeyEnabled !== false,
      disabled: formValues.recordingHotkeyEnabled === false,
      tooltip: formValues.recordingHotkeyEnabled === false ? "Enable 'Recording Hotkey' to configure the shortcut" : '',
    },
    {
      // Video recording with macOS permission handling
      icon: VideoCameraOutlined,
      title: 'Video Recording',
      description: (() => {
        let desc = 'Enable screen video recording alongside session recording';
        if (screenRecordingPermission?.platform === 'darwin' && !screenRecordingPermission?.hasPermission) {
          desc += ' (Permission required - app restart may be needed)';
        }
        return desc;
      })(),
      fieldName: 'videoRecording',
      value: formValues.videoRecording,
      tooltip:
        screenRecordingPermission?.platform === 'darwin' && !screenRecordingPermission?.hasPermission
          ? 'Screen recording permission is required. macOS may require app restart after granting permission.'
          : '',
    },
    {
      // Video quality selection - dependent on video recording being enabled
      icon: SettingOutlined,
      title: 'Video Quality',
      description: 'Video workflow recording quality preset',
      fieldName: 'videoQuality',
      type: 'select',
      options: [
        { label: 'Standard (5 Mbps)', value: 'standard' },
        { label: 'High (10 Mbps)', value: 'high' },
        { label: 'Ultra (20 Mbps)', value: 'ultra' },
      ],
      isActive: formValues.videoRecording, // Only active when video recording is enabled
      disabled: !formValues.videoRecording, // Disabled when video recording is off
      tooltip: !formValues.videoRecording ? "Enable 'Video Workflow Recording' to adjust quality" : '',
      value: formValues.videoQuality || 'high',
    },
    {
      // Auto-highlight table entries during playback
      icon: HighlightOutlined,
      title: 'Auto Highlight Table entries',
      description: 'Highlight table entries based on current record timestamp',
      fieldName: 'autoHighlightTableEntries',
      value: formValues.autoHighlightTableEntries,
    },
    {
      // Auto-scroll table entries - dependent on auto-highlight being enabled
      icon: VerticalAlignMiddleOutlined,
      title: 'Auto Scroll Table entries',
      description: 'Synchronize table view based on current record timestamp',
      fieldName: 'autoScrollTableEntries',
      isActive: formValues.autoHighlightTableEntries, // Only active when auto-highlight is enabled
      disabled: !formValues.autoHighlightTableEntries, // Disabled when auto-highlight is off
      tooltip: !formValues.autoHighlightTableEntries ? "Enable 'Auto Highlight Table entries' to use this option" : '',
      value: formValues.autoScrollTableEntries,
    },
  ],
  developer: [
    {
      icon: FileTextOutlined,
      title: 'Log Level',
      description: (
        <>
          Control the verbosity of application logs{' '}
          <Tooltip
            overlayStyle={{ maxWidth: 340 }}
            title={
              <>
                <div style={{ marginBottom: 4, opacity: 0.75 }}>Each level includes all levels above it:</div>
                <div>
                  <strong>Error:</strong> <span style={{ opacity: 0.75 }}>Operation failures and exceptions</span>
                </div>
                <div>
                  <strong>Warning:</strong> <span style={{ opacity: 0.75 }}>Anomalies, retries, and fallbacks</span>
                </div>
                <div>
                  <strong>Info:</strong> <span style={{ opacity: 0.75 }}>Operational events and state changes</span>
                </div>
                <div>
                  <strong>Debug:</strong> <span style={{ opacity: 0.75 }}>Detailed internals for troubleshooting</span>
                </div>
              </>
            }
          >
            <QuestionCircleOutlined style={{ fontSize: 11, cursor: 'help' }} />
          </Tooltip>
        </>
      ),
      fieldName: 'logLevel',
      type: 'select',
      value: formValues.logLevel || 'info',
      options: [
        {
          value: 'error',
          label: (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <CloseCircleOutlined style={{ fontSize: 12, color: '#ff4d4f' }} />
              <span>Error</span>
            </div>
          ),
        },
        {
          value: 'warn',
          label: (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <WarningOutlined style={{ fontSize: 12, color: '#faad14' }} />
              <span>Warning</span>
            </div>
          ),
        },
        {
          value: 'info',
          label: (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <InfoCircleOutlined style={{ fontSize: 12, color: '#1890ff' }} />
              <span>Info (Default)</span>
            </div>
          ),
        },
        {
          value: 'debug',
          label: (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <BugOutlined style={{ fontSize: 12, color: '#52c41a' }} />
              <span>Debug</span>
            </div>
          ),
        },
      ],
    },
  ],
});

/**
 * Common styles used across settings components
 */
export const settingsStyles = {
  section: {
    fontSize: 13,
    fontWeight: 600 as const,
    marginBottom: 16,
    marginTop: 8,
  },
  tabContent: {
    height: '400px',
    overflowY: 'auto' as const,
    paddingRight: '8px',
  },
};
