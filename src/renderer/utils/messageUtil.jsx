// We're changing our approach to use the hook pattern
import React, { useEffect } from 'react';
import { useAppMessage } from './MessageProvider';
import { createLogger } from './logger';

const log = createLogger('messageUtil');

// These functions will be used outside of React components
let globalShowMessage = (type, content, duration) => {
    log.debug(`Message API not initialized yet: ${type} - ${content}`);
    // Default implementation that just logs
    log.debug(`This message will not be displayed to user: ${content}`);
};

/**
 * Initialize the global message functions
 * This should be called once in a component that has access to the MessageProvider
 */
export const initializeMessageApi = (showMessage) => {
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
            globalShowMessage = (type, content, duration) => {
                log.debug(`Message API reset: ${type} - ${content}`);
            };
        };
    }, [showMessage]);

    // This component doesn't render anything
    return null;
};

// Exported functions that can be used anywhere in the application
export const showMessage = (type, content, duration = 3) => {
    if (typeof globalShowMessage !== 'function') {
        // Message API not properly initialized
        return;
    }
    globalShowMessage(type, content, duration);
};

export const successMessage = (content, duration) => showMessage('success', content, duration);
export const errorMessage = (content, duration) => showMessage('error', content, duration);
export const warningMessage = (content, duration) => showMessage('warning', content, duration);
export const infoMessage = (content, duration) => showMessage('info', content, duration);