/**
 * NetworkFilterTags Component
 * 
 * Displays active filter tags in the network table header
 * Shows visual indicators for inverse filters and body filters
 * 
 * @param {Object} props - Component props
 * @param {boolean} props.showInverseTag - Whether to show inverse filter tag
 * @param {boolean} props.showSearchTag - Whether to show search active tag
 * @param {Object} props.bodyFilters - Current body filter state
 */
import React from 'react';
import { Tag, Tooltip } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';

const NetworkFilterTags = ({ showInverseTag, showSearchTag, bodyFilters }) => {
    return (
        <>
            {showSearchTag && !showInverseTag && (
                <Tooltip title="Search filter is active">
                    <Tag 
                        icon={<InfoCircleOutlined />}
                        color="blue" 
                        style={{ 
                            fontSize: '10px', 
                            margin: 0, 
                            padding: '0 4px', 
                            height: '16px', 
                            lineHeight: '16px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '2px'
                        }}
                    />
                </Tooltip>
            )}
            {showInverseTag && (
                <Tooltip title="Inverse filter is active - hiding requests that match the search">
                    <Tag 
                        color="red" 
                        style={{ 
                            fontSize: '10px', 
                            margin: 0, 
                            padding: '0 4px', 
                            height: '16px', 
                            lineHeight: '16px' 
                        }}
                    >
                        !
                    </Tag>
                </Tooltip>
            )}
            
            {bodyFilters.hasRequestBody && (
                <Tooltip title="Showing only requests with request body">
                    <Tag 
                        color="purple" 
                        style={{ 
                            fontSize: '10px', 
                            margin: 0, 
                            padding: '0 4px', 
                            height: '16px', 
                            lineHeight: '16px' 
                        }}
                    >
                        REQ
                    </Tag>
                </Tooltip>
            )}
            
            {bodyFilters.hasResponseBody && (
                <Tooltip title="Showing only requests with response body">
                    <Tag 
                        color="green" 
                        style={{ 
                            fontSize: '10px', 
                            margin: 0, 
                            padding: '0 4px', 
                            height: '16px', 
                            lineHeight: '16px' 
                        }}
                    >
                        RES
                    </Tag>
                </Tooltip>
            )}
        </>
    );
};

export default NetworkFilterTags;