/**
 * Update Checker Hook
 * 
 * Provides update checking functionality with notification handling.
 */

import { useRef } from 'react';
import { notification } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';

/**
 * Hook for managing update checking functionality
 * 
 * @returns {Object} - Object containing update notification ref and check handler
 */
export function useUpdateChecker() {
  const updateNotificationRef = useRef(null);

  const handleCheckForUpdates = () => {
    if (updateNotificationRef.current?.checkForUpdates) {
      updateNotificationRef.current.checkForUpdates(true);
    } else {
      window.electronAPI.checkForUpdates(true);

      const loadingIcon = <LoadingOutlined spin />;
      notification.open({
        message: 'Checking for Updates',
        description: 'Looking for new versions…',
        duration: 0,
        key: 'checking-updates',
        icon: loadingIcon
      });
    }
  };

  return {
    updateNotificationRef,
    handleCheckForUpdates
  };
}