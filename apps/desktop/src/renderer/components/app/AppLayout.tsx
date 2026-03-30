import type { Recording, Source } from '@openheaders/core';
import { Layout, theme } from 'antd';
import type React from 'react';
import TrayMenu from '@/renderer/components/features/TrayMenu';
import AboutModal from '@/renderer/components/modals/AboutModal';
import ExportModal from '@/renderer/components/modals/export-config';
import ImportModal from '@/renderer/components/modals/import-config/ImportModal';
import SettingsModal from '@/renderer/components/modals/settings';
import type { InitialAction } from '@/renderer/components/modals/settings/SettingsModal';
import UpdateNotification from '@/renderer/components/modals/update-notification';
import type { NewSourceData } from '@/renderer/components/sources/source-form';
import { CircuitBreakerStatus } from '@/renderer/components/status/CircuitBreakerStatus';
import { DebugNetworkState } from '@/renderer/components/status/DebugNetworkState';
import { DebugSourceInfo } from '@/renderer/components/status/DebugSourceInfo';
import { DebugWorkspaceSync } from '@/renderer/components/status/DebugWorkspaceSync';
import type { UpdateNotificationHandle } from '@/renderer/hooks/app/useUpdateChecker';
import type { ExportOptions, ImportOptions } from '@/renderer/services/export-import/core/types';
import type { EnvironmentConfigData } from '@/types/environment';
import type { AppSettings } from '@/types/settings';
import { AppFooter } from './AppFooter';
import { AppHeader } from './AppHeader';
import { AppTabs } from './AppTabs';

interface AppLayoutProps {
  isReady: boolean;
  appVersion: string;
  activeTab: string;
  tabScrollPositions: Record<string, number>;
  settingsVisible: boolean;
  settingsInitialTab: string | null;
  settingsAction: InitialAction | null;
  aboutModalVisible: boolean;
  exportModalVisible: boolean;
  importModalVisible: boolean;
  currentRecord: Recording | null;
  recordPlaybackTime: number;
  autoHighlight: boolean;
  settings: AppSettings;
  sources: Source[];
  onTabChange: (tab: string) => void;
  onTabScrollPositionChange: (tab: string, scrollTop: number) => void;
  onRecordChange: (record: Recording | null) => void;
  onPlaybackTimeChange: (time: number) => void;
  onAutoHighlightChange: (highlight: boolean) => void;
  onAddSource: (sourceData: NewSourceData) => Promise<boolean>;
  onRemoveSource: (sourceId: string) => Promise<boolean>;
  onRefreshSource: (sourceId: string) => Promise<boolean>;
  onUpdateSource: (sourceId: string, updates: Partial<Source>) => Promise<Source | null>;
  onExport: () => void;
  onImport: () => void;
  onCheckForUpdates: () => void;
  onOpenSettings: () => void;
  onOpenAbout: () => void;
  onSettingsCancel: () => void;
  onAboutCancel: () => void;
  onSettingsSave: (values: Partial<AppSettings>) => Promise<void>;
  onExportModalCancel: () => void;
  onImportModalCancel: () => void;
  onHandleExport: (config: ExportOptions) => void;
  onHandleImport: (data: ImportOptions) => Promise<void>;
  preloadedEnvData: Partial<EnvironmentConfigData> | null;
  updateNotificationRef: React.MutableRefObject<UpdateNotificationHandle | null>;
}

const { Content } = Layout;

export function AppLayout({
  isReady,
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
  updateNotificationRef,
}: AppLayoutProps) {
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

      <Content
        className={`app-content ${typeof window !== 'undefined' && window.electronAPI?.platform ? `platform-${window.electronAPI.platform}` : ''}`}
        style={{ background: token.colorBgContainer }}
      >
        <AppTabs
          isReady={isReady}
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
          tutorialMode={Boolean(settings?.tutorialMode)}
        />
      </Content>

      <AppFooter
        appVersion={appVersion}
        debugComponents={
          !!settings?.developerMode && (
            <>
              <DebugWorkspaceSync inFooter={true} />
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
        initialTab={settingsInitialTab ?? undefined}
        initialAction={settingsAction ?? undefined}
      />

      <AboutModal open={aboutModalVisible} onClose={onAboutCancel} appVersion={appVersion} />

      <ExportModal visible={exportModalVisible} onCancel={onExportModalCancel} onExport={onHandleExport} />

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
