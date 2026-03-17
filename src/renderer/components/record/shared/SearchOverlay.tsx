/**
 * SearchOverlay Component
 * 
 * A reusable floating search overlay component that provides consistent search UI
 * across different record tabs. Features include:
 * - Live search with instant feedback
 * - Optional inverse filtering (hide matches instead of show)
 * - Keyboard navigation (Enter to close)
 * - Clear button for quick reset
 * - Customizable styling and positioning
 * 
 * @component
 * @example
 * ```jsx
 * <SearchOverlay
 *   visible={isSearchOpen}
 *   searchValue={searchTerm}
 *   onSearchChange={setSearchTerm}
 *   onClose={() => setIsSearchOpen(false)}
 *   placeholder="Search console logs..."
 *   showInverseFilter={true}
 *   inverseFilter={hideMatches}
 *   onInverseFilterChange={setHideMatches}
 * />
 * ```
 * 
 * @param {Object} props - Component props
 * @param {boolean} props.visible - Whether the overlay is visible
 * @param {string} props.searchValue - Current search value
 * @param {Function} props.onSearchChange - Handler for search value changes
 * @param {Function} props.onClose - Handler for closing the overlay
 * @param {boolean} [props.inverseFilter=false] - Whether inverse filtering is enabled
 * @param {Function} [props.onInverseFilterChange] - Handler for inverse filter toggle
 * @param {string} [props.placeholder='Search...'] - Placeholder text for search input
 * @param {boolean} [props.showInverseFilter=false] - Whether to show inverse filter option
 * @param {Object} [props.style={}] - Additional styles for the overlay
 * 
 * @returns {JSX.Element|null} The search overlay component or null if not visible
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Input, Space, Button, Checkbox, Tooltip, theme } from 'antd';
import { CloseOutlined } from '@ant-design/icons';

const SearchOverlay = ({
    visible,
    searchValue,
    onSearchChange,
    onClose,
    inverseFilter = false,
    onInverseFilterChange,
    placeholder = 'Search...',
    showInverseFilter = false,
    style = {},
    debounceMs = 300
}) => {
    const { token } = theme.useToken();
    const [localSearchValue, setLocalSearchValue] = useState(searchValue);
    const overlayRef = useRef(null);

    // Sync local value with prop value
    useEffect(() => {
        setLocalSearchValue(searchValue);
    }, [searchValue]);

    // Handle click outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (overlayRef.current && !overlayRef.current.contains(event.target)) {
                onClose();
            }
        };

        if (visible) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => {
                document.removeEventListener('mousedown', handleClickOutside);
            };
        }
    }, [visible, onClose]);

    // Debounced search change handler
    const debouncedOnSearchChange = useCallback(
        (() => {
            let timeoutId;
            return (value) => {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(() => {
                    onSearchChange(value);
                }, debounceMs);
            };
        })(),
        [onSearchChange, debounceMs]
    );

    // Handle local input changes
    const handleInputChange = (e) => {
        const value = e.target.value;
        setLocalSearchValue(value);
        debouncedOnSearchChange(value);
    };

    if (!visible) return null;

    const defaultStyle = {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 1000,
        backgroundColor: token.colorBgElevated,
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: '6px',
        padding: '12px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
        width: '300px',
        ...style
    };

    /**
     * Handle keyboard events in the search input
     * @param {KeyboardEvent} e - The keyboard event
     */
    const handleKeyPress = (e) => {
        if (e.key === 'Enter') {
            onClose();
        }
    };

    /**
     * Clear the search input value
     */
    const clearSearch = () => {
        setLocalSearchValue('');
        onSearchChange('');
    };

    return (
        <div ref={overlayRef} style={defaultStyle}>
            <Space direction="vertical" style={{ width: '100%' }}>
                <Input
                    placeholder={placeholder}
                    value={localSearchValue}
                    onChange={handleInputChange}
                    onKeyPress={handleKeyPress}
                    autoFocus
                    aria-label={`Search input: ${placeholder}`}
                    role="searchbox"
                    suffix={
                        <Space size={2}>
                            {localSearchValue && (
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<CloseOutlined />}
                                    onClick={clearSearch}
                                    style={{ minWidth: 'auto', padding: '0 4px' }}
                                    aria-label="Clear search"
                                    title="Clear search"
                                />
                            )}
                            <Button
                                type="text"
                                size="small"
                                onClick={onClose}
                                style={{ minWidth: 'auto', padding: '0 4px' }}
                                aria-label="Close search overlay"
                                title="Close search overlay"
                            >
                                Done
                            </Button>
                        </Space>
                    }
                />
                
                {showInverseFilter && onInverseFilterChange && (
                    <Checkbox
                        checked={inverseFilter}
                        onChange={e => onInverseFilterChange(e.target.checked)}
                        style={{ fontSize: '12px' }}
                        aria-label="Inverse filter: hide matching items instead of showing only matches"
                    >
                        <Tooltip title="When enabled, hides items that match the search criteria instead of showing only matches">
                            Inverse filter (hide matching items)
                        </Tooltip>
                    </Checkbox>
                )}
            </Space>
        </div>
    );
};

export default SearchOverlay;