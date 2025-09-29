/**
 * Domain Action Buttons Component
 * 
 * Provides action buttons for bulk domain operations including
 * copy all domains and delete all domains functionality with
 * proper user feedback and confirmation.
 * 
 * Action Features:
 * - Copy all domains to clipboard as comma-separated values
 * - Delete all domains with confirmation messaging
 * - Disabled state handling when no domains exist
 * - Tooltips for action button guidance
 * - Responsive button sizing and styling
 * 
 * @module DomainActionButtons
 * @since 3.0.0
 */

import React from 'react';
import { Space, Button, Tooltip } from 'antd';
import { CopyOutlined, DeleteOutlined } from '@ant-design/icons';
import { showMessage } from '../../../utils/ui/messageUtil';

/**
 * Creates copy all domains handler
 * 
 * Factory function that creates a handler for copying all domains
 * to clipboard as comma-separated values with user feedback.
 * 
 * @param {Array} domains - Array of domain strings to copy
 * @returns {Function} Copy handler function
 */
export const createCopyAllHandler = (domains) => async () => {
    if (domains.length === 0) {
        showMessage('warning', 'No domains to copy');
        return;
    }
    
    const domainsText = domains.join(',');
    
    try {
        await navigator.clipboard.writeText(domainsText);
        showMessage('success', `Copied ${domains.length} domain${domains.length > 1 ? 's' : ''} to clipboard`);
    } catch (err) {
        showMessage('error', 'Failed to copy domains');
    }
};

/**
 * Creates delete all domains handler
 * 
 * Factory function that creates a handler for deleting all domains
 * with user feedback and confirmation messaging.
 * 
 * @param {Array} domains - Array of domain strings to delete
 * @param {Function} onChange - Domain change callback function
 * @returns {Function} Delete handler function
 */
export const createDeleteAllHandler = (domains, onChange) => () => {
    if (domains.length === 0) {
        showMessage('warning', 'No domains to delete');
        return;
    }
    
    onChange?.([]);
    showMessage('success', `Deleted ${domains.length} domain${domains.length > 1 ? 's' : ''}`);
};

/**
 * Domain action buttons component
 * 
 * Renders copy and delete action buttons for bulk domain operations
 * with appropriate tooltips and disabled states.
 * 
 * @param {Object} props - Component props
 * @param {Array} props.domains - Array of domain strings
 * @param {Function} props.onChange - Domain change callback function
 * @returns {JSX.Element} Domain action buttons component
 * 
 * @example
 * <DomainActionButtons
 *   domains={['example.com', 'test.com']}
 *   onChange={handleDomainsChange}
 * />
 */
export const DomainActionButtons = ({ domains, onChange }) => {
    // Don't render buttons if no domains exist
    if (domains.length === 0) {
        return null;
    }

    const handleCopyAll = createCopyAllHandler(domains);
    const handleDeleteAll = createDeleteAllHandler(domains, onChange);

    return (
        <Space size={4}>
            <Tooltip title="Copy all domains as comma-separated values">
                <Button
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={handleCopyAll}
                    style={{
                        fontSize: 11,
                        height: 22,
                        marginLeft: 8
                    }}
                >
                    Copy all
                </Button>
            </Tooltip>
            <Tooltip title="Delete all domains">
                <Button
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={handleDeleteAll}
                    style={{
                        fontSize: 11,
                        height: 22
                    }}
                >
                    Delete all
                </Button>
            </Tooltip>
        </Space>
    );
};

/**
 * Domain actions header component
 * 
 * Combines help text and action buttons in a flexible header layout
 * with proper spacing and responsive design.
 * 
 * @param {Object} props - Component props
 * @param {Array} props.domains - Array of domain strings
 * @param {Function} props.onChange - Domain change callback function
 * @param {JSX.Element} props.helpComponent - Help text component to display
 * @returns {JSX.Element} Domain actions header component
 * 
 * @example
 * <DomainActionsHeader
 *   domains={domains}
 *   onChange={onChange}
 *   helpComponent={<DomainInputHelp />}
 * />
 */
export const DomainActionsHeader = ({ domains, onChange, helpComponent }) => {
    return (
        <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 8
        }}>
            {helpComponent}
            <DomainActionButtons domains={domains} onChange={onChange} />
        </div>
    );
};