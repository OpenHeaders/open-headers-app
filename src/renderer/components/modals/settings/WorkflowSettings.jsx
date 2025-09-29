import React, { useRef, useEffect } from 'react';
import SettingItem from './SettingItem';
import { getSettingsConfig, settingsStyles } from './SettingsConfig';

/**
 * WorkflowSettings component for displaying workflow and recording settings
 * 
 * Handles settings related to recording workflows, proxy server configuration,
 * video recording capabilities, and table interaction behaviors.
 * 
 * Features:
 * - Proxy server auto-start configuration
 * - Proxy resource cache management
 * - Video recording with permission handling
 * - Video quality presets (Standard, High, Ultra)
 * - Auto-highlight table entries during playback
 * - Auto-scroll table entries synchronized with playback
 * 
 * Dependencies:
 * - Video quality depends on video recording being enabled
 * - Auto-scroll depends on auto-highlight being enabled
 * - Video recording may require screen recording permissions (macOS)
 * 
 * Permission Handling:
 * - Automatically checks for screen recording permissions on macOS
 * - Shows appropriate tooltips when permissions are required
 * - Gracefully handles permission request flows
 * 
 * @param {Object} formValues - Current form values containing all settings
 * @param {Object} screenRecordingPermission - Screen recording permission state
 * @param {function} onChange - Callback function for handling setting changes
 */
const WorkflowSettings = ({ formValues, screenRecordingPermission, onChange, initialAction }) => {
    // Get settings configuration for workflows section
    const settingsConfig = getSettingsConfig(formValues, screenRecordingPermission);
    const hotkeyRef = useRef(null);

    // Handle initial action to trigger hotkey edit
    useEffect(() => {
        if (initialAction && initialAction.action === 'editHotkey') {
            // Wait for component to mount and then trigger edit
            setTimeout(() => {
                if (hotkeyRef.current && hotkeyRef.current.triggerEdit) {
                    hotkeyRef.current.triggerEdit();
                }
            }, 500); // Give time for modal to fully render
        }
    }, [initialAction]);

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
                    ref={setting.fieldName === 'recordingHotkey' ? hotkeyRef : null}
                    {...setting}
                    onChange={onChange}
                />
            ))}
        </>
    );

    return (
        <div style={settingsStyles.tabContent}>
            <div style={settingsStyles.section}>Workflows</div>
            {renderSettingItems(settingsConfig.records || [])}
        </div>
    );
};

export default WorkflowSettings;