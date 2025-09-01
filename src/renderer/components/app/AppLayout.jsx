import React from 'react';
import { Layout, theme } from 'antd';
import { AppHeader } from './AppHeader';
import { AppFooter } from './AppFooter';
import { AppTabs } from './AppTabs';
import SettingsModal from '../modals/settings';
import AboutModal from '../modals/AboutModal';
import ExportModal from '../modals/export-config';
import ImportModal from '../modals/import-config/ImportModal';
import UpdateNotification from '../modals/update-notification';
import TrayMenu from '../features/TrayMenu';
import { CircuitBreakerStatus } from '../status/CircuitBreakerStatus';
import { DebugSourceInfo } from '../status/DebugSourceInfo';
import { DebugNetworkState } from '../status/DebugNetworkState';

const { Content } = Layout;

export function AppLayout({
  appVersion,
  activeTab,
  tabScrollPositions,
  settingsVisible,
  settingsInitialTab,
  settingsAction,
  aboutModalVisible,
  exportModalVisible,
  importModalVisible,
  currentRecord,
  recordPlaybackTime,
  autoHighlight,
  settings,
  sources,
  onTabChange,
  onTabScrollPositionChange,
  onRecordChange,
  onPlaybackTimeChange,
  onAutoHighlightChange,
  onAddSource,
  onRemoveSource,
  onRefreshSource,
  onUpdateSource,
  onExport,
  onImport,
  onCheckForUpdates,
  onOpenSettings,
  onOpenAbout,
  onSettingsCancel,
  onAboutCancel,
  onSettingsSave,
  onExportModalCancel,
  onImportModalCancel,
  onHandleExport,
  onHandleImport,
  preloadedEnvData,
  updateNotificationRef
}) {
  const { token } = theme.useToken();

  return (
    <Layout className="app-container" style={{ background: token.colorBgLayout }}>
      <AppHeader
        onExport={onExport}
        onImport={onImport}
        onCheckForUpdates={onCheckForUpdates}
        onOpenSettings={onOpenSettings}
        onOpenAbout={onOpenAbout}
        theme={token}
      />

      <Content className={`app-content ${typeof window !== 'undefined' && window.electronAPI?.platform ? `platform-${window.electronAPI.platform}` : ''}`} style={{ background: token.colorBgContainer }}>
        <AppTabs
          activeTab={activeTab}
          onTabChange={onTabChange}
          tabScrollPositions={tabScrollPositions}
          onTabScrollPositionChange={onTabScrollPositionChange}
          currentRecord={currentRecord}
          recordPlaybackTime={recordPlaybackTime}
          autoHighlight={autoHighlight}
          onRecordChange={onRecordChange}
          onPlaybackTimeChange={onPlaybackTimeChange}
          onAutoHighlightChange={onAutoHighlightChange}
          sources={sources}
          onAddSource={onAddSource}
          onRemoveSource={onRemoveSource}
          onRefreshSource={onRefreshSource}
          onUpdateSource={onUpdateSource}
          tutorialMode={settings?.tutorialMode}
        />
      </Content>

      <AppFooter
        appVersion={appVersion}
        theme={token}
        debugComponents={
          settings?.developerMode && (
            <>
              <CircuitBreakerStatus inFooter={true} />
              <DebugSourceInfo inFooter={true} />
              <DebugNetworkState inFooter={true} />
            </>
          )
        }
      />

      <SettingsModal
        open={settingsVisible}
        settings={settings}
        onCancel={onSettingsCancel}
        onSave={onSettingsSave}
        initialTab={settingsInitialTab}
        initialAction={settingsAction}
      />

      <AboutModal
        open={aboutModalVisible}
        onClose={onAboutCancel}
        appVersion={appVersion}
      />

      <ExportModal
        visible={exportModalVisible}
        onCancel={onExportModalCancel}
        onExport={onHandleExport}
      />

      <ImportModal
        visible={importModalVisible}
        onClose={onImportModalCancel}
        onImport={onHandleImport}
        preloadedEnvData={preloadedEnvData}
      />

      <UpdateNotification ref={updateNotificationRef} />

      <TrayMenu />
    </Layout>
  );
}