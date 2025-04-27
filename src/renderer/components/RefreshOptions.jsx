import React, { useState, useRef, useEffect } from 'react';
import { Select, Button, Checkbox, Space, Radio, InputNumber, message, Switch, Typography } from 'antd';

const { Option } = Select;
const { Text } = Typography;

/**
 * RefreshOptions component for configuring HTTP auto-refresh
 */
const RefreshOptions = ({ source, onSave, onCancel }) => {
    // Use ref to track if component is mounted
    const isMountedRef = useRef(true);
    // Reference to track if success message has been shown
    const successMessageShownRef = useRef(false);

    // Create immutable snapshot of source on first render using ref
    const sourceRef = useRef(null);
    if (sourceRef.current === null && source) {
        // Deep clone the source to avoid reference issues
        sourceRef.current = JSON.parse(JSON.stringify(source));
    }

    // Use the immutable reference for initialization
    const sourceSnapshot = sourceRef.current;

    // Initialize all state variables directly
    const isEnabled = sourceSnapshot?.refreshOptions?.enabled || (sourceSnapshot?.refreshOptions?.interval > 0);

    // Set interval and type based on source
    let initialType = 'preset';
    let initialInterval = 15;
    let initialCustomInterval = 15;

    if (sourceSnapshot?.refreshOptions?.interval > 0) {
        const sourceInterval = sourceSnapshot.refreshOptions.interval;
        const presetValues = [1, 5, 15, 30, 60, 120, 360, 720, 1440];

        if (sourceSnapshot.refreshOptions.type === 'custom' || !presetValues.includes(sourceInterval)) {
            initialType = 'custom';
            initialCustomInterval = sourceInterval;
        } else {
            initialType = 'preset';
            initialInterval = sourceInterval;
        }
    }

    // State declarations with initial values set directly
    const [refreshEnabled, setRefreshEnabled] = useState(isEnabled);
    const [refreshType, setRefreshType] = useState(initialType);
    const [interval, setInterval] = useState(initialInterval);
    const [customInterval, setCustomInterval] = useState(initialCustomInterval);
    // Always start with refreshNow checked by default (fix #1)
    const [refreshNow, setRefreshNow] = useState(true);
    const [saving, setSaving] = useState(false);

    // Setup and cleanup for mounted state tracking
    useEffect(() => {
        isMountedRef.current = true;
        successMessageShownRef.current = false;

        return () => {
            // Set the flag to false when component unmounts
            isMountedRef.current = false;
        };
    }, []);

    // Handle toggle
    const handleRefreshToggle = (checked) => {
        if (!isMountedRef.current) return;

        setRefreshEnabled(checked);

        // If toggled to enabled, ensure "Use preset interval" is selected
        if (checked) {
            setRefreshType('preset');

            // If no valid interval is set, default to 15 minutes
            if (!interval || interval <= 0) {
                setInterval(15);
            }
        }
    };

    // Handle refresh type change
    const handleRefreshTypeChange = (e) => {
        if (!isMountedRef.current) return;

        const newType = e.target.value;
        setRefreshType(newType);

        // If switching to preset, find closest preset value
        if (newType === 'preset') {
            const presetValues = [1, 5, 15, 30, 60, 120, 360, 720, 1440];
            if (!presetValues.includes(interval)) {
                // Find the closest preset value
                const closest = presetValues.reduce((prev, curr) => {
                    return (Math.abs(curr - customInterval) < Math.abs(prev - customInterval) ? curr : prev);
                });

                // Set the interval to the closest preset value
                setInterval(closest);
            }
        }
    };

    // Handle checkbox change - completely separate from any form
    const handleRefreshNowChange = (e) => {
        if (!isMountedRef.current) return;

        const isChecked = e.target.checked;
        console.log("RefreshNow checkbox changed to:", isChecked);
        setRefreshNow(isChecked);
    };

    // Handle save - not using form submission
    const handleSave = async () => {
        try {
            // Check if component is still mounted before proceeding
            if (!isMountedRef.current) return;

            setSaving(true);
            // Reset success message flag
            successMessageShownRef.current = false;

            // Determine the actual interval to use (0 if disabled)
            const actualInterval = refreshEnabled
                ? (refreshType === 'preset' ? interval : customInterval)
                : 0;

            console.log("Saving refresh options:", {
                interval: actualInterval,
                enabled: refreshEnabled,
                type: refreshType,
                refreshNow: refreshNow
            });

            // Create refresh options object with explicit boolean
            const refreshOptions = {
                interval: actualInterval,
                enabled: refreshEnabled,
                type: refreshType,
                refreshNow: refreshNow // Use component state directly
            };

            // Call parent save handler if component is still mounted
            if (isMountedRef.current) {
                const success = await onSave(sourceSnapshot.sourceId, refreshOptions);

                // If save was successful and component is still mounted
                if (success && isMountedRef.current) {
                    // If refreshing immediately, we need to wait longer
                    if (refreshNow) {
                        console.log("Waiting for refresh to complete before closing modal...");

                        // Keep the saving state active while we wait
                        // Wait 2 seconds to allow the refresh to complete
                        await new Promise(resolve => setTimeout(resolve, 2000));

                        console.log("Refresh wait completed, closing modal now");

                        // Now we can safely close the modal
                        if (isMountedRef.current) {
                            // Close the modal first (don't show success message yet)
                            onCancel();

                            // Show success message after a small delay to ensure modal is gone
                            setTimeout(() => {
                                if (!successMessageShownRef.current) {
                                    successMessageShownRef.current = true;
                                    message.success('Refresh options updated successfully');
                                }
                            }, 300);
                        }
                    } else {
                        // If not refreshing, we can close immediately
                        onCancel();

                        // Show success message after a small delay to ensure modal is gone
                        setTimeout(() => {
                            if (!successMessageShownRef.current) {
                                successMessageShownRef.current = true;
                                message.success('Refresh options updated successfully');
                            }
                        }, 300);
                    }
                }
            }
        } catch (error) {
            // Show error message if something went wrong and component is still mounted
            if (isMountedRef.current) {
                message.error(`Failed to save refresh options: ${error.message}`);
                console.error('Save error:', error);
            }
        } finally {
            // Only update state if component is still mounted
            if (isMountedRef.current) {
                setSaving(false);
            }
        }
    };

    // Handle cancel
    const handleCancel = () => {
        onCancel();
    };

    return (
        <div>
            <div style={{ marginBottom: 16 }}>
                <Text strong>Auto-Refresh</Text>
                <div style={{ marginTop: 8 }}>
                    <Switch
                        checked={refreshEnabled}
                        onChange={handleRefreshToggle}
                        checkedChildren="Enabled"
                        unCheckedChildren="Disabled"
                    />
                </div>
            </div>

            {refreshEnabled && (
                <>
                    <div style={{ marginBottom: 16 }}>
                        <Text strong>Refresh Type</Text>
                        <div style={{ marginTop: 8 }}>
                            <Radio.Group
                                onChange={handleRefreshTypeChange}
                                value={refreshType}
                            >
                                <Radio value="preset">Use preset interval</Radio>
                                <Radio value="custom">Custom interval</Radio>
                            </Radio.Group>
                        </div>
                    </div>

                    {refreshType === 'preset' ? (
                        <div style={{ marginBottom: 16 }}>
                            <Text strong>Refresh Interval</Text>
                            <div style={{ marginTop: 8 }}>
                                <Select
                                    value={interval}
                                    onChange={(value) => {
                                        if (isMountedRef.current) setInterval(value);
                                    }}
                                    style={{ width: '100%' }}
                                >
                                    <Option value={1}>Every 1 minute</Option>
                                    <Option value={5}>Every 5 minutes</Option>
                                    <Option value={15}>Every 15 minutes</Option>
                                    <Option value={30}>Every 30 minutes</Option>
                                    <Option value={60}>Every hour</Option>
                                    <Option value={120}>Every 2 hours</Option>
                                    <Option value={360}>Every 6 hours</Option>
                                    <Option value={720}>Every 12 hours</Option>
                                    <Option value={1440}>Every 24 hours</Option>
                                </Select>
                            </div>
                        </div>
                    ) : (
                        <div style={{ marginBottom: 16 }}>
                            <Text strong>Custom Interval (minutes)</Text>
                            <div style={{ marginTop: 8 }}>
                                <InputNumber
                                    min={1}
                                    max={10080} // 7 days in minutes
                                    value={customInterval}
                                    onChange={(value) => {
                                        if (isMountedRef.current) setCustomInterval(value);
                                    }}
                                    style={{ width: '100%' }}
                                />
                            </div>
                            <div style={{ marginTop: 4 }}>
                                <Text type="secondary">Enter a custom refresh interval in minutes</Text>
                            </div>
                        </div>
                    )}

                    <div style={{ marginBottom: 24 }}>
                        <Checkbox
                            checked={refreshNow}
                            onChange={handleRefreshNowChange}
                        >
                            Refresh immediately after saving
                        </Checkbox>
                    </div>
                </>
            )}

            <div style={{ marginTop: 24 }}>
                <Space>
                    <Button onClick={handleCancel}>Cancel</Button>
                    <Button
                        type="primary"
                        onClick={handleSave}
                        loading={saving}
                    >
                        Save
                    </Button>
                </Space>
            </div>
        </div>
    );
};

export default RefreshOptions;