/**
 * Utility functions for workflow operations
 */

import { showMessage } from '../../../../utils';
import { createLogger } from '../../../../utils/error-handling/logger';

const log = createLogger('WorkflowUtils');

/**
 * Loads all workflow recordings from the electron API
 * @returns {Promise<Array>} Array of workflow recording objects
 */
export const loadWorkflowRecordings = async () => {
  try {
    if (!window.electronAPI?.loadRecordings) {
      log.warn('electronAPI.loadRecordings not available');
      return [];
    }
    const allRecordings = await window.electronAPI.loadRecordings();
    return allRecordings || [];
  } catch (error) {
    log.error('Error loading workflow recordings:', error);
    showMessage('error', 'Failed to load workflow recordings');
    return [];
  }
};

/**
 * Deletes a workflow recording by ID
 * @param {string} recordingId - ID of the workflow recording to delete
 * @returns {Promise<boolean>} Success status
 */
export const deleteWorkflowRecording = async (recordingId) => {
  try {
    if (!recordingId || typeof recordingId !== 'string') {
      log.error('Invalid recording ID provided for deletion');
      showMessage('error', 'Invalid recording ID');
      return false;
    }
    
    if (!window.electronAPI?.deleteRecording) {
      log.warn('electronAPI.deleteRecording not available');
      showMessage('error', 'Delete functionality not available');
      return false;
    }
    log.debug('Deleting workflow recording:', recordingId);
    await window.electronAPI.deleteRecording(recordingId);
    showMessage('success', 'Workflow recording deleted successfully');
    return true;
  } catch (error) {
    log.error('Error deleting workflow recording:', error);
    showMessage('error', 'Failed to delete workflow recording');
    return false;
  }
};


/**
 * Applies navigation highlight to a workflow recording
 * @param {Function} applyHighlight - Highlight function from navigation context
 * @param {string} targetType - Target type for highlighting
 * @param {string} itemId - ID of the item to highlight
 * @param {number} delay - Delay before applying highlight (default: 500ms)
 */
export const applyWorkflowRecordingHighlight = (applyHighlight, targetType, itemId, delay = 500) => {
  setTimeout(() => {
    log.debug('Applying highlight for:', itemId);
    applyHighlight(targetType, itemId);
  }, delay);
};

/**
 * Handles file import for workflow recordings
 * @param {File} file - File object to import
 * @param {Function} onSuccess - Success callback
 * @param {Function} onError - Error callback
 */
export const handleWorkflowImport = async (file, onSuccess, onError) => {
  try {
    if (!file || !(file instanceof File)) {
      const error = new Error('Invalid file provided for import');
      log.error(error.message);
      showMessage('error', 'Please select a valid file');
      if (onError) onError(error);
      return;
    }
    
    const fileName = file.name.toLowerCase();
    const isJson = fileName.endsWith('.json');
    const isHar = fileName.endsWith('.har');
    const isVideo = fileName.endsWith('.mp4') || fileName.endsWith('.webm') || fileName.endsWith('.avi');
    
    if (!isJson && !isHar && !isVideo) {
      const error = new Error('Invalid file type. Supported formats: JSON, HAR, MP4, WebM, AVI');
      log.error(error.message);
      showMessage('error', 'Please select a JSON, HAR, or video file');
      if (onError) onError(error);
      return;
    }
    
    log.debug('Importing workflow recording file:', file.name, 'Type:', { isJson, isHar, isVideo });
    
    if (isVideo) {
      // Handle video import
      showMessage('error', 'Video import is not yet implemented. Please export recordings as JSON from the browser.');
      if (onError) onError(new Error('Video import not implemented'));
      return;
    }
    
    if (isHar) {
      // Handle HAR import
      showMessage('error', 'HAR import is not yet implemented. Please export recordings as JSON from the browser.');
      if (onError) onError(new Error('HAR import not implemented'));
      return;
    }
    
    // Handle JSON import
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target.result;
        const data = JSON.parse(content.toString());
        
        // Extract tag and description from metadata if present
        let tag = null;
        let description = null;
        
        if (data.metadata) {
          tag = data.metadata.tag || null;
          description = data.metadata.description || null;
        }
        
        // Import the workflow recording data with tag and description
        if (!window.electronAPI?.saveUploadedRecording) {
          throw new Error('Save functionality not available');
        }
        
        // Pass the recording data along with tag and description
        const recordingToSave = {
          ...data,
          tag,
          description
        };
        
        await window.electronAPI.saveUploadedRecording(recordingToSave);
        showMessage('success', `Workflow recording imported from ${file.name}`);
        
        if (onSuccess) onSuccess(data);
      } catch (error) {
        log.error('Error parsing imported file:', error);
        showMessage('error', 'Invalid workflow recording file format');
        if (onError) onError(error);
      }
    };
    
    reader.readAsText(file);
  } catch (error) {
    log.error('Error importing workflow recording:', error);
    showMessage('error', 'Failed to import workflow recording');
    if (onError) onError(error);
  }
};

/**
 * Creates a sticky scroll handler for workflow recording components
 * @param {React.RefObject} elementRef - Ref to the element to make sticky
 * @param {Function} setIsSticky - State setter for sticky status
 * @param {number} headerHeight - Height of the app header (default: 64px)
 * @returns {Function} Cleanup function
 */
export const createStickyScrollHandler = (elementRef, setIsSticky, headerHeight = 64) => {
  const handleScroll = () => {
    if (!elementRef?.current) return;

    const rect = elementRef.current.getBoundingClientRect();
    
    // Element should be sticky when its top edge goes above the app header
    setIsSticky(rect.top <= headerHeight);
  };

  // Listen to window scroll
  if (typeof window !== 'undefined') {
    window.addEventListener('scroll', handleScroll, { passive: true });
  }
  
  // Also check for scrollable containers
  const containers = [
    '.content-container',
    '.ant-tabs-content-holder', 
    '.ant-tabs-content',
    '.app-content'
  ];
  
  const containerElements = [];
  if (typeof document !== 'undefined') {
    containers.forEach(selector => {
      const element = document.querySelector(selector);
      if (element) {
        element.addEventListener('scroll', handleScroll, { passive: true });
        containerElements.push(element);
      }
    });
  }

  // Return cleanup function
  return () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('scroll', handleScroll);
    }
    containerElements.forEach(element => {
      if (element && element.removeEventListener) {
        element.removeEventListener('scroll', handleScroll);
      }
    });
  };
};