import React from 'react';
import SettingItem from './SettingItem';
import { getSettingsConfig, settingsStyles } from './SettingsConfig';

/**
 * GeneralSettings component for displaying general application settings
 * 
 * Handles core application behavior settings such as launch preferences
 * and startup behavior. This includes settings like auto-launch at login
 * and hiding the app on startup.
 * 
 * Features:
 * - Auto-launch at login configuration
 * - Hide on start option (dependent on launch at login)
 * - Dependency handling between related settings
 * - Consistent styling and layout
 * 
 * Dependencies:
 * - "Hide on start" depends on "Open at login" being enabled
 * - When "Open at login" is disabled, "Hide on start" is automatically disabled
 * 
 * @param {Object} formValues - Current form values containing all settings
 * @param {Object} screenRecordingPermission - Screen recording permission state
 * @param {function} onChange - Callback function for handling setting changes
 */
const GeneralSettings = ({ formValues, screenRecordingPermission, onChange }) => {
    // Get settings configuration for general section
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
            <div style={settingsStyles.section}>General</div>
            {renderSettingItems(settingsConfig.general)}
        </div>
    );
};

export default GeneralSettings;