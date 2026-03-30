import type React from 'react';
import type { AppSettings, ScreenRecordingPermission } from '@/types/settings';
import SettingItem from './SettingItem';
import { getSettingsConfig, settingsStyles } from './SettingsConfig';

/**
 * AppearanceSettings component for displaying UI customization settings
 *
 * Handles visual appearance and user interface customization options including
 * theme selection, display preferences, and interface density settings.
 *
 * Features:
 * - Dock icon visibility control (macOS specific)
 * - Menu bar/system tray icon control
 * - Theme selection (Auto, Light, Dark)
 * - Compact mode for reduced spacing
 * - Tutorial mode for contextual help
 * - Developer mode for technical information
 *
 * Theme Options:
 * - Auto: Follows system theme preference
 * - Light: Always use light theme
 * - Dark: Always use dark theme
 *
 * Interface Modes:
 * - Compact mode: Reduces spacing throughout the interface
 * - Tutorial mode: Shows helpful information panels
 * - Developer mode: Displays technical debug information
 *
 *  formValues - Current form values containing all settings
 *  screenRecordingPermission - Screen recording permission state
 *  onChange - Callback function for handling setting changes
 */
interface AppearanceSettingsProps {
  formValues: Partial<AppSettings>;
  screenRecordingPermission: ScreenRecordingPermission | null;
  onChange: (key: string, value: unknown) => void;
}
const AppearanceSettings = ({ formValues, screenRecordingPermission, onChange }: AppearanceSettingsProps) => {
  // Get settings configuration for appearance section
  const settingsConfig = getSettingsConfig(formValues, screenRecordingPermission);

  /**
   * Render individual setting items
   *  items - Array of setting configuration objects
   *  Rendered setting items
   */
  const renderSettingItems = (items: ReturnType<typeof getSettingsConfig>['appearance']) => (
    <>
      {items.map((setting, index: number) => (
        <SettingItem
          key={`${setting.fieldName}-${index}`}
          {...(setting as React.ComponentProps<typeof SettingItem>)}
          onChange={onChange}
        />
      ))}
    </>
  );

  return (
    <div style={settingsStyles.tabContent}>
      <div style={settingsStyles.section}>Appearance</div>
      {renderSettingItems(settingsConfig.appearance || [])}
    </div>
  );
};

export default AppearanceSettings;
