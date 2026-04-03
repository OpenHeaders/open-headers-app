import { DownloadOutlined } from '@ant-design/icons';
import { useKeyboardNav } from '@context/KeyboardNavContext';
import { useHeader } from '@hooks/useHeader';
import { storage } from '@utils/browser-api';
import { Alert, Button, Space } from 'antd';
import type React from 'react';
import { useEffect, useState } from 'react';

const ConnectionInfo: React.FC = () => {
  const { isConnected, isStatusLoaded, headerEntries } = useHeader();
  const { isTourOpen } = useKeyboardNav();
  const [dismissed, setDismissed] = useState(false);
  const [lastConnectionState, setLastConnectionState] = useState(isConnected);

  useEffect(() => {
    storage.local.get(['connectionAlertDismissed'], (result: Record<string, unknown>) => {
      if (result.connectionAlertDismissed) {
        setDismissed(true);
      }
    });
  }, []);

  useEffect(() => {
    if (!lastConnectionState && isConnected) {
      setDismissed(false);
      storage.local.remove(['connectionAlertDismissed']);
    }
    setLastConnectionState(isConnected);
  }, [isConnected, lastConnectionState]);

  const isVisible = isStatusLoaded && !isConnected && !dismissed && !isTourOpen;

  const handleDismiss: React.MouseEventHandler<HTMLButtonElement> = () => {
    setDismissed(true);
    storage.local.set({ connectionAlertDismissed: true });
  };

  // Close on Escape key
  useEffect(() => {
    if (!isVisible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDismissed(true);
        storage.local.set({ connectionAlertDismissed: true });
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isVisible]);

  if (!isVisible) {
    return null;
  }

  return (
    <div style={{ position: 'fixed', top: 8, right: 8, zIndex: 1000 }}>
      <Alert
        title="Desktop App Not Connected"
        description={
          <div>
            {Object.keys(headerEntries).length > 0 && (
              <div style={{ fontSize: 12, marginBottom: 6 }}>
                Your rules are still active using cached data.
                <br />
                Reconnect to sync latest changes.
              </div>
            )}
            <Space size={6}>
              <Button
                type="primary"
                size="small"
                icon={<DownloadOutlined />}
                onClick={() => window.open('https://openheaders.io', '_blank')}
              >
                Download App
              </Button>
            </Space>
          </div>
        }
        type="info"
        showIcon
        closable={{ closeIcon: true, onClose: handleDismiss, 'aria-label': 'close' }}
        style={{ boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)', borderRadius: 8 }}
      />
    </div>
  );
};

export default ConnectionInfo;
