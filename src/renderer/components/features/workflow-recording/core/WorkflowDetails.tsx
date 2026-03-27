/**
 * WorkflowDetails component for displaying workflow information
 * Simple wrapper component that renders a RecordViewer in a card layout
 */

import React from 'react';
import { Card } from 'antd';
import { WorkflowViewer, VIEW_MODES } from '../viewer';
import type { Recording } from '../../../../../types/recording';

interface WorkflowDetailsProps {
    record: Recording | null;
    playbackTime: number;
    autoHighlight: boolean;
    onAutoHighlightChange: (value: boolean) => void;
}

const WorkflowDetails = ({ record, playbackTime, autoHighlight, onAutoHighlightChange }: WorkflowDetailsProps) => {
    return (
        <Card
            className="record-details-card"
            size="small"
            styles={{
                body: {
                    padding: 0,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative',
                    overflow: 'hidden'
                }
            }}
        >
            <WorkflowViewer
                record={record}
                viewMode={VIEW_MODES.TABS}
                playbackTime={playbackTime}
                autoHighlight={autoHighlight}
                onAutoHighlightChange={onAutoHighlightChange}
            />
        </Card>
    );
};

export default WorkflowDetails;