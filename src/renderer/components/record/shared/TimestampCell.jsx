/**
 * TimestampCell Component
 * 
 * Reusable timestamp cell component for record tables
 * Displays relative time with milliseconds and tooltip with absolute time
 * Includes current entry indicator when highlighting is active
 * 
 * @param {Object} props - Component props
 * @param {number} props.timestamp - The timestamp to display
 * @param {Object} props.record - The full record for context
 * @param {boolean} props.isCurrentEntry - Whether this is the current highlighted entry
 * @param {number} props.width - Minimum width for the cell
 */
import React from 'react';
import { Typography, Tooltip, theme } from 'antd';
import { CaretRightOutlined } from '@ant-design/icons';
import { formatRelativeTimeWithSmallMs, format24HTimeWithMs } from '../../../utils';

const { Text } = Typography;

const TimestampCell = ({ 
    timestamp, 
    record, 
    isCurrentEntry = false, 
    width = 100 
}) => {
    const { token } = theme.useToken();
    
    // Format relative time
    const timeParts = formatRelativeTimeWithSmallMs(timestamp);
    
    // Calculate absolute time
    const absoluteTime = new Date(record.metadata.startTime + timestamp);
    const formattedAbsoluteTime = format24HTimeWithMs(absoluteTime);

    return (
        <Tooltip 
            title={
                <span>
                    {formattedAbsoluteTime.date} {formattedAbsoluteTime.time}
                    <span style={{ fontSize: '0.85em', opacity: 0.8 }}>
                        {formattedAbsoluteTime.ms}
                    </span>
                </span>
            }
        >
            <div 
                style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '4px', 
                    minWidth: `${width}px` 
                }}
            >
                {/* Current entry indicator */}
                <div style={{ width: '12px', flexShrink: 0 }}>
                    {isCurrentEntry && (
                        <CaretRightOutlined
                            style={{
                                color: token.colorPrimary,
                                fontSize: '10px'
                            }}
                        />
                    )}
                </div>
                
                {/* Time display */}
                <Text 
                    style={{
                        fontSize: '12px',
                        fontFamily: 'monospace',
                        opacity: 0.8,
                        fontWeight: isCurrentEntry ? 600 : 400
                    }}
                >
                    {timeParts.main}
                    <span style={{ fontSize: '0.85em', opacity: 0.7 }}>
                        {timeParts.ms}
                    </span>
                </Text>
            </div>
        </Tooltip>
    );
};

export default TimestampCell;