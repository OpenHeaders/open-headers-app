/**
 * Source Form Fields
 * 
 * Reusable form field components for the source form including specialized
 * input fields for different source types and dynamic rendering based on
 * source configuration.
 * 
 * Field Components:
 * - Source path fields for file, environment, and HTTP sources
 * - Add button with loading states and conditional rendering
 * - Sticky header for improved UX during long forms
 * 
 * Field Features:
 * - Type-specific input validation and placeholders
 * - File browser integration for file sources
 * - Loading states and disabled states
 * - Responsive design with proper spacing
 * 
 * @module SourceFormFields
 * @since 3.0.0
 */

import React from 'react';
import { Input, Button } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

/**
 * Renders source path input field based on source type
 * 
 * Dynamic input field that adapts its behavior and appearance based on
 * the selected source type. Provides specialized functionality for each
 * source type including file browser integration.
 * 
 * @param {Object} props - Component props
 * @param {string} props.sourceType - Type of source (file, env, http)
 * @param {string} props.filePath - Current file path for file sources
 * @param {Function} props.onBrowse - Callback for file browse button
 * @returns {JSX.Element} Appropriate input field for the source type
 * 
 * @example
 * <SourcePathField 
 *   sourceType="file" 
 *   filePath="/path/to/file.json"
 *   onBrowse={handleBrowse}
 * />
 */
export const SourcePathField = ({ sourceType, filePath, onBrowse, value, onChange, ...props }) => {
    switch (sourceType) {
        case 'file':
            return (
                <Input
                    value={filePath}
                    placeholder="Select a file"
                    readOnly
                    size="small"
                    addonAfter={
                        <Button type="link" onClick={onBrowse} style={{ padding: 0 }}>
                            Browse
                        </Button>
                    }
                />
            );

        case 'env':
            return (
                <Input
                    value={value}
                    onChange={onChange}
                    placeholder="Enter environment variable name"
                    size="small"
                    {...props}
                />
            );

        case 'http':
            return (
                <Input
                    value={value}
                    onChange={onChange}
                    placeholder="Enter URL (e.g., https://example.com)"
                    size="small"
                    {...props}
                />
            );

        default:
            return null;
    }
};

/**
 * Renders the add source button with appropriate states
 * 
 * Primary action button for adding sources with loading states and
 * conditional disabled states based on form and testing status.
 * 
 * @param {Object} props - Component props
 * @param {boolean} props.submitting - Whether form is currently submitting
 * @param {boolean} props.testing - Whether HTTP testing is in progress
 * @param {Function} props.onSubmit - Form submission callback
 * @returns {JSX.Element} Add source button with appropriate state
 * 
 * @example
 * <AddSourceButton 
 *   submitting={false}
 *   testing={true}
 *   onSubmit={() => form.submit()}
 * />
 */
export const AddSourceButton = ({ submitting, testing, onSubmit }) => {
    return (
        <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={onSubmit}
            loading={submitting}
            disabled={testing}
            size="middle"
            style={{ 
                minWidth: '120px',
                fontWeight: 500,
                height: '32px'
            }}
        >
            Add Source
        </Button>
    );
};

/**
 * Renders sticky header for improved form navigation
 * 
 * Sticky header component that appears when the main form header scrolls
 * out of view. Provides consistent access to the add button and form title
 * during long form interactions.
 * 
 * @param {Object} props - Component props
 * @param {boolean} props.isVisible - Whether sticky header should be visible
 * @param {JSX.Element} props.addButton - Add button component to render
 * @returns {JSX.Element|null} Sticky header component or null if not visible
 * 
 * @example
 * <StickyHeader 
 *   isVisible={isSticky}
 *   addButton={<AddSourceButton {...buttonProps} />}
 * />
 */
export const StickyHeader = ({ isVisible, addButton }) => {
    if (!isVisible) return null;
    
    return (
        <div className="source-form-sticky-header" style={{ 
            background: '#ffffff',
            boxShadow: '0 2px 8px rgba(0,0,0,0.09)'
        }}>
            <div className="sticky-header-content">
                <div className="title">Add Source</div>
                <div style={{ marginLeft: '16px' }}>
                    {addButton}
                </div>
            </div>
        </div>
    );
};

/**
 * Gets appropriate field label based on source type
 * 
 * Utility function that returns the correct label text for the source path
 * field based on the selected source type.
 * 
 * @param {string} sourceType - Type of source (file, env, http)
 * @returns {string} Appropriate label text for the source type
 * 
 * @example
 * const label = getSourcePathLabel('file'); // Returns "File Path"
 * const label = getSourcePathLabel('http'); // Returns "URL"
 */
export const getSourcePathLabel = (sourceType) => {
    switch (sourceType) {
        case 'file':
            return 'File Path';
        case 'env':
            return 'Variable Name';
        case 'http':
            return 'URL';
        default:
            return 'Source Path';
    }
};

/**
 * Gets appropriate validation message based on source type
 * 
 * Utility function that returns the correct validation message for required
 * field validation based on the selected source type.
 * 
 * @param {string} sourceType - Type of source (file, env, http)
 * @returns {string} Appropriate validation message for the source type
 * 
 * @example
 * const message = getSourcePathValidationMessage('file'); 
 * // Returns "Please enter a file path"
 */
export const getSourcePathValidationMessage = (sourceType) => {
    switch (sourceType) {
        case 'file':
            return 'Please enter a file path';
        case 'env':
            return 'Please enter a variable name';
        case 'http':
            return 'Please enter a URL';
        default:
            return 'Please enter a source path';
    }
};