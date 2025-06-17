import React, { useState, useEffect, useRef } from 'react';
import { Card, Button, theme } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import RecordViewer from './RecordViewer';

const RecordRecording = ({ record, onRecordChange }) => {
    const [isSticky, setIsSticky] = useState(false);
    const cardRef = useRef(null);
    const { token } = theme.useToken();

    useEffect(() => {
        const handleScroll = () => {
            if (!cardRef.current) return;

            const rect = cardRef.current.getBoundingClientRect();
            const headerHeight = 64; // App header height
            
            // Card should be sticky when its top edge goes above the app header
            if (rect.top <= headerHeight && !isSticky) {
                setIsSticky(true);
            } else if (rect.top > headerHeight && isSticky) {
                setIsSticky(false);
            }
        };

        // Try both window scroll and container scroll
        window.addEventListener('scroll', handleScroll);
        
        // Also check for scrollable containers
        const containers = [
            '.content-container',
            '.ant-tabs-content-holder', 
            '.ant-tabs-content',
            '.app-content'
        ];
        
        const scrollElements = [];
        containers.forEach(selector => {
            const el = document.querySelector(selector);
            if (el) {
                el.addEventListener('scroll', handleScroll);
                scrollElements.push(el);
            }
        });

        // Check initial position
        handleScroll();

        return () => {
            window.removeEventListener('scroll', handleScroll);
            scrollElements.forEach(el => {
                el.removeEventListener('scroll', handleScroll);
            });
        };
    }, [isSticky, record]);

    const renderButton = () => (
        <Button 
            type="primary"
            icon={<UploadOutlined />}
            onClick={() => onRecordChange(null)}
            size="small"
        >
            Load Another Record
        </Button>
    );

    const renderStickyHeader = () => {
        if (!isSticky || !record) return null;
        
        return (
            <div className="source-form-sticky-header" style={{
                background: token.colorBgContainer,
                boxShadow: '0 2px 8px rgba(0,0,0,0.09)'
            }}>
                <div className="sticky-header-content">
                    <div className="title">Record Recording</div>
                    {renderButton()}
                </div>
            </div>
        );
    };

    if (!record) {
        return (
            <RecordViewer 
                record={record}
                onRecordChange={onRecordChange}
                viewMode="upload"
            />
        );
    }

    return (
        <>
            {renderStickyHeader()}
            
            <Card
                ref={cardRef}
                className="record-info-card"
                size="small"
                title="Record Recording"
                extra={renderButton()}
            >
                <RecordViewer 
                    record={record}
                    onRecordChange={onRecordChange}
                    viewMode="info"
                />
            </Card>
        </>
    );
};

export default RecordRecording;