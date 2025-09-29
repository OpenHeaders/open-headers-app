import React from 'react';
import { SettingsProvider } from '../ui';
import { ThemeProvider } from '../ui';
import { WorkspaceSwitchProvider } from '../ui';
import { TotpProvider } from '../services';
import { EnvironmentProvider } from '../data';
import { SourceProvider } from '../data';
import { WorkspaceProvider } from '../data';
import { WebSocketProvider } from '../services';
import { NavigationProvider } from './NavigationContext';
import { RefreshManagerProvider } from '../services';
import { App } from 'antd';
import { MessageInitializer } from '../../utils';
import { MessageProvider } from '../../utils';

/**
 * Combined Settings and Theme Provider
 * Reduces nesting by combining related contexts
 */
export const SettingsAndThemeProvider = ({ children }) => {
    return (
        <SettingsProvider>
            <ThemeProvider>
                <WorkspaceSwitchProvider>
                    {children}
                </WorkspaceSwitchProvider>
            </ThemeProvider>
        </SettingsProvider>
    );
};

/**
 * Combined Workspace Data Provider
 * Combines Source, Environment, and Workspace contexts that all use centralized services
 * Note: WorkspaceProvider must be first as other providers depend on workspace state
 */
export const WorkspaceDataProvider = ({ children }) => {
    return (
        <WorkspaceProvider>
            <EnvironmentProvider>
                <SourceProvider>
                    {children}
                </SourceProvider>
            </EnvironmentProvider>
        </WorkspaceProvider>
    );
};

/**
 * Root App Provider
 * Provides all contexts in an optimized nesting structure
 */
export const AppProvider = ({ children }) => {
    return (
        <MessageProvider>
            <SettingsAndThemeProvider>
                <App
                    message={{ maxCount: 5 }}
                    notification={{
                        top: 70,
                        duration: 3,
                        maxCount: 5,
                        placement: 'topRight'
                    }}
                >
                    <MessageInitializer />
                    <WorkspaceDataProvider>
                        <TotpProvider>
                            <RefreshManagerProvider>
                                <WebSocketProvider>
                                    <NavigationProvider>
                                        {children}
                                    </NavigationProvider>
                                </WebSocketProvider>
                            </RefreshManagerProvider>
                        </TotpProvider>
                    </WorkspaceDataProvider>
                </App>
            </SettingsAndThemeProvider>
        </MessageProvider>
    );
};

// Export individual combined providers for flexibility