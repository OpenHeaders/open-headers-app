/**
 * Update Checker Hook
 *
 * Provides update checking functionality with notification handling.
 */

import React, { useRef } from 'react';
import { notification } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';

interface UseUpdateCheckerReturn {
  updateNotificationRef: React.MutableRefObject<any>;
  handleCheckForUpdates: () => void;
}

/**
 * Hook for managing update checking functionality
 */
export function useUpdateChecker(): UseUpdateCheckerReturn {
  const updateNotificationRef = useRef<any>(null);

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
