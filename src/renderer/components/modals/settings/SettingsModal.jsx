import React, {useEffect, useState} from 'react';
import {Button, Modal, Tabs} from 'antd';
import {DesktopOutlined, GlobalOutlined, SettingOutlined} from '@ant-design/icons';
import {useTheme} from '../../../contexts';

import GeneralSettings from './GeneralSettings';
import AppearanceSettings from './AppearanceSettings';
import WorkflowSettings from './WorkflowSettings';
import PermissionAlert from './PermissionAlert';

const { createLogger } = require('../../../utils/error-handling/logger');
const log = createLogger('SettingsModal');

// Modal styles configuration
const modalStyles = {
    modal: {
        body: {
            padding: '20px 24px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif'
        }
    }
};

/**
 * SettingsModal component for application settings management
 * 
 * Main orchestrator component that provides a comprehensive interface for managing
 * application settings across different categories. Coordinates between multiple
 * settings tabs and handles complex permission flows.
 * 
 * Features:
 * - Tabbed interface with General, Appearance, and Workflow settings
 * - Screen recording permission handling for macOS
 * - Setting dependency management (e.g., launch at login → hide on start)
 * - Form validation and submission
 * - Permission alert system with user actions
 * - Proper state management and cleanup
 * 
 * Component Architecture:
 * This component acts as the main coordinator, delegating settings rendering to:
 * - GeneralSettings: Launch and startup behavior settings
 * - AppearanceSettings: Theme and UI customization settings
 * - WorkflowSettings: Recording and workflow-related settings
 * - PermissionAlert: Permission request and status alerts
 * 
 * Permission Flow:
 * - Automatically checks screen recording permissions on macOS
 * - Handles permission requests with user-friendly prompts
 * - Provides restart app functionality when permissions change
 * - Saves pending states for post-permission actions
 * 
 * @param {boolean} open - Whether the modal is visible
 * @param {Object} settings - Current settings object
 * @param {function} onCancel - Handler for modal close/cancel
 * @param {function} onSave - Handler for settings save
 * @param {string} initialTab - Initial tab to display ('1', '2', or '3')
 * @param {Object} initialAction - Initial action to perform when modal opens
 * @param {string} initialAction.action - Action type (e.g., 'toggleVideoRecording')
 * @param {*} initialAction.value - Action value
 */
const SettingsModal = ({ open, settings, onCancel, onSave, initialTab, initialAction }) => {
    // Form state management
    const [formValues, setFormValues] = useState(settings || {});
    const { themeMode, isCompactMode } = useTheme();
    
    // UI state
    const [activeTab, setActiveTab] = useState('1');
    const [screenRecordingPermission, setScreenRecordingPermission] = useState(null);
    const [permissionAlert, setPermissionAlert] = useState(null);

    // Initialize form values when modal opens
    useEffect(() => {
        if (open && settings) {
            const values = {
                ...settings,
                theme: settings.theme || themeMode,
                compactMode: settings.compactMode !== undefined ? settings.compactMode : isCompactMode
            };
            setFormValues(values);
            log.debug('Initialized form values:', values);
            
            // Set initial tab if provided
            if (initialTab) {
                setActiveTab(initialTab);
            }
        }
    }, [open, settings, themeMode, isCompactMode, initialTab]);

    // Don't check screen recording permission on modal open to avoid triggering popups
    // We'll only check when user actually tries to enable video recording
    useEffect(() => {
        if (open) {
            // Set platform info without checking permission
            setScreenRecordingPermission({
                hasPermission: null, // Unknown until we actually check
                platform: window.electronAPI?.platform || 'unknown'
            });
        }
    }, [open]);

    // Handle initial actions when modal opens
    useEffect(() => {
        if (open && initialAction) {
            if (initialAction.action === 'toggleVideoRecording') {
                // Wait for modal to fully render before triggering action
                setTimeout(async () => {
                    try {
                        const requestedValue = initialAction.value;
                        
                        // Apply the change with auto-save flag
                        // This will handle permission checking and auto-save if successful
                        await handleFieldChange('videoRecording', requestedValue, true);
                        
                        // handleFieldChange will handle the auto-save internally if successful
                        // If permission wasn't granted, modal stays open for user to handle manually
                        
                    } catch (error) {
                        console.error('Error handling toggleVideoRecording action:', error);
                    }
                }, 300);
            } else if (initialAction.action === 'toggleRecordingHotkey') {
                // Wait for modal to fully render before triggering action
                setTimeout(async () => {
                    try {
                        const requestedValue = initialAction.value;
                        
                        // Apply the change with auto-save flag
                        await handleFieldChange('recordingHotkeyEnabled', requestedValue, true);
                        
                        // handleFieldChange will handle the auto-save internally
                        
                    } catch (error) {
                        console.error('Error handling toggleRecordingHotkey action:', error);
                    }
                }, 300);
            }
        }
    }, [open, initialAction]);

    /**
     * Handle individual field changes with dependency management
     * @param {string} fieldName - Name of the field being changed
     * @param {*} value - New value for the field
     * @param {boolean} autoSave - Whether to auto-save after successful change
     * @returns {Promise<boolean>} True if the field was successfully changed
     */
    const handleFieldChange = async (fieldName, value, autoSave = false) => {
        // Handle screen recording permission for video recording
        if (fieldName === 'videoRecording' && value) {
            try {
                const hasPermission = await handleVideoRecordingPermission();
                if (!hasPermission) {
                    // Don't update the form values if permission denied
                    return false; // Permission not granted, don't enable video recording
                }
            } catch (error) {
                log.error('Error handling video recording permission:', error);
                return false; // Don't enable video recording if permission check fails
            }
        }

        let newValues = { ...formValues, [fieldName]: value };

        // Apply setting dependencies
        newValues = applySettingDependencies(newValues, fieldName, value);

        setFormValues(newValues);
        log.debug(`Field changed: ${fieldName} = ${value}`);
        
        // If auto-save is requested and we got here, save the settings
        if (autoSave) {
            // Use the new values directly for save since state might not be updated yet
            setTimeout(() => {
                handleSubmitWithValues(newValues);
            }, 300);
        }
        
        return true; // Field was successfully changed
    };

    /**
     * Handle video recording permission checks and requests
     * @returns {Promise<boolean>} True if permission is granted, false otherwise
     */
    const handleVideoRecordingPermission = async () => {
        try {
            // Directly request permission - this will check current status first
            // and only show dialog if needed
            const permissionRequest = await window.electronAPI.requestScreenRecordingPermission();
            
            if (!permissionRequest.success || !permissionRequest.hasPermission) {
                // Permission denied - show platform-specific instructions
                handlePermissionDenied({ platform: permissionRequest.platform }, permissionRequest);
                return false;
            } else {
                // Permission granted - update state
                setScreenRecordingPermission({
                    hasPermission: true,
                    platform: permissionRequest.platform
                });
                return true;
            }
        } catch (error) {
            log.error('Error handling screen recording permission:', error);
            return false;
        }
    };

    /**
     * Handle permission denied scenario with user-friendly alerts
     * @param {Object} permissionCheck - Initial permission check result
     * @param {Object} permissionRequest - Permission request result
     */
    const handlePermissionDenied = (permissionCheck, permissionRequest) => {
        log.warn('Screen recording permission denied');
        
        // Update permission state
        setScreenRecordingPermission({
            hasPermission: false,
            platform: permissionRequest.platform || permissionCheck.platform
        });
        
        // Show platform-specific instructions for macOS
        if (permissionCheck.platform === 'darwin') {
            const description = permissionRequest.needsManualGrant
                ? 'System Preferences has been opened. Please enable screen recording for Open Headers. Note: macOS may require restarting the app after granting permission.'
                : 'Please grant screen recording permission in System Preferences > Privacy & Security > Screen Recording. Note: macOS may require restarting the app after granting permission.';
            
            // Save pending video recording preference
            const updatedSettings = { ...formValues, pendingVideoRecording: true };
            window.electronAPI.saveSettings(updatedSettings).then(() => {
                log.debug('Saved pendingVideoRecording flag');
            });
            
            // Show permission alert with restart option
            setPermissionAlert({
                type: 'warning',
                message: 'Screen Recording Permission Required',
                description,
                action: {
                    text: 'Restart App',
                    onClick: () => {
                        window.electronAPI.restartApp();
                    }
                }
            });
        }
    };

    /**
     * Apply setting dependencies and rules
     * @param {Object} newValues - New form values
     * @param {string} fieldName - Field being changed
     * @param {*} value - New value
     * @returns {Object} Updated form values with dependencies applied
     */
    const applySettingDependencies = (newValues, fieldName, value) => {
        const updatedValues = { ...newValues };

        // Dependency: if launchAtLogin is false, hideOnLaunch must be false
        if (fieldName === 'launchAtLogin' && !value) {
            updatedValues.hideOnLaunch = false;
            log.debug('Disabled hideOnLaunch due to launchAtLogin being disabled');
        }

        // Dependency: if autoHighlightTableEntries is false, autoScrollTableEntries must be false
        if (fieldName === 'autoHighlightTableEntries' && !value) {
            updatedValues.autoScrollTableEntries = false;
            log.debug('Disabled autoScrollTableEntries due to autoHighlightTableEntries being disabled');
        }

        // Dependency: if videoRecording is false, reset videoQuality to default
        if (fieldName === 'videoRecording' && !value) {
            updatedValues.videoQuality = 'high';
            log.debug('Reset videoQuality to high due to videoRecording being disabled');
        }

        return updatedValues;
    };

    /**
     * Handle form submission with specific values
     * @param {Object} valuesToSave - Optional specific values to save (defaults to formValues)
     */
    const handleSubmitWithValues = (valuesToSave) => {
        try {
            // Use provided values or current form values
            let finalValues = { ...(valuesToSave || formValues) };
            
            // Ensure all dependency rules are enforced
            if (!finalValues.launchAtLogin) {
                finalValues.hideOnLaunch = false;
            }
            if (!finalValues.autoHighlightTableEntries) {
                finalValues.autoScrollTableEntries = false;
            }
            
            // Clear pending video recording flag
            if (finalValues.hasOwnProperty('pendingVideoRecording')) {
                delete finalValues.pendingVideoRecording;
            }

            log.debug('Submitting settings:', finalValues);
            onSave(finalValues);
        } catch (error) {
            log.error('Error saving settings:', error);
        }
    };
    
    /**
     * Handle form submission with validation and cleanup
     */
    const handleSubmit = () => {
        handleSubmitWithValues(formValues);
    };

    // Tab configuration
    const tabItems = [
        {
            key: '1',
            label: (
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <SettingOutlined />
                    General
                </span>
            ),
            children: (
                <GeneralSettings
                    formValues={formValues}
                    screenRecordingPermission={screenRecordingPermission}
                    onChange={handleFieldChange}
                />
            )
        },
        {
            key: '2',
            label: (
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <DesktopOutlined />
                    Appearance
                </span>
            ),
            children: (
                <AppearanceSettings
                    formValues={formValues}
                    screenRecordingPermission={screenRecordingPermission}
                    onChange={handleFieldChange}
                />
            )
        },
        {
            key: '3',
            label: (
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <GlobalOutlined />
                    Workflows
                </span>
            ),
            children: (
                <WorkflowSettings
                    formValues={formValues}
                    screenRecordingPermission={screenRecordingPermission}
                    onChange={handleFieldChange}
                    initialAction={initialAction}
                />
            )
        }
    ];

    return (
        <Modal
            title="Settings"
            open={open}
            onCancel={onCancel}
            width={500}
            className="settings-modal"
            footer={[
                <Button key="cancel" onClick={onCancel}>
                    Cancel
                </Button>,
                <Button key="save" type="primary" onClick={handleSubmit}>
                    Save
                </Button>
            ]}
            centered
            styles={modalStyles.modal}
            destroyOnClose
        >
            <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif' }}>
                <PermissionAlert
                    permissionAlert={permissionAlert}
                    onClose={() => setPermissionAlert(null)}
                />
                <Tabs
                    activeKey={activeTab}
                    onChange={setActiveTab}
                    items={tabItems}
                    style={{ height: '100%' }}
                />
            </div>
        </Modal>
    );
};

export default SettingsModal;