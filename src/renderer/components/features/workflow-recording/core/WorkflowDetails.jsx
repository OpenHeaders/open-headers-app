/**
 * WorkflowDetails component for displaying workflow information
 * Simple wrapper component that renders a RecordViewer in a card layout
 */

import React from 'react';
import { Card } from 'antd';
import { WorkflowViewer, VIEW_MODES } from '../viewer';

/**
 * WorkflowDetails component
 * @param {Object} props - Component props
 * @param {Object} props.record - Workflow data object
 * @param {number} props.playbackTime - Current playback time for session recordings
 * @param {boolean} props.autoHighlight - Whether to auto-highlight network requests
 * @param {Function} props.onAutoHighlightChange - Callback for auto-highlight changes
 * @returns {React.ReactNode} Rendered component
 */
const WorkflowDetails = ({ record, playbackTime, autoHighlight, onAutoHighlightChange }) => {
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