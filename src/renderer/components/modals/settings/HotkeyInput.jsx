import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { Input, Button, Space, Tag, Modal, Alert } from 'antd';
import { EditOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';

// Forbidden key combinations that conflict with system/browser shortcuts
const FORBIDDEN_COMBINATIONS = [
    // Browser shortcuts
    { keys: ['CommandOrControl', 'T'], reason: 'Opens new tab' },
    { keys: ['CommandOrControl', 'N'], reason: 'Opens new window' },
    { keys: ['CommandOrControl', 'W'], reason: 'Closes tab' },
    { keys: ['CommandOrControl', 'Shift', 'T'], reason: 'Reopens closed tab' },
    { keys: ['CommandOrControl', 'Shift', 'N'], reason: 'Opens incognito window' },
    { keys: ['CommandOrControl', 'Shift', 'W'], reason: 'Closes window' },
    { keys: ['CommandOrControl', 'R'], reason: 'Reloads page' },
    { keys: ['CommandOrControl', 'Shift', 'R'], reason: 'Hard reload' },
    { keys: ['CommandOrControl', 'D'], reason: 'Bookmarks page' },
    { keys: ['CommandOrControl', 'Shift', 'D'], reason: 'Bookmarks all tabs' },
    { keys: ['CommandOrControl', 'L'], reason: 'Focuses address bar' },
    { keys: ['CommandOrControl', 'K'], reason: 'Search' },
    { keys: ['CommandOrControl', 'F'], reason: 'Find in page' },
    { keys: ['CommandOrControl', 'G'], reason: 'Find next' },
    { keys: ['CommandOrControl', 'Shift', 'G'], reason: 'Find previous' },
    { keys: ['CommandOrControl', 'H'], reason: 'History' },
    { keys: ['CommandOrControl', 'J'], reason: 'Downloads' },
    { keys: ['CommandOrControl', 'Shift', 'J'], reason: 'JavaScript console' },
    { keys: ['CommandOrControl', 'Shift', 'C'], reason: 'Inspect element' },
    { keys: ['CommandOrControl', 'Shift', 'I'], reason: 'Developer tools' },
    { keys: ['CommandOrControl', 'P'], reason: 'Print' },
    { keys: ['CommandOrControl', 'S'], reason: 'Save page' },
    { keys: ['CommandOrControl', 'O'], reason: 'Open file' },
    { keys: ['CommandOrControl', 'U'], reason: 'View source' },
    { keys: ['CommandOrControl', 'Shift', 'Delete'], reason: 'Clear browsing data' },
    { keys: ['Alt', 'CommandOrControl', 'I'], reason: 'Developer tools' },
    
    // System shortcuts (Windows/Linux)
    { keys: ['Alt', 'F4'], reason: 'Closes application' },
    { keys: ['Alt', 'Tab'], reason: 'Switch applications' },
    { keys: ['Alt', 'Shift', 'Tab'], reason: 'Switch applications (reverse)' },
    { keys: ['Control', 'Alt', 'Delete'], reason: 'System menu' },
    { keys: ['Control', 'Shift', 'Escape'], reason: 'Task Manager' },
    { keys: ['Windows'], reason: 'Start menu' },
    { keys: ['Windows', 'L'], reason: 'Lock screen' },
    { keys: ['Windows', 'D'], reason: 'Show desktop' },
    { keys: ['Windows', 'E'], reason: 'File Explorer' },
    { keys: ['Windows', 'R'], reason: 'Run dialog' },
    { keys: ['Windows', 'S'], reason: 'Search' },
    { keys: ['Windows', 'I'], reason: 'Settings' },
    { keys: ['Windows', 'X'], reason: 'Quick Link menu' },
    { keys: ['Windows', 'Tab'], reason: 'Task view' },
    { keys: ['Windows', 'Shift', 'S'], reason: 'Screenshot tool' },
    { keys: ['Windows', 'Plus'], reason: 'Magnifier zoom in' },
    { keys: ['Windows', 'Minus'], reason: 'Magnifier zoom out' },
    { keys: ['Alt', 'Space'], reason: 'Window menu' },
    
    // System shortcuts (macOS)
    { keys: ['Command', 'Q'], reason: 'Quit application' },
    { keys: ['Command', 'M'], reason: 'Minimize window' },
    { keys: ['Command', 'H'], reason: 'Hide application' },
    { keys: ['Command', 'Option', 'H'], reason: 'Hide others' },
    { keys: ['Command', 'Space'], reason: 'Spotlight search' },
    { keys: ['Command', 'Tab'], reason: 'Switch applications' },
    { keys: ['Command', 'Shift', 'Tab'], reason: 'Switch applications (reverse)' },
    { keys: ['Command', 'Option', 'Escape'], reason: 'Force quit' },
    { keys: ['Command', 'Shift', '3'], reason: 'Screenshot' },
    { keys: ['Command', 'Shift', '4'], reason: 'Screenshot selection' },
    { keys: ['Command', 'Shift', '5'], reason: 'Screenshot/recording options' },
    { keys: ['Command', 'Comma'], reason: 'Preferences' },
    { keys: ['Command', 'Option', 'D'], reason: 'Show/hide Dock' },
    { keys: ['Command', 'Control', 'F'], reason: 'Fullscreen' },
    { keys: ['Command', 'Control', 'Space'], reason: 'Emoji picker' },
    { keys: ['Command', 'Option', 'I'], reason: 'Developer tools (Safari)' },
    { keys: ['Command', 'Option', 'C'], reason: 'Developer console (Safari)' },
    { keys: ['Command', 'Shift', 'Delete'], reason: 'Empty Trash' },
    
    // Function keys that might conflict
    { keys: ['F1'], reason: 'Help' },
    { keys: ['F5'], reason: 'Refresh' },
    { keys: ['F11'], reason: 'Fullscreen' },
    { keys: ['F12'], reason: 'Developer tools' },
];

/**
 * Format hotkey for display as tags based on platform
 */
const formatHotkeyForDisplay = (hotkey) => {
    if (!hotkey) return [];
    
    // Detect platform
    const isMac = navigator?.platform?.toLowerCase().includes('mac') || 
                  window?.electronAPI?.platform === 'darwin';
    
    // Split the hotkey and replace CommandOrControl
    const parts = hotkey.split('+').map(part => {
        const trimmed = part.trim();
        if (trimmed === 'CommandOrControl') {
            return isMac ? 'Cmd' : 'Ctrl';
        }
        if (trimmed === 'Command') return 'Cmd';
        if (trimmed === 'Control') return 'Ctrl';
        return trimmed;
    });
    
    return parts;
};

/**
 * Normalize key combination for comparison
 */
const normalizeKeys = (keys) => {
    return keys.map(key => {
        if (key === 'CommandOrControl' || key === 'Command' || key === 'Control' || key === 'Cmd' || key === 'Ctrl') {
            return 'CommandOrControl';
        }
        if (key === 'Windows' || key === 'Meta') {
            return 'Windows';
        }
        return key;
    }).sort().join('+');
};

/**
 * Check if a key combination is forbidden
 */
const isForbiddenCombination = (keys) => {
    const normalizedInput = normalizeKeys(keys);
    
    for (const forbidden of FORBIDDEN_COMBINATIONS) {
        const normalizedForbidden = normalizeKeys(forbidden.keys);
        if (normalizedInput === normalizedForbidden) {
            return forbidden.reason;
        }
    }
    
    return null;
};

/**
 * HotkeyInput component for capturing and validating keyboard shortcuts
 */
const HotkeyInput = forwardRef(({ value, onChange, disabled }, ref) => {
    const [isEditing, setIsEditing] = useState(false);
    const [currentKeys, setCurrentKeys] = useState([]);
    const [capturedHotkey, setCapturedHotkey] = useState('');
    const [error, setError] = useState('');
    const inputRef = useRef(null);
    const isMac = navigator?.platform?.toLowerCase().includes('mac') || 
                  window?.electronAPI?.platform === 'darwin';

    // Expose handleEdit method to parent components
    useImperativeHandle(ref, () => ({
        triggerEdit: () => {
            if (!disabled && !isEditing) {
                handleEdit();
            }
        }
    }), [disabled, isEditing]);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            // Use setTimeout with a delay to ensure modal is fully rendered and visible
            // This prevents keyboard shortcuts from being captured by Electron before focus
            setTimeout(() => {
                if (inputRef.current) {
                    inputRef.current.focus();
                    // Force focus by clicking
                    inputRef.current.click();
                    // Double-check focus
                    if (document.activeElement !== inputRef.current) {
                        inputRef.current.focus();
                    }
                }
            }, 200);  // Delay to ensure modal is ready
        }
    }, [isEditing]);

    const handleKeyDown = (e) => {
        if (!isEditing) return;
        
        
        // Always prevent default for ALL key combinations when editing
        // This stops browser shortcuts from executing
        e.preventDefault();
        e.stopPropagation();
        // stopImmediatePropagation is only available on native events, not React synthetic events
        if (e.nativeEvent && e.nativeEvent.stopImmediatePropagation) {
            e.nativeEvent.stopImmediatePropagation();
        }
        
        const keys = [];
        
        // Capture modifier keys - simple approach
        // Also check if the key itself is Meta/Command
        if (e.metaKey || e.ctrlKey || e.key === 'Meta' || e.key === 'Command') {
            keys.push('CommandOrControl');
        }
        if (e.altKey || e.key === 'Alt') {
            keys.push('Alt');
        }
        if (e.shiftKey || e.key === 'Shift') {
            keys.push('Shift');
        }
        
        // Capture the main key (if not a modifier)
        const key = e.key;
        if (!['Control', 'Alt', 'Shift', 'Meta', 'Command'].includes(key)) {
            // Normalize key names
            let normalizedKey = key;
            if (key.length === 1) {
                normalizedKey = key.toUpperCase();
            } else if (key === 'ArrowUp') {
                normalizedKey = 'Up';
            } else if (key === 'ArrowDown') {
                normalizedKey = 'Down';
            } else if (key === 'ArrowLeft') {
                normalizedKey = 'Left';
            } else if (key === 'ArrowRight') {
                normalizedKey = 'Right';
            } else if (key === ' ') {
                normalizedKey = 'Space';
            }
            
            if (normalizedKey !== 'Escape' && normalizedKey !== 'Enter') {
                keys.push(normalizedKey);
            }
        }
        
        // Check for at least one modifier and one regular key
        if (keys.length >= 2 && keys.some(k => k !== 'CommandOrControl' && k !== 'Alt' && k !== 'Shift')) {
            setCurrentKeys(keys);
            const hotkeyString = keys.join('+');
            
            // Check if combination is forbidden
            const forbiddenReason = isForbiddenCombination(keys);
            if (forbiddenReason) {
                setError(`This combination conflicts with: ${forbiddenReason}`);
                setCapturedHotkey('');
            } else {
                setError('');
                setCapturedHotkey(hotkeyString);
            }
        }
        
        // Handle Escape to cancel (but don't prevent default for Escape)
        if (key === 'Escape') {
            handleCancel();
            return;
        }
        
        // Handle Enter to save (if valid)
        if (key === 'Enter' && capturedHotkey && !error) {
            handleSave();
        }
    };

    const handleKeyUp = (e) => {
        if (!isEditing) return;
        e.preventDefault();
        e.stopPropagation();
    };

    const handleEdit = async () => {
        // Temporarily disable the global hotkey while editing
        if (window.electronAPI?.disableRecordingHotkey) {
            await window.electronAPI.disableRecordingHotkey();
        }
        setIsEditing(true);
        setCurrentKeys([]);
        setCapturedHotkey('');
        setError('');
    };

    const handleSave = async () => {
        if (capturedHotkey && !error) {
            onChange(capturedHotkey);
            setIsEditing(false);
            setCurrentKeys([]);
            setCapturedHotkey('');
            setError('');
            // Re-enable the global hotkey after saving
            if (window.electronAPI?.enableRecordingHotkey) {
                await window.electronAPI.enableRecordingHotkey();
            }
        }
    };

    const handleCancel = async () => {
        setIsEditing(false);
        setCurrentKeys([]);
        setCapturedHotkey('');
        setError('');
        // Re-enable the global hotkey after canceling
        if (window.electronAPI?.enableRecordingHotkey) {
            await window.electronAPI.enableRecordingHotkey();
        }
    };

    if (isEditing) {
        return (
            <Modal
                title="Set Recording Hotkey"
                open={isEditing}
                onCancel={handleCancel}
                autoFocusButton={null}
                focusTriggerAfterClose={false}
                footer={[
                    <Button key="cancel" onClick={handleCancel}>
                        Cancel
                    </Button>,
                    <Button 
                        key="save" 
                        type="primary" 
                        onClick={handleSave}
                        disabled={!capturedHotkey || !!error}
                    >
                        Save
                    </Button>
                ]}
                width={500}
            >
                <Space direction="vertical" style={{ width: '100%' }} size="large">
                    <Alert
                        message="Press your desired key combination"
                        description={`Use ${isMac ? 'Cmd' : 'Ctrl'}, Alt, or Shift with any letter or number key`}
                        type="info"
                        showIcon
                    />
                    
                    <div 
                        ref={inputRef}
                        tabIndex={0}
                        autoFocus
                        onKeyDown={handleKeyDown}
                        onKeyUp={handleKeyUp}
                        style={{
                            padding: '20px',
                            border: '2px solid #1890ff',
                            borderRadius: '8px',
                            backgroundColor: '#f0f8ff',
                            textAlign: 'center',
                            outline: 'none',
                            cursor: 'pointer'
                        }}
                    >
                        {currentKeys.length > 0 ? (
                            <Space size={8}>
                                {formatHotkeyForDisplay(currentKeys.join('+')).map((key, index) => (
                                    <Tag 
                                        key={index}
                                        color="blue"
                                        style={{ 
                                            margin: 0,
                                            padding: '6px 12px',
                                            fontSize: '16px',
                                            fontWeight: 500
                                        }}
                                    >
                                        {key}
                                    </Tag>
                                ))}
                            </Space>
                        ) : (
                            <span style={{ color: '#8c8c8c', fontSize: '14px' }}>
                                Waiting for key combination...
                            </span>
                        )}
                    </div>
                    
                    {error && (
                        <Alert
                            message="Invalid Combination"
                            description={error}
                            type="error"
                            showIcon
                        />
                    )}
                    
                    {capturedHotkey && !error && (
                        <Alert
                            message="Valid Combination"
                            description="Press Enter to save or continue pressing keys to change"
                            type="success"
                            showIcon
                        />
                    )}
                </Space>
            </Modal>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <Space size={4}>
                {formatHotkeyForDisplay(value).map((key, index) => (
                    <Tag 
                        key={index}
                        style={{ 
                            margin: 0,
                            padding: '4px 10px',
                            fontSize: '13px',
                            fontWeight: 500,
                            backgroundColor: '#f0f0f0',
                            border: '1px solid #d9d9d9',
                            borderRadius: '6px',
                            color: '#262626'
                        }}
                    >
                        {key}
                    </Tag>
                ))}
            </Space>
            <Button
                type="link"
                icon={<EditOutlined />}
                size="small"
                onClick={handleEdit}
                disabled={disabled}
                style={{ 
                    padding: '0 4px',
                    height: '20px',
                    fontSize: '12px',
                    color: '#1890ff'
                }}
            >
                Edit
            </Button>
        </div>
    );
});

HotkeyInput.displayName = 'HotkeyInput';

export default HotkeyInput;