/**
 * DomainTags Component
 * 
 * Main component for managing domain tag collections with comprehensive
 * modular architecture. This component has been fully refactored into a
 * modular design with extracted validation, input handling, display components,
 * and utilities to improve maintainability and organization.
 * 
 * Core Features:
 * - Professional domain tags interface for managing multiple domain patterns
 * - Real-time domain validation with comprehensive pattern support
 * - Intelligent input processing with comma detection and paste handling
 * - Inline tag editing with keyboard shortcuts and auto-sizing
 * - Bulk operations (copy all, delete all) with user feedback
 * - Wildcard domain support and special case handling
 * 
 * Architecture:
 * - Modular design with extracted validation, input handling, and display components
 * - Clean separation of concerns for better maintainability
 * - Comprehensive prop passing for component composition
 * - Factory pattern for handler creation with dependency injection
 * 
 * @component
 * @since 3.0.0
 */

import React, { useState, useRef, useEffect } from 'react';

// Import extracted modules and components
import {
    // Input handling functions
    createPasteHandler,
    createInputChangeHandler,
    createInputConfirmHandler,
    createKeyboardHandler,
    processSingleDomain,
    
    // Display components
    DomainTagsContainer,
    DomainInputHelp,
    
    // Action components
    DomainActionsHeader,
    
    // Utility functions
    createTagCloseHandler,
    createTagEditHandlers,
    createShowInputHandler
} from './index';

/**
 * DomainTags component for managing domain tag collections with modular architecture
 * 
 * Provides a comprehensive interface for domain tag management including validation,
 * input processing, editing, and bulk operations with proper user feedback.
 * 
 * @param {Object} props - Component props
 * @param {Array} props.value - Array of domain strings (default: [])
 * @param {Function} props.onChange - Callback function for domain changes
 * @returns {JSX.Element} Domain tags management component
 * 
 * @example
 * <DomainTags
 *   value={['example.com', '*.test.com']}
 *   onChange={handleDomainsChange}
 * />
 */
const DomainTags = ({ value = [], onChange, onValidate, validationResults = [] }) => {
    // Input state management
    const [inputVisible, setInputVisible] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [currentInputValidation, setCurrentInputValidation] = useState(null);
    
    // Edit state management
    const [editInputIndex, setEditInputIndex] = useState(-1);
    const [editInputValue, setEditInputValue] = useState('');

    // Refs for input focus management
    const inputRef = useRef(null);
    const editInputRef = useRef(null);

    // Focus management effects
    useEffect(() => {
        if (inputVisible) {
            inputRef.current?.focus();
        }
    }, [inputVisible]);

    useEffect(() => {
        if (editInputIndex > -1) {
            editInputRef.current?.focus();
        }
    }, [editInputIndex]);

    // Create handlers using extracted factory functions
    const handleTagClose = createTagCloseHandler(value, onChange);
    
    // Override the default edit handlers to support validation
    const handleEdit = (index, tag) => {
        setEditInputIndex(index);
        setEditInputValue(tag);
    };

    const handleEditChange = (e) => {
        setEditInputValue(e.target.value);
    };

    const handleEditConfirm = () => {
        if (editInputIndex > -1 && editInputValue) {
            const newDomains = [...value];
            newDomains[editInputIndex] = editInputValue.trim();
            onChange?.(newDomains);
        }
        setEditInputIndex(-1);
        setEditInputValue('');
    };

    const handleEditKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleEditConfirm();
        } else if (e.key === 'Escape') {
            setEditInputIndex(-1);
            setEditInputValue('');
        }
    };

    const showInput = createShowInputHandler(setInputVisible, inputRef);

    const handlePaste = createPasteHandler({
        value,
        onChange,
        inputValue,
        setInputValue,
        inputRef
    });

    // Override input change handler to include validation feedback
    const handleInputChange = (e) => {
        const newValue = e.target.value;
        setInputValue(newValue);
        
        // Check if the input contains environment variables
        if (newValue.includes('{{') && onValidate) {
            // Simple check for unclosed braces
            const openCount = (newValue.match(/\{\{/g) || []).length;
            const closeCount = (newValue.match(/\}\}/g) || []).length;
            
            if (openCount > closeCount) {
                setCurrentInputValidation({ 
                    isValid: false, 
                    message: 'Unclosed environment variable' 
                });
            } else {
                setCurrentInputValidation(null);
            }
        } else {
            setCurrentInputValidation(null);
        }
        
        // Handle comma-separated input
        if (newValue.includes(',')) {
            const parts = newValue.split(',');
            const domains = [];
            
            for (let i = 0; i < parts.length - 1; i++) {
                const domain = processSingleDomain(parts[i]);
                if (domain) {
                    domains.push(domain);
                }
            }
            
            if (domains.length > 0) {
                const newTags = [...new Set([...value, ...domains])];
                onChange?.(newTags);
            }
            
            setInputValue(parts[parts.length - 1]);
            setTimeout(() => inputRef.current?.focus(), 0);
        }
    };

    // Trigger validation when domains change
    useEffect(() => {
        if (onValidate) {
            onValidate(value);
        }
    }, [value, onValidate]);

    const handleInputConfirm = createInputConfirmHandler({
        value,
        onChange,
        inputValue,
        setInputVisible,
        setInputValue
    });

    const handleKeyPress = createKeyboardHandler({
        value,
        onChange,
        inputValue,
        setInputVisible,
        setInputValue,
        handleInputConfirm,
        inputRef
    });

    return (
        <div className="domain-tags-container">
            {/* Header with help text and action buttons */}
            <DomainActionsHeader
                domains={value}
                onChange={onChange}
                helpComponent={<DomainInputHelp />}
            />

            {/* Domain tags container with input */}
            <DomainTagsContainer
                domains={value}
                inputVisible={inputVisible}
                inputValue={inputValue}
                editIndex={editInputIndex}
                editValue={editInputValue}
                onTagEdit={handleEdit}
                onTagEditChange={handleEditChange}
                onTagEditConfirm={handleEditConfirm}
                onTagEditKeyDown={handleEditKeyDown}
                onTagClose={handleTagClose}
                onShowInput={showInput}
                onInputChange={handleInputChange}
                onInputPaste={handlePaste}
                onInputConfirm={handleInputConfirm}
                onInputKeyDown={handleKeyPress}
                inputRef={inputRef}
                editInputRef={editInputRef}
                validationResults={validationResults}
                currentInputValidation={currentInputValidation}
            />
        </div>
    );
};

export default DomainTags;