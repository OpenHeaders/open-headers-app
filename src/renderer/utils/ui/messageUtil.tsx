// We're changing our approach to use the hook pattern
import React, { useEffect } from 'react';
import { useAppMessage } from './MessageProvider';
import { createLogger } from '../error-handling/logger';

const log = createLogger('messageUtil');

/** Message type for the message API */
type MessageType = 'success' | 'error' | 'warning' | 'info';

/** Function signature for showing messages */
type ShowMessageFn = (type: MessageType, content: string, duration?: number) => void;

// These functions will be used outside of React components
let globalShowMessage: ShowMessageFn = (type: MessageType, content: string, duration?: number) => {
    log.debug(`Message API not initialized yet: ${type} - ${content}`);
    // Default implementation that just logs
    log.debug(`This message will not be displayed to user: ${content}`);
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
            globalShowMessage = (type: MessageType, content: string, duration?: number) => {
                log.debug(`Message API reset: ${type} - ${content}`);
            };
        };
    }, [showMessage]);

    // This component doesn't render anything
    return null;
};

// Exported functions that can be used anywhere in the application
export const showMessage = (type: MessageType, content: string, duration = 3) => {
    if (typeof globalShowMessage !== 'function') {
        // Message API not properly initialized
        return;
    }
    globalShowMessage(type, content, duration);
};

export const successMessage = (content: string, duration?: number) => showMessage('success', content, duration);
export const errorMessage = (content: string, duration?: number) => showMessage('error', content, duration);
export const warningMessage = (content: string, duration?: number) => showMessage('warning', content, duration);
export const infoMessage = (content: string, duration?: number) => showMessage('info', content, duration);