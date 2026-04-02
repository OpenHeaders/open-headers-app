/**
 * Player Utility Functions
 */

/**
 * Calculates viewport scale for player container
 *
 * @param viewport - Viewport dimensions {width, height}
 * @param containerWidth - Container width
 * @param containerHeight - Container height
 * @returns Scale factor
 */
export const calculateViewportScale = (
  viewport: { width: number; height: number },
  containerWidth: number,
  containerHeight: number,
) => {
  const { width, height } = viewport || { width: 1024, height: 768 };
  const scaleX = (containerWidth - 40) / width;
  const scaleY = (containerHeight - 90) / height;
  return Math.min(scaleX, scaleY, 1);
};
