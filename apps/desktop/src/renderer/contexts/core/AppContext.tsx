import { App } from 'antd';
import React from 'react';
import { MessageInitializer, MessageProvider } from '../../utils';
import { EnvironmentProvider, SourceProvider, WorkspaceProvider } from '../data';
import { RefreshManagerProvider, TotpProvider, WebSocketProvider } from '../services';
import { SettingsProvider, ThemeProvider, WorkspaceSwitchProvider } from '../ui';
import { NavigationProvider } from './NavigationContext';

// Create a dummy context for backward compatibility
export const AppContext = React.createContext(null);

// Dummy hook for backward compatibility
export const useApp = () => {
  const context = React.useContext(AppContext);
  return context;
};

/**
 * Combined Settings and Theme Provider
 * Reduces nesting by combining related contexts
 */
export const SettingsAndThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <SettingsProvider>
      <ThemeProvider>
        <WorkspaceSwitchProvider>{children}</WorkspaceSwitchProvider>
      </ThemeProvider>
    </SettingsProvider>
  );
};

/**
 * Combined Workspace Data Provider
 * Combines Source, Environment, and Workspace contexts that all use centralized services
 * Note: WorkspaceProvider must be first as other providers depend on workspace state
 */
export const WorkspaceDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <WorkspaceProvider>
      <EnvironmentProvider>
        <SourceProvider>{children}</SourceProvider>
      </EnvironmentProvider>
    </WorkspaceProvider>
  );
};

/**
 * Root App Provider
 * Provides all contexts in an optimized nesting structure
 */
export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <MessageProvider>
      <SettingsAndThemeProvider>
        <App
          message={{ maxCount: 5 }}
          notification={{
            top: 70,
            duration: 3,
            maxCount: 5,
            placement: 'topRight',
          }}
        >
          <MessageInitializer />
          <WorkspaceDataProvider>
            <TotpProvider>
              <RefreshManagerProvider>
                <WebSocketProvider>
                  <NavigationProvider>{children}</NavigationProvider>
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
