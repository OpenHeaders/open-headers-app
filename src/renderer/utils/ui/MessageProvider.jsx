import React, { createContext, useContext } from 'react';
import { message } from 'antd';
import { createLogger } from '../error-handling/logger';

const log = createLogger('MessageProvider');

// Create a context for the message API
const MessageContext = createContext(null);

// Set of recent messages to prevent duplicates
const recentMessages = new Set();

/**
 * MessageProvider component that provides a global message API
 */
export const MessageProvider = ({ children }) => {
    // Get message API from Ant Design
    const [messageApi, contextHolder] = message.useMessage();

    // Export the message API through context
    const showMessage = (type, content, duration = 3) => {
        // Create a message key for deduplication
        const messageKey = `${type}:${content}`;

        // Skip if duplicate
        if (recentMessages.has(messageKey)) {
            log.debug(`Skipping duplicate message: ${content}`);
            return;
        }

        // Log message attempt
        log.debug(`Showing ${type} message: ${content}`);

        // Add to recent messages set
        recentMessages.add(messageKey);

        // Remove from tracking after 2 seconds
        setTimeout(() => {
            recentMessages.delete(messageKey);
        }, 2000);

        // Show the message using the Ant Design message API
        switch (type) {
            case 'success':
                messageApi.success(content, duration);
                break;
            case 'error':
                messageApi.error(content, duration);
                break;
            case 'warning':
                messageApi.warning(content, duration);
                break;
            case 'info':
                messageApi.info(content, duration);
                break;
            default:
                messageApi.info(content, duration);
        }
    };

    return (
        <MessageContext.Provider value={{ showMessage }}>
            {/* This is the key part - renders the message container in the component tree */}
            {contextHolder}
            {children}
        </MessageContext.Provider>
    );
};

/**
 * Hook to use the message API
 */
export const useAppMessage = () => {
    const context = useContext(MessageContext);
    if (!context) {
        throw new Error('useAppMessage must be used within a MessageProvider');
    }
    return context;
};