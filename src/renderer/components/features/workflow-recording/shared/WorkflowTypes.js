/**
 * Type definitions and constants for workflow recording functionality
 */


/**
 * Default pagination configuration for workflow recordings table
 */
export const DEFAULT_PAGINATION = {
  defaultPageSize: 10,
  showSizeChanger: true,
  pageSizeOptions: ['10', '20', '50', '100'],
  showTotal: (total) => `Total ${total} workflow recordings`
};

/**
 * Supported workflow recording file types for import
 */
export const SUPPORTED_FILE_TYPES = {
  JSON: '.json',
  HAR: '.har',
  VIDEO: '.mp4,.webm,.avi'
};

