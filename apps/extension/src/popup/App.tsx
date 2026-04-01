import ErrorBoundary from '@components/ErrorBoundary';
import { HeaderProvider } from '@context/HeaderContext';
import { useTheme } from '@context/ThemeContext';
import { useKeyboardNavigation } from '@hooks/useKeyboardNavigation';
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

const AppContent: React.FC = () => {
  const { isDarkMode, themeMode, setThemeMode, toggleCompactMode } = useTheme();
  const [activeTab, setActiveTab] = useState<string | null>(null);

  // Pagination + row info — set by the active tab component via RulesList
  const [pageInfo, setPageInfo] = useState<{
    visibleRowCount: number;
    visibleRowIds: readonly (string | number)[];
    hasNextPage: boolean;
    hasPrevPage: boolean;
    onNextPage?: () => void;
    onPrevPage?: () => void;
  }>({ visibleRowCount: 0, visibleRowIds: [], hasNextPage: false, hasPrevPage: false });

  // Row action callbacks — set by the active tab component via RulesList
  const [rowActions, setRowActions] = useState<{
    onToggleRow?: (index: number) => void;
    onExpandRow?: (index: number) => void;
    onCollapseRow?: (index: number) => void;
    onEditRow?: (index: number) => void;
    onCopyRow?: (index: number) => void;
    onDeleteRow?: (index: number) => void;
    onAddRule?: () => void;
  }>({});

  // Footer action refs — set by Footer component
  const [footerActions, setFooterActions] = useState<{
    onToggleRecording?: () => void;
    onToggleRulesPause?: () => void;
  }>({});

  const cycleTheme = useCallback(() => {
    const currentIndex = THEME_CYCLE.indexOf(themeMode as (typeof THEME_CYCLE)[number]);
    const nextIndex = (currentIndex + 1) % THEME_CYCLE.length;
    setThemeMode(THEME_CYCLE[nextIndex]);
  }, [themeMode, setThemeMode]);

  const keyboard = useKeyboardNavigation({
    activeTab,
    onTabChange: setActiveTab,
    ...pageInfo,
    ...rowActions,
    ...footerActions,
    onCycleTheme: cycleTheme,
    onToggleCompactMode: toggleCompactMode,
  });

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

  const handleOpenSetupGuide = async (): Promise<void> => {
    const response = await sendMessage({ type: 'forceOpenWelcomePage' });
    if (!response.error) {
      window.close();
    }
  };

  return (
    <ErrorBoundary>
      <HeaderProvider>
        <div ref={keyboard.containerRef} tabIndex={-1} style={{ outline: 'none', height: '100%' }}>
          <Layout className="app-container" data-theme={isDarkMode ? 'dark' : 'light'}>
            <Header
              onOpenSetupGuide={handleOpenSetupGuide}
              onShowShortcuts={() => keyboard.setIsShortcutsOverlayVisible(true)}
            />
            <Content className="content">
              <ConnectionInfo />
              <div className="entries-list">
                <RulesList
                  activeTab={activeTab}
                  onTabChange={handleTabChange}
                  focusedRowIndex={keyboard.focusedRowIndex}
                  pendingDeleteIndex={keyboard.pendingDeleteIndex}
                  onPageInfoChange={setPageInfo}
                  onRowActionsChange={setRowActions}
                />
              </div>
            </Content>
            <Footer onActionsReady={setFooterActions} />
          </Layout>
          <KeyboardShortcutsOverlay
            visible={keyboard.isShortcutsOverlayVisible}
            onClose={() => keyboard.setIsShortcutsOverlayVisible(false)}
          />
        </div>
      </HeaderProvider>
    </ErrorBoundary>
  );
};

export default AppContent;
