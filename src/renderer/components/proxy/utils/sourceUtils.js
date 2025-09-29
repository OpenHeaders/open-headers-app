import React from 'react';
import { 
    GlobalOutlined,
    FileTextOutlined,
    CodeSandboxOutlined,
    ApiOutlined
} from '@ant-design/icons';

/**
 * Proxy Source Utilities
 * 
 * Utility functions for working with source objects in proxy rule configurations.
 * These utilities handle source type identification, icon selection, and display formatting.
 */

/**
 * Get appropriate icon for source type
 * 
 * Returns the appropriate Ant Design icon based on the source type.
 * Used for visual identification of different source types in dropdowns.
 * 
 * @param {Object} source - Source object with sourceType property
 * @returns {JSX.Element} Ant Design icon component
 */
export const getSourceIcon = (source) => {
    const sourceType = source.sourceType || '';
    
    if (sourceType.toLowerCase().includes('http')) {
        return <GlobalOutlined style={{ marginRight: 4 }} />;
    } else if (sourceType.toLowerCase().includes('file')) {
        return <FileTextOutlined style={{ marginRight: 4 }} />;
    } else if (sourceType.toLowerCase().includes('env')) {
        return <CodeSandboxOutlined style={{ marginRight: 4 }} />;
    }
    
    return <ApiOutlined style={{ marginRight: 4 }} />;
};

/**
 * Format source display string for dropdowns
 * 
 * Creates a user-friendly display string for sources by combining
 * source tag, path, and type information. Handles environment variable
 * prefixing and fallback display names.
 * 
 * @param {Object} source - Source object with tag, path, type, and ID
 * @returns {string} Formatted display string
 */
export const formatSourceDisplay = (source) => {
    const tag = source.sourceTag || '';
    const path = source.sourcePath || '';
    const type = source.sourceType || '';
    
    let display = '';
    
    if (tag) {
        display = `[${tag}] `;
    }
    
    if (path) {
        const displayPath = type.toLowerCase().includes('env') && !path.startsWith('$')
            ? `$${path}`
            : path;
        display += displayPath;
    } else {
        display += `Source #${source.sourceId}`;
    }
    
    return display;
};

/**
 * Get display name for a source by ID
 * 
 * Finds a source by ID and returns its display name (tag or path).
 * Used for resolving source references in proxy rules.
 * 
 * @param {string} sourceId - Source identifier
 * @param {Array} sources - Available sources array
 * @returns {string} Source display name (tag or path)
 */
export const getSourceName = (sourceId, sources) => {
    const source = sources.find(s => s.sourceId === sourceId);
    return source ? (source.sourceTag || source.sourcePath) : 'Unknown Source';
};