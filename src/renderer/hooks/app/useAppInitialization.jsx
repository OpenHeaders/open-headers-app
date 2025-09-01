/**
 * App Initialization Hook
 * 
 * Handles app startup effects including version retrieval and record opening setup.
 */

import { useEffect } from 'react';
import { convertNewRecordingFormat } from '../../utils/formatters/recordConverter';
const { createLogger } = require('../../utils/error-handling/logger');
const log = createLogger('useAppInitialization');

/**
 * Hook for managing app initialization effects
 * 
 * @param {Object} deps - Dependencies
 * @param {Function} deps.setAppVersion - Sets the application version
 * @param {Function} deps.setActiveTab - Sets the active tab
 * @param {Function} deps.setCurrentRecord - Sets the current record
 */
export function useAppInitialization({ setAppVersion, setActiveTab, setCurrentRecord }) {
  useEffect(() => {
    const getAppVersion = async () => {
      try {
        if (window.electronAPI && window.electronAPI.getAppVersion) {
          const version = await window.electronAPI.getAppVersion();
          setAppVersion(version);
        }
      } catch (error) {
        log.error('Failed to get app version:', error);
      }
    };

    // Initialize app version on startup
    getAppVersion();

    // Set up listener for opening record recordings from main process
    const unsubscribe = window.electronAPI.onOpenRecordRecording((data) => {
      log.info('Received request to open record recording:', data);
      setActiveTab('record-viewer');
      if (data && data.record) {
        const convertedRecord = convertNewRecordingFormat(data.record);
        setCurrentRecord(convertedRecord);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [setAppVersion, setActiveTab, setCurrentRecord]);
}