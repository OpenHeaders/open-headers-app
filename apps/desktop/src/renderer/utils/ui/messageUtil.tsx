// We're changing our approach to use the hook pattern
import type React from 'react';
import { useEffect } from 'react';
import { createLogger } from '@/renderer/utils/error-handling/logger';
import { useAppMessage } from './MessageProvider';

const log = createLogger('messageUtil');

/** Message type for the message API */
type MessageType = 'success' | 'error' | 'warning' | 'info';

/** Content accepted by the message API — string or React node (Ant Design supports both). */
type MessageContent = React.ReactNode;

/** Function signature for showing messages */
type ShowMessageFn = (type: MessageType, content: MessageContent, duration?: number) => void;

// These functions will be used outside of React components
let globalShowMessage: ShowMessageFn = (type: MessageType, content: MessageContent, _duration?: number) => {
  log.debug(`Message API not initialized yet: ${type} - ${String(content)}`);
  // Default implementation that just logs
  log.debug(`This message will not be displayed to user: ${String(content)}`);
};

/**
 * Initialize the global message functions
 * This should be called once in a component that has access to the MessageProvider
 */
export const initializeMessageApi = (showMessage: ShowMessageFn) => {
  if (typeof showMessage === 'function') {
    globalShowMessage = showMessage;
    log.info('Message API initialized');
  } else {
    log.error('Failed to initialize Message API: showMessage is not a function');
  }
};

/**
 * Component to initialize the message API
 * Place this once in your application
 */
export const MessageInitializer = () => {
  const { showMessage } = useAppMessage();

  // Initialize the global message functions
  useEffect(() => {
    initializeMessageApi(showMessage);
    return () => {
      // Reset to default implementation when component unmounts
      globalShowMessage = (type: MessageType, content: MessageContent, _duration?: number) => {
        log.debug(`Message API reset: ${type} - ${content}`);
      };
    };
  }, [showMessage]);

  // This component doesn't render anything
  return null;
};

// Exported functions that can be used anywhere in the application
export const showMessage = (type: MessageType, content: MessageContent, duration = 3) => {
  if (typeof globalShowMessage !== 'function') {
    // Message API not properly initialized
    return;
  }
  globalShowMessage(type, content, duration);
};

export const successMessage = (content: MessageContent, duration?: number) => showMessage('success', content, duration);
export const errorMessage = (content: MessageContent, duration?: number) => showMessage('error', content, duration);
