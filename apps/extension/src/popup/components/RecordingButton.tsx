import { StopOutlined, VideoCameraOutlined } from '@ant-design/icons';
import { App, Button, Tooltip } from 'antd';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { getRecordingState, startRecording, stopRecording } from '@/popup/utils/recording';

interface RecordingButtonProps {
  useWidget?: boolean;
}

const RecordingButton: React.FC<RecordingButtonProps> = ({ useWidget = false }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { message } = App.useApp();

  const checkRecordingState = useCallback(async (): Promise<void> => {
    try {
      const state = await getRecordingState();
      setIsRecording(state.isRecording);
    } catch (_error) {
      setIsRecording(false);
    }
  }, []);

  useEffect(() => {
    void checkRecordingState();

    const handleFocus = (): void => {
      void checkRecordingState();
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [checkRecordingState]);

  const handleToggleRecording = async (): Promise<void> => {
    setIsLoading(true);

    try {
      if (isRecording) {
        await stopRecording();
        setIsRecording(false);
        message.success({
          content: 'Workflow saved! Open desktop app -> Workflows tab',
          duration: 7,
          style: {
            marginTop: '16px',
          },
        });
      } else {
        const result = await startRecording(useWidget);
        if (result.success || result.preNavigation) {
          setIsRecording(true);
          if (result.preNavigation) {
            message.info('Recording started! Navigate to a page to begin capturing', 3);
            setTimeout(() => window.close(), 2000);
          } else {
            message.success('Recording started', 2);
            setTimeout(() => window.close(), 1000);
          }
        }
      }
    } catch (error) {
      console.error(new Date().toISOString(), 'ERROR', '[RecordingButton]', 'Recording error:', error);
      message.error((error as Error).message || 'Failed to start workflow');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Tooltip
      title={
        isRecording
          ? 'Stop Recording'
          : 'Capture current browser tab activity. Create a demo or debug technical problems.'
      }
    >
      <Button
        type={isRecording ? 'primary' : 'default'}
        danger={isRecording}
        size="middle"
        icon={isRecording ? <StopOutlined /> : <VideoCameraOutlined />}
        loading={isLoading}
        onClick={handleToggleRecording}
        className="recording-button"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          height: '36px',
          padding: '0 20px',
          fontWeight: 500,
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
        }}
      >
        {isRecording ? 'Stop Workflow' : 'Record Workflow'}
      </Button>
    </Tooltip>
  );
};

export default RecordingButton;
