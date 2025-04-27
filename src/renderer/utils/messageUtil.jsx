// We're changing our approach to use the hook pattern
import { useAppMessage } from './MessageProvider';

// These functions will be used outside of React components
let globalShowMessage = (type, content, duration) => {
    console.log(`[messageUtil] Message API not initialized yet: ${type} - ${content}`);
    // Default implementation that just logs
    console.log(`[messageUtil] This message will not be displayed to user: ${content}`);
};

/**
 * Initialize the global message functions
 * This should be called once in a component that has access to the MessageProvider
 */
export const initializeMessageApi = (showMessage) => {
    globalShowMessage = showMessage;
    console.log('[messageUtil] Message API initialized');
};

/**
 * Component to initialize the message API
 * Place this once in your application
 */
export const MessageInitializer = () => {
    const { showMessage } = useAppMessage();

    // Initialize the global message functions
    initializeMessageApi(showMessage);

    // This component doesn't render anything
    return null;
};

// Exported functions that can be used anywhere in the application
export const showMessage = (type, content, duration = 3) => {
    globalShowMessage(type, content, duration);
};

export const successMessage = (content, duration) => showMessage('success', content, duration);
export const errorMessage = (content, duration) => showMessage('error', content, duration);
export const warningMessage = (content, duration) => showMessage('warning', content, duration);
export const infoMessage = (content, duration) => showMessage('info', content, duration);