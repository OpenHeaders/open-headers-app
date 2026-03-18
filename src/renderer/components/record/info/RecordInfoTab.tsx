import React from 'react';
import { Descriptions, Typography } from 'antd';
import { formatDuration, format24HTimeWithMs } from '../../../utils';

const { Text } = Typography;

interface RecordInfoTabProps { record: { metadata?: { startTime: number; duration?: number; url?: string; title?: string; userAgent?: string; recordId?: string; viewport?: { width: number; height: number } }; events?: unknown[]; console?: unknown[]; network?: unknown[]; storage?: { localStorage?: unknown[]; sessionStorage?: unknown[]; cookies?: unknown[] }; [key: string]: unknown }; }
export const RecordInfoTab = ({ record }: RecordInfoTabProps) => {
    if (!record?.metadata) return null;

    const { metadata } = record;
    const startTime = new Date(metadata.startTime);
    const formattedTime = format24HTimeWithMs(startTime);

    return (
        <div style={{ height: '100%', overflow: 'auto', padding: '16px' }}>
            <Descriptions bordered column={1}>
                <Descriptions.Item label="Workflow ID">{metadata.recordId}</Descriptions.Item>
                <Descriptions.Item label="URL">{metadata.url}</Descriptions.Item>
                <Descriptions.Item label="Duration">{formatDuration(metadata.duration)}</Descriptions.Item>
                <Descriptions.Item label="Captured At">
                    <span>
                        {formattedTime.date} {formattedTime.time}
                        <span style={{ fontSize: '0.85em', opacity: 0.8 }}>{formattedTime.ms}</span>
                    </span>
                </Descriptions.Item>
                <Descriptions.Item label="Viewport">
                    {metadata.viewport ? 
                        `${metadata.viewport.width} × ${metadata.viewport.height}` : 
                        'Unknown'
                    }
                </Descriptions.Item>
                <Descriptions.Item label="User Agent">
                    <Text style={{ fontSize: '12px' }}>{metadata.userAgent || 'Unknown'}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="Total Events">{record.events?.length || 0}</Descriptions.Item>
                <Descriptions.Item label="Console Logs">{record.console?.length || 0}</Descriptions.Item>
                <Descriptions.Item label="Network Requests">{record.network?.length || 0}</Descriptions.Item>
                <Descriptions.Item label="Storage Data">
                    {record.storage ? 
                        Array.isArray(record.storage) ? 
                            `${record.storage.length} storage events` : 
                            `${Object.keys(record.storage.localStorage || {}).length} localStorage, ${Object.keys(record.storage.sessionStorage || {}).length} sessionStorage, ${(record.storage.cookies || []).length} cookies` 
                        : 'None'
                    }
                </Descriptions.Item>
            </Descriptions>
        </div>
    );
};

export default RecordInfoTab;