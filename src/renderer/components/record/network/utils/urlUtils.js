/**
 * URL utility functions for network components
 * 
 * Common utilities for processing and displaying URLs in network requests
 */

/**
 * Extract display name from URL for better readability
 * Handles numeric paths and provides fallbacks for better UX
 * 
 * @param {string} url - The full URL
 * @param {string} fallback - Fallback text when URL parsing fails
 * @returns {string} Shortened display name
 */
export const getDisplayName = (url, fallback = 'Request Details') => {
    if (!url) return fallback;
    
    const urlParts = url.split('/');
    const fileName = urlParts[urlParts.length - 1] || urlParts[urlParts.length - 2] || fallback;

    let displayName = fileName;
    if (/^\d+$/.test(fileName) && urlParts.length >= 2) {
        const previousSegment = urlParts[urlParts.length - 2];
        if (previousSegment && previousSegment !== '' && !previousSegment.includes('.')) {
            displayName = `${previousSegment}/${fileName}`;
        }
    }

    return displayName;
};