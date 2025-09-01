/**
 * Player Utility Functions
 */

/**
 * Calculates viewport scale for player container
 *
 * @param {Object} viewport - Viewport dimensions {width, height}
 * @param {number} containerWidth - Container width
 * @param {number} containerHeight - Container height
 * @returns {number} Scale factor
 */
export const calculateViewportScale = (viewport, containerWidth, containerHeight) => {
    const { width, height } = viewport || { width: 1024, height: 768 };
    const scaleX = (containerWidth - 40) / width;
    const scaleY = (containerHeight - 90) / height;
    return Math.min(scaleX, scaleY, 1);
};