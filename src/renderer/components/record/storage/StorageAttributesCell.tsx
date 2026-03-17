/**
 * StorageAttributesCell Component
 * 
 * Renders storage attributes like initial, HttpOnly, Secure, SameSite for cookies
 * Shows appropriate tags with tooltips for each attribute
 * 
 * @param {Object} props - Component props
 * @param {Object} props.record - Storage record with metadata
 */
import React from 'react';
import { Tag, Tooltip } from 'antd';

const StorageAttributesCell = ({ record }) => {
    const attributes = [];
    
    // Initial attribute
    if (record.metadata?.initial) {
        attributes.push(
            <Tooltip key="initial-tooltip" title="This storage existed when the recording started">
                <Tag key="initial" color="purple" style={{ fontSize: '10px', margin: '2px' }}>
                    Initial
                </Tag>
            </Tooltip>
        );
    }
    
    // Cookie-specific attributes
    if (record.type === 'cookie' && record.metadata) {
        const { metadata } = record;
        
        if (metadata.httpOnly) {
            attributes.push(
                <Tooltip key="httpOnly-tooltip" title="This cookie cannot be accessed by JavaScript (more secure)">
                    <Tag key="httpOnly" color="red" style={{ fontSize: '10px', margin: '2px' }}>
                        HttpOnly
                    </Tag>
                </Tooltip>
            );
        }
        
        if (metadata.secure) {
            attributes.push(
                <Tooltip key="secure-tooltip" title="This cookie is only sent over HTTPS connections">
                    <Tag key="secure" color="green" style={{ fontSize: '10px', margin: '2px' }}>
                        Secure
                    </Tag>
                </Tooltip>
            );
        }
        
        if (metadata.sameSite && metadata.sameSite !== 'unspecified') {
            const sameSiteColor = {
                'strict': 'blue',
                'lax': 'green',
                'none': 'orange'
            }[metadata.sameSite] || 'default';
            
            const sameSiteTooltip = {
                'strict': 'Cookie only sent to same site that created it (most restrictive)',
                'lax': 'Cookie sent on same-site requests and top-level navigation (default)',
                'none': 'Cookie sent on all requests (requires Secure attribute)'
            }[metadata.sameSite] || 'Cookie same-site policy';
            
            attributes.push(
                <Tooltip key="sameSite-tooltip" title={sameSiteTooltip}>
                    <Tag key="sameSite" color={sameSiteColor} style={{ fontSize: '10px', margin: '2px' }}>
                        {metadata.sameSite}
                    </Tag>
                </Tooltip>
            );
        }
    }
    
    return (
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
            {attributes.length > 0 ? attributes : null}
        </div>
    );
};

export default StorageAttributesCell;