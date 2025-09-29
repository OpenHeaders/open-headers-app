import React from 'react';
import { Typography, theme } from 'antd';

const { Text } = Typography;
const { useToken } = theme;

/**
 * ExportInfoCard component for displaying helpful information about exports
 * 
 * Provides contextual tips and information based on the selected export type to help
 * users understand what they're exporting and how they can use it. Currently focused
 * on JSON exports, but can be extended to support video export tips as well.
 * 
 * Design Notes:
 * - Uses subtle background color to distinguish from main content
 * - Only shows for JSON exports (video exports are self-explanatory)
 * - Could be extended to show format-specific tips for video exports
 * 
 * @param {string} exportType - Current export type ('json' or 'video')
 */
const ExportInfoCard = ({ exportType }) => {
    const { token } = useToken();
    
    // Only show info for JSON exports - video exports are self-explanatory
    if (exportType !== 'json') return null;

    return (
        <div style={{ 
            padding: '12px', 
            // Theme-aware background for subtle information display
            background: token.colorFillAlter, 
            borderRadius: '4px',
            marginTop: '8px'
        }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
                <strong>Tip:</strong> Session recordings can be imported back into the app for debugging and analysis
            </Text>
        </div>
    );
};

export default ExportInfoCard;