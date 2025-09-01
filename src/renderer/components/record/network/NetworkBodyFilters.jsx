/**
 * NetworkBodyFilters Component
 * 
 * Dropdown component for filtering network requests by request/response body presence
 * Extracted from RecordNetworkTab for better modularity
 * 
 * @param {Object} props - Component props
 * @param {Object} props.bodyFilters - Current body filter state
 * @param {Function} props.onBodyFiltersChange - Handler for body filter changes
 * @param {Object} props.token - Ant Design theme token
 */
import React, { useMemo } from 'react';
import { Dropdown, Button, Tooltip, Checkbox } from 'antd';
import { FilterOutlined } from '@ant-design/icons';

const NetworkBodyFilters = ({ bodyFilters, onBodyFiltersChange, token }) => {
    // Check if body filters are active
    const isBodyFilterActive = bodyFilters.hasRequestBody || bodyFilters.hasResponseBody;

    // Memoize the body filter menu to prevent recreating it on every render
    const bodyFilterMenu = useMemo(() => ({
        items: [
            {
                key: 'filters',
                type: 'group',
                label: 'Body Filters',
                children: [
                    {
                        key: 'hasRequestBody',
                        label: (
                            <Checkbox
                                checked={bodyFilters.hasRequestBody}
                                onChange={(e) => onBodyFiltersChange(prev => ({ 
                                    ...prev, 
                                    hasRequestBody: e.target.checked 
                                }))}
                                onClick={(e) => e.stopPropagation()}
                            >
                                Has Request Body
                            </Checkbox>
                        ),
                    },
                    {
                        key: 'hasResponseBody',
                        label: (
                            <Checkbox
                                checked={bodyFilters.hasResponseBody}
                                onChange={(e) => onBodyFiltersChange(prev => ({ 
                                    ...prev, 
                                    hasResponseBody: e.target.checked 
                                }))}
                                onClick={(e) => e.stopPropagation()}
                            >
                                Has Response Body
                            </Checkbox>
                        ),
                    },
                ],
            },
            {
                type: 'divider',
            },
            {
                key: 'clear',
                label: 'Clear Filters',
                disabled: !isBodyFilterActive,
                onClick: () => onBodyFiltersChange({ hasRequestBody: false, hasResponseBody: false }),
            },
        ],
    }), [bodyFilters, isBodyFilterActive, onBodyFiltersChange]);

    return (
        <Dropdown
            menu={bodyFilterMenu}
            trigger={['click']}
            placement="bottomLeft"
        >
            <Tooltip title="Filter by request/response body">
                <Button
                    type="text"
                    size="small"
                    icon={<FilterOutlined />}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        minWidth: 'auto',
                        padding: '0 4px',
                        height: '20px',
                        color: isBodyFilterActive ? token.colorPrimary : token.colorTextSecondary
                    }}
                />
            </Tooltip>
        </Dropdown>
    );
};

export default NetworkBodyFilters;