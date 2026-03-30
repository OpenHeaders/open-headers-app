/**
 * Update Checker Hook
 *
 * Provides update checking functionality with notification handling.
 */

import { LoadingOutlined } from '@ant-design/icons';
import { notification } from 'antd';
import type React from 'react';
import { useRef } from 'react';

export interface UpdateNotificationHandle {
  checkForUpdates: (isManual: boolean) => void;
}

interface UseUpdateCheckerReturn {
  updateNotificationRef: React.MutableRefObject<UpdateNotificationHandle | null>;
  handleCheckForUpdates: () => void;
}

/**
 * Hook for managing update checking functionality
 */
export function useUpdateChecker(): UseUpdateCheckerReturn {
  const updateNotificationRef = useRef<UpdateNotificationHandle | null>(null);

  const handleCheckForUpdates = () => {
    if (updateNotificationRef.current?.checkForUpdates) {
      updateNotificationRef.current.checkForUpdates(true);
    } else {
      window.electronAPI.checkForUpdates(true);

      const loadingIcon = <LoadingOutlined spin />;
      notification.open({
        title: 'Checking for Updates',
        description: 'Looking for new versions…',
        duration: 0,
        key: 'checking-updates',
        icon: loadingIcon,
      });
    }
  };

  return {
    updateNotificationRef,
    handleCheckForUpdates,
  };
}
