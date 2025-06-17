import React from 'react';
import { Card } from 'antd';
import RecordViewer from './RecordViewer';

const RecordDetails = ({ record }) => {
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
            <RecordViewer 
                record={record}
                viewMode="tabs"
            />
        </Card>
    );
};

export default RecordDetails;