import React from 'react';
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
 * @param {Object} formValues - Current form values containing all settings
 * @param {Object} screenRecordingPermission - Screen recording permission state
 * @param {function} onChange - Callback function for handling setting changes
 */
const AppearanceSettings = ({ formValues, screenRecordingPermission, onChange }) => {
    // Get settings configuration for appearance section
    const settingsConfig = getSettingsConfig(formValues, screenRecordingPermission);

    /**
     * Render individual setting items
     * @param {Array} items - Array of setting configuration objects
     * @returns {React.ReactNode} Rendered setting items
     */
    const renderSettingItems = (items) => (
        <>
            {items.map((setting, index) => (
                <SettingItem
                    key={`${setting.fieldName}-${index}`}
                    {...setting}
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