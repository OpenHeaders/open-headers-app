/**
 * Domain Tag Display Components
 * 
 * Provides specialized components for rendering individual domain tags
 * with editing capabilities, tooltips for long domains, and interactive
 * tag management functionality.
 * 
 * Display Features:
 * - Individual domain tag rendering with customizable styling
 * - Inline editing with auto-sizing input fields
 * - Tooltip support for long domain names
 * - Close button integration with confirmation
 * - Keyboard navigation and accessibility support
 * 
 * @module DomainTagDisplay
 * @since 3.0.0
 */

import React from 'react';
import { Tag, Input, Tooltip, theme } from 'antd';
import { CloseOutlined } from '@ant-design/icons';

/**
 * Individual domain tag component with editing support
 * 
 * Renders a single domain tag with the ability to edit inline,
 * show tooltips for long domains, and handle removal actions.
 * 
 * @param {Object} props - Component props
 * @param {string} props.tag - Domain tag value to display
 * @param {number} props.index - Index of tag in the array
 * @param {boolean} props.isEditing - Whether tag is currently being edited
 * @param {string} props.editValue - Current edit input value
 * @param {Function} props.onEdit - Handler for starting edit mode
 * @param {Function} props.onEditChange - Handler for edit input changes
 * @param {Function} props.onEditConfirm - Handler for confirming edits
 * @param {Function} props.onEditKeyDown - Handler for edit keyboard events
 * @param {Function} props.onClose - Handler for tag removal
 * @param {Object} props.editInputRef - Reference for edit input element
 * @returns {JSX.Element} Domain tag component
 * 
 * @example
 * <DomainTag
 *   tag="example.com"
 *   index={0}
 *   isEditing={false}
 *   onEdit={handleEdit}
 *   onClose={handleClose}
 * />
 */
export const DomainTag = ({
    tag,
    index,
    isEditing,
    editValue,
    onEdit,
    onEditChange,
    onEditConfirm,
    onEditKeyDown,
    onClose,
    editInputRef,
    validation
}) => {
    // Show edit input when in editing mode
    if (isEditing) {
        return (
            <Input
                ref={editInputRef}
                key={`edit-${tag}`}
                size="small"
                style={{
                    width: Math.max(80, tag.length * 8 + 20),
                    height: 24,
                    borderRadius: 4
                }}
                value={editValue}
                onChange={onEditChange}
                onBlur={onEditConfirm}
                onKeyDown={onEditKeyDown}
            />
        );
    }

    // Determine if domain is too long for display
    const isLongTag = tag.length > 24;
    const displayTag = isLongTag ? `${tag.slice(0, 24)}...` : tag;

    // Create the tag element with click-to-edit functionality
    const hasValidationError = validation && !validation.isValid;
    const tagElement = (
        <Tag
            key={tag}
            closable
            closeIcon={<CloseOutlined style={{ fontSize: 10 }} />}
            onClose={(e) => {
                e.preventDefault();
                onClose(tag);
            }}
            color={hasValidationError ? 'error' : undefined}
            style={{
                userSelect: 'none',
                margin: 0,
                borderRadius: 4,
                padding: '2px 6px',
                fontSize: 12,
                cursor: 'pointer',
                height: 24,
                lineHeight: '20px'
            }}
        >
            <span
                onClick={(e) => {
                    onEdit(index, tag);
                    e.preventDefault();
                    e.stopPropagation();
                }}
                title="Click to edit"
            >
                {displayTag}
            </span>
        </Tag>
    );

    // Wrap with tooltip including validation errors
    const tooltipTitle = hasValidationError 
        ? (
            <div>
                <div>{tag}</div>
                <div style={{ color: '#ff4d4f', marginTop: 4 }}>
                    {validation.missingVars ? `Missing variables: ${validation.missingVars.map(v => `{{${v}}}`).join(', ')}` : 'Invalid'}
                </div>
            </div>
        )
        : tag;
    
    return (isLongTag || hasValidationError) ? (
        <Tooltip title={tooltipTitle} key={tag}>
            {tagElement}
        </Tooltip>
    ) : (
        tagElement
    );
};

/**
 * Domain tags container with add button
 * 
 * Renders the complete domain tags interface including existing tags,
 * input field for new domains, and add button when input is hidden.
 * 
 * @param {Object} props - Component props
 * @param {Array} props.domains - Array of domain strings to display
 * @param {boolean} props.inputVisible - Whether input field is visible
 * @param {string} props.inputValue - Current input field value
 * @param {number} props.editIndex - Index of tag being edited (-1 if none)
 * @param {string} props.editValue - Current edit input value
 * @param {Function} props.onTagEdit - Handler for starting tag edit
 * @param {Function} props.onTagEditChange - Handler for edit input changes
 * @param {Function} props.onTagEditConfirm - Handler for confirming edits
 * @param {Function} props.onTagEditKeyDown - Handler for edit keyboard events
 * @param {Function} props.onTagClose - Handler for tag removal
 * @param {Function} props.onShowInput - Handler for showing input field
 * @param {Function} props.onInputChange - Handler for input field changes
 * @param {Function} props.onInputPaste - Handler for paste events
 * @param {Function} props.onInputConfirm - Handler for input confirmation
 * @param {Function} props.onInputKeyDown - Handler for input keyboard events
 * @param {Object} props.inputRef - Reference for input element
 * @param {Object} props.editInputRef - Reference for edit input element
 * @returns {JSX.Element} Domain tags container component
 */
export const DomainTagsContainer = ({
    domains,
    inputVisible,
    inputValue,
    editIndex,
    editValue,
    onTagEdit,
    onTagEditChange,
    onTagEditConfirm,
    onTagEditKeyDown,
    onTagClose,
    onShowInput,
    onInputChange,
    onInputPaste,
    onInputConfirm,
    onInputKeyDown,
    inputRef,
    editInputRef,
    validationResults = [],
    currentInputValidation
}) => {
    const { token } = theme.useToken();
    
    return (
        <div style={{
            border: `1px solid ${token.colorBorder}`,
            borderRadius: 6,
            padding: '8px 12px',
            minHeight: 32,
            background: token.colorBgContainer
        }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                {/* Render existing domain tags */}
                {domains.map((tag, index) => (
                    <DomainTag
                        key={`${tag}-${index}`}
                        tag={tag}
                        index={index}
                        isEditing={editIndex === index}
                        editValue={editValue}
                        onEdit={onTagEdit}
                        onEditChange={onTagEditChange}
                        onEditConfirm={onTagEditConfirm}
                        onEditKeyDown={onTagEditKeyDown}
                        onClose={onTagClose}
                        editInputRef={editInputRef}
                        validation={validationResults[index]}
                    />
                ))}

                {/* Input field for new domains */}
                {inputVisible ? (
                    <div style={{ position: 'relative' }}>
                        <Input
                            ref={inputRef}
                            type="text"
                            size="small"
                            placeholder="Type domain and press Enter or comma"
                            style={{
                                width: 280,
                                height: 24,
                                borderRadius: 4,
                                borderColor: currentInputValidation && !currentInputValidation.isValid ? '#ff4d4f' : undefined
                            }}
                            value={inputValue}
                            onChange={onInputChange}
                            onPaste={onInputPaste}
                            onBlur={onInputConfirm}
                            onKeyDown={onInputKeyDown}
                        />
                        {currentInputValidation && !currentInputValidation.isValid && (
                            <div style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                marginTop: 2,
                                fontSize: 11,
                                color: '#ff4d4f',
                                whiteSpace: 'nowrap'
                            }}>
                                {currentInputValidation.message}
                            </div>
                        )}
                    </div>
                ) : (
                    <button
                        onClick={onShowInput}
                        style={{
                            height: 24,
                            fontSize: 12,
                            border: `1px dashed ${token.colorBorder}`,
                            borderRadius: 4,
                            background: 'transparent',
                            cursor: 'pointer',
                            padding: '2px 8px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            color: token.colorTextSecondary
                        }}
                    >
                        <span style={{ fontSize: '10px' }}>+</span>
                        Add Domain
                    </button>
                )}
            </div>
        </div>
    );
};

/**
 * Help text component for domain input guidance
 * 
 * Displays comprehensive help text with examples and keyboard shortcuts
 * for the domain tags input interface.
 * 
 * @returns {JSX.Element} Help text component
 */
export const DomainInputHelp = () => {
    const { token } = theme.useToken();
    
    return (
        <div style={{
            fontSize: 12,
            color: token.colorTextSecondary,
            lineHeight: 1.4,
            flex: 1
        }}>
            Separate multiple domains with Enter or comma. Use * as wildcard. Press Backspace to delete last domain.<br/>
            Examples: localhost:3001 • example.com • *.example.com • {'{{DOMAIN_VAR}}'} • {'{{BASE_URL}}'}.com • 192.168.1.1
        </div>
    );
};