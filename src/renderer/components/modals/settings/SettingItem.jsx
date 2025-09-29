import React, { forwardRef } from 'react';
import { Row, Col, Space, Switch, Select, Tooltip, Input } from 'antd';
import HotkeyInput from './HotkeyInput';

/**
 * Styles configuration for consistent setting item styling
 * 
 * All styles are functions that accept an isActive parameter to provide
 * state-dependent styling with smooth transitions between states.
 */
const styles = {
    // Row container styling with state-dependent opacity
    settingRow: (isActive = true) => ({
        marginBottom: 20,
        transition: 'opacity 0.2s ease',
        opacity: isActive ? 1 : 0.6, // Dimmed when inactive
    }),
    // Label styling with flexbox layout
    label: (isActive = true) => ({
        fontWeight: 500,
        display: 'flex',
        alignItems: 'center',
        transition: 'opacity 0.2s ease',
        opacity: isActive ? 1 : 0.6, // Dimmed when inactive
    }),
    // Icon styling with consistent spacing
    icon: (isActive = true) => ({
        marginRight: 8,
        transition: 'opacity 0.2s ease',
        opacity: isActive ? 1 : 0.6, // Dimmed when inactive
    }),
    // Description text styling with smaller font
    description: (isActive = true) => ({
        fontSize: 12,
        marginTop: 4,
        transition: 'opacity 0.2s ease',
        opacity: isActive ? 0.65 : 0.45, // More subtle dimming for description
    })
};

/**
 * SettingItem component for rendering individual settings with consistent styling
 * 
 * Provides a reusable interface for different types of settings including switches,
 * selects, and other input types. Handles state-dependent styling and tooltips.
 * 
 * Features:
 * - Consistent layout and styling across all settings
 * - Support for multiple input types (switch, select)
 * - State-dependent visual feedback (active/inactive, disabled states)
 * - Tooltip support for contextual help
 * - Responsive layout with proper spacing
 * 
 * @param {React.Component} icon - Icon component to display next to the setting
 * @param {string} title - Main title/label for the setting
 * @param {string} description - Descriptive text explaining the setting
 * @param {string} fieldName - Field name for the setting (used in onChange)
 * @param {boolean} isActive - Whether the setting should appear active/enabled
 * @param {boolean} disabled - Whether the setting control is disabled
 * @param {string} tooltip - Optional tooltip text to show on hover
 * @param {string} type - Type of input control ('switch', 'select', or 'text')
 * @param {Array} options - Options array for select type controls
 * @param {string} placeholder - Placeholder text for text input
 * @param {*} value - Current value of the setting
 * @param {function} onChange - Callback function when setting value changes
 */
const SettingItem = forwardRef(({
    icon: Icon,
    title,
    description,
    fieldName,
    isActive = true,
    disabled = false,
    tooltip,
    type = 'switch',
    options = [],
    placeholder = '',
    value,
    onChange
}, ref) => {
    /**
     * Handle setting value changes
     * @param {*} newValue - New value for the setting
     */
    const handleChange = (newValue) => {
        onChange(fieldName, newValue);
    };

    // Main setting content with responsive layout
    const content = (
        <Row style={styles.settingRow(isActive && !disabled)} align="middle" justify="space-between">
            {/* Left side: Icon, title, and description */}
            <Col span={16}>
                <div style={styles.label(isActive && !disabled && value)}>
                    <Icon style={styles.icon(isActive && !disabled && value)} />
                    <Space direction="vertical" size={0}>
                        <span>{title}</span>
                        <span style={styles.description(isActive && !disabled && value)}>{description}</span>
                    </Space>
                </div>
            </Col>
            {/* Right side: Control input (switch, select, text, or hotkey) */}
            <Col span={8} style={{ textAlign: 'right' }}>
                {type === 'switch' ? (
                    <Switch
                        checked={value}
                        onChange={handleChange}
                        disabled={disabled}
                        checkedChildren="Enabled"
                        unCheckedChildren="Disabled"
                    />
                ) : type === 'select' ? (
                    <Select
                        style={{ width: 120 }}
                        options={options}
                        value={value}
                        onChange={handleChange}
                        disabled={disabled}
                    />
                ) : type === 'text' ? (
                    <Input
                        style={{ width: 200 }}
                        placeholder={placeholder}
                        value={value}
                        onChange={(e) => handleChange(e.target.value)}
                        disabled={disabled}
                    />
                ) : type === 'hotkey' ? (
                    <HotkeyInput
                        ref={ref}
                        value={value}
                        onChange={handleChange}
                        disabled={disabled}
                    />
                ) : null}
            </Col>
        </Row>
    );

    // Wrap with tooltip if provided
    return tooltip ? (
        <Tooltip title={tooltip}>
            {content}
        </Tooltip>
    ) : content;
});

SettingItem.displayName = 'SettingItem';

export default SettingItem;