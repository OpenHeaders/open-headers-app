/**
 * Custom hook for managing search and filter functionality in record tables
 * Provides consistent search/filter behavior across different record tabs
 * 
 * @param {string} defaultSearchValue - Initial search value
 * @returns {Object} Search and filter state and handlers
 */
import { useState } from 'react';

export const useSearchFilter = (defaultSearchValue = '') => {
    const [searchVisible, setSearchVisible] = useState(false);
    const [searchValue, setSearchValue] = useState(defaultSearchValue);
    const [inverseFilter, setInverseFilter] = useState(false);

    /**
     * Toggle search input visibility
     */
    const toggleSearch = () => {
        setSearchVisible(!searchVisible);
    };

    /**
     * Clear search value and hide search input
     */
    const clearSearch = () => {
        setSearchValue('');
        setSearchVisible(false);
    };

    /**
     * Hide search input without clearing the value
     */
    const hideSearch = () => {
        setSearchVisible(false);
    };

    /**
     * Update search value
     * @param {string} value - New search value
     */
    const updateSearchValue = (value) => {
        setSearchValue(value);
    };

    /**
     * Toggle inverse filter mode
     */
    const toggleInverseFilter = () => {
        setInverseFilter(!inverseFilter);
    };

    /**
     * Create filter function for table columns
     * @param {Function} searchableFieldsExtractor - Function to extract searchable fields from record
     * @returns {Function} Filter function for table
     */
    const createFilterFunction = (searchableFieldsExtractor) => {
        return (value, record) => {
            if (!value) return true;
            
            const searchValue = value.toLowerCase();
            const searchableFields = searchableFieldsExtractor(record);
            const matches = searchableFields.some(field => 
                String(field).toLowerCase().includes(searchValue)
            );
            
            return inverseFilter ? !matches : matches;
        };
    };

    return {
        // State
        searchVisible,
        searchValue,
        inverseFilter,
        
        // Actions
        toggleSearch,
        clearSearch,
        hideSearch,
        updateSearchValue,
        toggleInverseFilter,
        createFilterFunction,
        
        // Computed
        isSearchActive: searchValue.length > 0,
        hasActiveFilters: searchValue.length > 0 || inverseFilter
    };
};