import ErrorBoundary from '@components/ErrorBoundary';
import { HeaderProvider } from '@context/HeaderContext';
import { KeyboardNavProvider, useKeyboardNav } from '@context/KeyboardNavContext';
import { useTheme } from '@context/ThemeContext';
import { runtime } from '@utils/browser-api';
import { sendMessage } from '@utils/messaging';
import { Layout } from 'antd';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { getBrowserAPI } from '@/types/browser';
import ConnectionInfo from './components/ConnectionInfo';
import Footer from './components/Footer';
import Header from './components/Header';
import KeyboardShortcutsOverlay from './components/KeyboardShortcutsOverlay';
import RulesList from './components/RulesList';

const { Content } = Layout;

const THEME_CYCLE = ['light', 'dark', 'auto'] as const;

const AppInner: React.FC = () => {
  const { isDarkMode } = useTheme();
  const { containerRef, isShortcutsOverlayVisible, setIsShortcutsOverlayVisible } = useKeyboardNav();

  const handleOpenSetupGuide = async (): Promise<void> => {
    const response = await sendMessage({ type: 'forceOpenWelcomePage' });
    if (!response.error) {
      window.close();
    }
  };

  return (
    <div ref={containerRef} tabIndex={-1} style={{ outline: 'none', height: '100%' }}>
      <Layout className="app-container" data-theme={isDarkMode ? 'dark' : 'light'}>
        <Header
          onOpenSetupGuide={handleOpenSetupGuide}
          onShowShortcuts={() => setIsShortcutsOverlayVisible(true)}
        />
        <Content className="content">
          <ConnectionInfo />
          <div className="entries-list">
            <RulesList />
          </div>
        </Content>
        <Footer />
      </Layout>
      <KeyboardShortcutsOverlay
        visible={isShortcutsOverlayVisible}
        onClose={() => setIsShortcutsOverlayVisible(false)}
      />
    </div>
  );
};

const AppContent: React.FC = () => {
  const { themeMode, setThemeMode, toggleCompactMode } = useTheme();
  const [activeTab, setActiveTab] = useState<string | null>(null);

  const cycleTheme = useCallback(() => {
    const currentIndex = THEME_CYCLE.indexOf(themeMode as (typeof THEME_CYCLE)[number]);
    const nextIndex = (currentIndex + 1) % THEME_CYCLE.length;
    setThemeMode(THEME_CYCLE[nextIndex]);
  }, [themeMode, setThemeMode]);

  // Load persisted tab on mount
  useEffect(() => {
    const browserAPI = getBrowserAPI();
    browserAPI.storage.local.get(['activeRulesTab'], (result: Record<string, unknown>) => {
      setActiveTab((result.activeRulesTab as string) || 'all-rules');
    });
  }, []);

  // Persist tab changes
  const handleTabChange = useCallback((key: string) => {
    setActiveTab(key);
    const browserAPI = getBrowserAPI();
    browserAPI.storage.local.set({ activeRulesTab: key });
  }, []);

  useEffect(() => {
    console.log(new Date().toISOString(), 'INFO ', '[Popup]', 'Popup: Establishing connection to background script');

    let port: chrome.runtime.Port | null = null;

    try {
      const browserAPI = getBrowserAPI();
      port = browserAPI.runtime.connect({ name: 'popup' });

      port.onDisconnect.addListener(() => {
        if (browserAPI.runtime.lastError) {
          console.log(
            new Date().toISOString(),
            'INFO ',
            '[Popup]',
            'Popup: Port disconnected:',
            browserAPI.runtime.lastError.message,
          );
        }
      });

      runtime.sendMessage({ type: 'popupOpen' }, (response: unknown) => {
        if (browserAPI.runtime.lastError) {
          console.log(
            new Date().toISOString(),
            'INFO ',
            '[Popup]',
            'Popup: Background script not ready yet:',
            browserAPI.runtime.lastError.message,
          );
        } else if (response) {
          console.log(new Date().toISOString(), 'INFO ', '[Popup]', 'Popup: Received response from background');
        }
      });
    } catch (error) {
      console.log(
        new Date().toISOString(),
        'INFO ',
        '[Popup]',
        'Popup: Error connecting to background:',
        (error as Error).message,
      );
    }

    return () => {
      console.log(new Date().toISOString(), 'INFO ', '[Popup]', 'Popup: Closing, disconnecting from background');
      if (port) {
        try {
          port.disconnect();
        } catch (_error) {
          // Ignore disconnect errors
        }
      }
    };
  }, []);

  return (
    <ErrorBoundary>
      <HeaderProvider>
        <KeyboardNavProvider
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onCycleTheme={cycleTheme}
          onToggleCompactMode={toggleCompactMode}
        >
          <AppInner />
        </KeyboardNavProvider>
      </HeaderProvider>
    </ErrorBoundary>
  );
};

export default AppContent;
