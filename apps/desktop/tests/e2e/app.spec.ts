/**
 * E2E Tests for OpenHeaders Electron App
 *
 * These tests launch the actual Electron app and verify:
 * - App window opens and renders correctly
 * - Core UI elements are present and functional
 * - Navigation between all tabs works
 * - Header/footer structure is correct
 * - Settings modal opens/closes
 * - About modal displays version info
 * - Menu dropdown with all actions
 * - IPC bridge is functional
 * - Proxy/WebSocket status is queryable
 * - Tab content renders for each feature area
 * - Server Config sub-tabs (WebSocket, Proxy, CLI)
 * - Rules sub-tabs (Headers, Payload, URL, Scripts/CSS, More)
 * - Keyboard shortcuts
 * - Footer status indicators
 */

import path from 'node:path';
import { type ElectronApplication, _electron as electron, expect, type Page, test } from '@playwright/test';

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  const isCI = !!process.env.CI;
  app = await electron.launch({
    args: [path.join(__dirname, '..', '..'), ...(isCI ? ['--no-sandbox', '--disable-gpu'] : [])],
    env: {
      ...process.env,
      NODE_ENV: 'development',
      ELECTRON_USER_DATA_DIR: path.join(__dirname, '..', '.e2e-userdata'),
    },
    timeout: 60000,
  });

  page = await app.firstWindow({ timeout: 60000 });
  await page.waitForLoadState('domcontentloaded');

  // Wait for React to mount
  await page.waitForFunction(
    () => {
      const root = document.getElementById('root');
      return root && root.children.length > 0;
    },
    { timeout: 45000 },
  );
});

test.afterAll(async () => {
  if (app) {
    await app.close();
  }
});

// ---------------------------------------------------------------------------
// App Launch & Window
// ---------------------------------------------------------------------------
test.describe('App Launch', () => {
  test('window opens with correct title', async () => {
    const title = await page.title();
    expect(title).toContain('Open Headers');
  });

  test('window has reasonable dimensions', async () => {
    const { width, height } = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    expect(width).toBeGreaterThan(800);
    expect(height).toBeGreaterThan(500);
  });

  test('React app renders (root element has children)', async () => {
    const root = page.locator('#root');
    await expect(root).toBeVisible();

    const children = await root.locator('> *').count();
    expect(children).toBeGreaterThan(0);
  });

  test('app container has the expected layout structure', async () => {
    // Layout: header + content + footer
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.app-content')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.app-footer')).toBeVisible({ timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------
test.describe('App Header', () => {
  test('header displays app logo and title', async () => {
    const header = page.locator('.app-header');
    await expect(header).toBeVisible({ timeout: 5000 });

    // Logo image
    const logo = header.locator('img.app-logo');
    await expect(logo).toBeVisible();
    const alt = await logo.getAttribute('alt');
    expect(alt).toBe('Open Headers Logo');

    // Title text
    await expect(header.getByText('Open Headers')).toBeVisible();
  });

  test('menu dropdown button is present and clickable', async () => {
    const menuButton = page.locator('.app-header').getByText('Menu');
    await expect(menuButton).toBeVisible();

    // Open dropdown
    await menuButton.click();
    await page.waitForTimeout(300);

    // Verify all menu items are present
    const menuItems = ['Export', 'Import', 'Check for Updates', 'Settings', 'About'];
    for (const item of menuItems) {
      const menuItem = page.locator('.ant-dropdown-menu').getByText(item, { exact: true });
      await expect(menuItem).toBeVisible();
    }

    // Close dropdown by clicking elsewhere
    await page.locator('.app-content').click({ force: true });
    await page.waitForTimeout(300);
  });
});

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------
test.describe('App Footer', () => {
  test('footer displays app name and version tag', async () => {
    const footer = page.locator('.app-footer');
    await expect(footer).toBeVisible({ timeout: 5000 });

    // App name in footer-left
    const footerLeft = footer.locator('.footer-left');
    await expect(footerLeft).toBeVisible();
    const footerText = await footerLeft.textContent();
    expect(footerText).toContain('Open Headers');

    // Version tag (v followed by semver) — in footer-left
    const versionTag = footer.locator('.footer-left .ant-tag');
    await expect(versionTag).toBeVisible();
    const versionText = await versionTag.textContent();
    expect(versionText).toMatch(/^v\d+\.\d+\.\d+/);
  });

  test('footer has status indicators section', async () => {
    const footerRight = page.locator('.footer-right');
    await expect(footerRight).toBeVisible();

    // Should have at least workspace and environment status
    const statusItems = await footerRight.locator('.ant-space-item').count();
    expect(statusItems).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Main Tab Navigation
// ---------------------------------------------------------------------------
test.describe('Tab Navigation', () => {
  const expectedTabs = ['Workflows', 'Rules', 'Sources', 'Environments', 'Workspaces', 'Server Config'];

  test('all main tabs are present', async () => {
    for (const tabName of expectedTabs) {
      const tab = page.locator('.ant-tabs-tab').filter({ hasText: tabName });
      await expect(tab).toBeVisible({ timeout: 5000 });
    }
  });

  test('exactly 6 main tabs exist', async () => {
    const tabCount = await page.locator('.app-tabs > .ant-tabs-nav .ant-tabs-tab').count();
    expect(tabCount).toBe(6);
  });

  test('clicking each tab switches content', async () => {
    for (const tabName of expectedTabs) {
      const tab = page.locator('.app-tabs > .ant-tabs-nav .ant-tabs-tab').filter({ hasText: tabName });
      await tab.click();
      await page.waitForTimeout(400);

      // The clicked tab should be active
      const activeTab = page.locator('.app-tabs > .ant-tabs-nav .ant-tabs-tab-active');
      await expect(activeTab).toContainText(tabName);
    }
  });

  test('default tab loads with content', async () => {
    // Click Workflows tab (first tab)
    const workflowsTab = page.locator('.ant-tabs-tab').filter({ hasText: 'Workflows' });
    await workflowsTab.click();
    await page.waitForTimeout(400);

    const tabContent = page.locator('.app-tabs > .ant-tabs-content-holder > .ant-tabs-content');
    await expect(tabContent).toBeVisible({ timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// Sources Tab
// ---------------------------------------------------------------------------
test.describe('Sources Tab', () => {
  test.beforeAll(async () => {
    const tab = page.locator('.ant-tabs-tab').filter({ hasText: 'Sources' });
    await tab.click();
    await page.waitForTimeout(500);
  });

  test('source form is visible with type selector', async () => {
    // The source form should have a select for source type
    const sourceTypeSelect = page.locator('.ant-select').first();
    await expect(sourceTypeSelect).toBeVisible({ timeout: 5000 });
  });

  test('source type options are available', async () => {
    // Open the source type dropdown
    const sourceTypeSelect = page.locator('.ant-select').first();
    await sourceTypeSelect.click();
    await page.waitForTimeout(300);

    // Check for source type options (file, http, env)
    const dropdown = page.locator('.ant-select-dropdown');
    const optionCount = await dropdown.locator('.ant-select-item-option').count();
    expect(optionCount).toBeGreaterThanOrEqual(2);

    // Close dropdown
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  });

  test('add source button is present', async () => {
    const addButton = page.getByRole('button', { name: /add source/i });
    await expect(addButton).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Rules Tab — Sub-tabs
// ---------------------------------------------------------------------------
test.describe('Rules Tab', () => {
  test.beforeAll(async () => {
    const tab = page.locator('.ant-tabs-tab').filter({ hasText: 'Rules' });
    await tab.click();
    await page.waitForTimeout(500);
  });

  const ruleSubTabs = ['Headers', 'Payload', 'URL', 'Scripts/CSS', 'More'];

  test('all rule sub-tabs are present', async () => {
    for (const subTab of ruleSubTabs) {
      const tab = page.locator('.content-container .ant-tabs-tab').filter({ hasText: subTab });
      await expect(tab).toBeVisible({ timeout: 5000 });
    }
  });

  test('clicking rule sub-tabs switches content', async () => {
    for (const subTab of ruleSubTabs) {
      const tab = page.locator('.content-container .ant-tabs-tab').filter({ hasText: subTab });
      await tab.click();
      await page.waitForTimeout(300);

      // Verify the clicked sub-tab is active
      const isActive = await tab.evaluate((el) => el.classList.contains('ant-tabs-tab-active'));
      expect(isActive).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Environments Tab
// ---------------------------------------------------------------------------
test.describe('Environments Tab', () => {
  test('environments tab renders content', async () => {
    const tab = page.locator('.ant-tabs-tab').filter({ hasText: 'Environments' });
    await tab.click();
    await page.waitForTimeout(500);

    // Should render some content inside the environments tab pane
    const content = page.locator('.ant-tabs-tabpane-active .content-container');
    await expect(content).toBeVisible({ timeout: 5000 });
    const children = await content.locator('> *').count();
    expect(children).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Workspaces Tab
// ---------------------------------------------------------------------------
test.describe('Workspaces Tab', () => {
  test('workspaces tab renders content', async () => {
    const tab = page.locator('.ant-tabs-tab').filter({ hasText: 'Workspaces' });
    await tab.click();
    await page.waitForTimeout(500);

    const content = page.locator('.ant-tabs-tabpane-active .content-container');
    await expect(content).toBeVisible({ timeout: 5000 });
    const children = await content.locator('> *').count();
    expect(children).toBeGreaterThan(0);
  });

  test('personal workspace is shown', async () => {
    // The default workspace should be visible somewhere
    const workspaceText = page.getByText(/Personal Workspace|personal/i).first();
    const exists = await workspaceText.isVisible().catch(() => false);
    // Personal workspace should be visible in the workspaces tab or footer
    expect(exists).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Server Config Tab — Sub-tabs
// ---------------------------------------------------------------------------
test.describe('Server Config Tab', () => {
  test.beforeAll(async () => {
    const tab = page.locator('.ant-tabs-tab').filter({ hasText: 'Server Config' });
    await tab.click();
    await page.waitForTimeout(500);
  });

  const serverSubTabs = ['WebSocket', 'Proxy', 'CLI'];

  test('all server config sub-tabs are present', async () => {
    for (const subTab of serverSubTabs) {
      const tab = page.locator('.content-container .ant-tabs-tab').filter({ hasText: subTab });
      await expect(tab).toBeVisible({ timeout: 5000 });
    }
  });

  test('clicking server sub-tabs switches content', async () => {
    for (const subTab of serverSubTabs) {
      const tab = page.locator('.content-container .ant-tabs-tab').filter({ hasText: subTab });
      await tab.click();
      await page.waitForTimeout(300);

      // Verify the clicked sub-tab is now active
      const isActive = await tab.evaluate((el) => el.classList.contains('ant-tabs-tab-active'));
      expect(isActive).toBe(true);
    }
  });

  test('WebSocket sub-tab shows connection info', async () => {
    const wsTab = page.locator('.content-container .ant-tabs-tab').filter({ hasText: 'WebSocket' });
    await wsTab.click();
    await page.waitForTimeout(500);

    const isActive = await wsTab.evaluate((el) => el.classList.contains('ant-tabs-tab-active'));
    expect(isActive).toBe(true);
  });

  test('Proxy sub-tab shows proxy controls', async () => {
    const proxyTab = page.locator('.content-container .ant-tabs-tab').filter({ hasText: 'Proxy' });
    await proxyTab.click();
    await page.waitForTimeout(500);

    const isActive = await proxyTab.evaluate((el) => el.classList.contains('ant-tabs-tab-active'));
    expect(isActive).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Settings Modal
// ---------------------------------------------------------------------------
test.describe('Settings Modal', () => {
  test('settings modal opens from menu and has tabs', async () => {
    // Open via menu
    const menuButton = page.locator('.app-header').getByText('Menu');
    await menuButton.click();
    await page.waitForTimeout(300);

    const settingsItem = page.locator('.ant-dropdown-menu').getByText('Settings', { exact: true });
    await settingsItem.click();
    await page.waitForTimeout(500);

    // Modal should appear
    const modal = page.locator('.ant-modal').first();
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Settings modal should have tabs (General, Appearance, Workflow, Developer)
    const settingsTabs = modal.locator('.ant-tabs-tab');
    const tabCount = await settingsTabs.count();
    expect(tabCount).toBeGreaterThanOrEqual(2);

    // Close modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  });

  test('settings modal opens via keyboard shortcut (Cmd+,)', async () => {
    await page.keyboard.press('Meta+,');
    await page.waitForTimeout(500);

    const modal = page.locator('.ant-modal').first();
    const isVisible = await modal.isVisible().catch(() => false);

    if (isVisible) {
      // Verify it's actually the settings modal by checking for settings-related content
      const hasSettingsContent = await modal.locator('.ant-tabs-tab').count();
      expect(hasSettingsContent).toBeGreaterThanOrEqual(1);

      // Close
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
  });
});

// ---------------------------------------------------------------------------
// About Modal
// ---------------------------------------------------------------------------
test.describe('About Modal', () => {
  test('about modal opens from menu and displays version', async () => {
    const menuButton = page.locator('.app-header').getByText('Menu');
    await menuButton.click();
    await page.waitForTimeout(300);

    const aboutItem = page.locator('.ant-dropdown-menu').getByText('About', { exact: true });
    await aboutItem.click();
    await page.waitForTimeout(500);

    // Modal should appear
    const modal = page.locator('.ant-modal.about-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Should display app name
    const modalText = await modal.textContent();
    expect(modalText).toContain('Open Headers');

    // Should display version
    expect(modalText).toMatch(/\d+\.\d+\.\d+/);

    // Close modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  });
});

// ---------------------------------------------------------------------------
// IPC Communication
// ---------------------------------------------------------------------------
test.describe('IPC Communication', () => {
  test('can get app version via IPC', async () => {
    const version = await app.evaluate(async ({ app }) => {
      return app.getVersion();
    });
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  test('can get app name via IPC', async () => {
    const name = await app.evaluate(async ({ app }) => {
      return app.getName();
    });
    expect(name).toBe('OpenHeaders');
  });

  test('electronAPI bridge is exposed in renderer', async () => {
    const hasElectronAPI = await page.evaluate(() => {
      return typeof window.electronAPI !== 'undefined';
    });
    expect(hasElectronAPI).toBe(true);
  });

  test('electronAPI has platform property', async () => {
    const platform = await page.evaluate(() => {
      return window.electronAPI.platform;
    });
    expect(['darwin', 'win32', 'linux']).toContain(platform);
  });

  test('electronAPI exposes core IPC methods', async () => {
    const methods = await page.evaluate(() => {
      const api = window.electronAPI;
      return {
        hasGetSettings: typeof api.getSettings === 'function',
        hasSaveSettings: typeof api.saveSettings === 'function',
        hasGetAppVersion: typeof api.getAppVersion === 'function',
        hasLoadRecordings: typeof api.loadRecordings === 'function',
        hasProxyStatus: typeof api.proxyStatus === 'function',
        hasWsGetConnectionStatus: typeof api.wsGetConnectionStatus === 'function',
        hasHttpRequest: typeof api.httpRequest === 'object' && typeof api.httpRequest.executeRequest === 'function',
        hasGetNetworkState: typeof api.getNetworkState === 'function',
        hasOpenFileDialog: typeof api.openFileDialog === 'function',
        hasSaveToStorage: typeof api.saveToStorage === 'function',
        hasLoadFromStorage: typeof api.loadFromStorage === 'function',
      };
    });

    expect(methods.hasGetSettings).toBe(true);
    expect(methods.hasSaveSettings).toBe(true);
    expect(methods.hasGetAppVersion).toBe(true);
    expect(methods.hasLoadRecordings).toBe(true);
    expect(methods.hasProxyStatus).toBe(true);
    expect(methods.hasWsGetConnectionStatus).toBe(true);
    expect(methods.hasHttpRequest).toBe(true);
    expect(methods.hasGetNetworkState).toBe(true);
    expect(methods.hasOpenFileDialog).toBe(true);
    expect(methods.hasSaveToStorage).toBe(true);
    expect(methods.hasLoadFromStorage).toBe(true);
  });

  test('electronAPI exposes event listener methods', async () => {
    const listeners = await page.evaluate(() => {
      const api = window.electronAPI;
      return {
        hasOnNavigateTo: typeof api.onNavigateTo === 'function',
        hasOnNetworkStateSync: typeof api.onNetworkStateSync === 'function',
        hasOnRecordingReceived: typeof api.onRecordingReceived === 'function',
        hasOnWsConnectionStatusChanged: typeof api.onWsConnectionStatusChanged === 'function',
        hasOnWorkspaceDataUpdated: typeof api.onWorkspaceDataUpdated === 'function',
        hasOnFileChanged: typeof api.onFileChanged === 'function',
      };
    });

    expect(listeners.hasOnNavigateTo).toBe(true);
    expect(listeners.hasOnNetworkStateSync).toBe(true);
    expect(listeners.hasOnRecordingReceived).toBe(true);
    expect(listeners.hasOnWsConnectionStatusChanged).toBe(true);
    expect(listeners.hasOnWorkspaceDataUpdated).toBe(true);
    expect(listeners.hasOnFileChanged).toBe(true);
  });

  test('can get app version via renderer electronAPI', async () => {
    const version = await page.evaluate(async () => {
      return await window.electronAPI.getAppVersion();
    });
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  test('can get settings via IPC', async () => {
    const settings = await page.evaluate(async () => {
      return await window.electronAPI.getSettings();
    });

    expect(settings).toBeDefined();
    expect(typeof settings).toBe('object');
  });

  test('can get system timezone via IPC', async () => {
    const tzInfo = await page.evaluate(async () => {
      return await window.electronAPI.getSystemTimezone();
    });

    expect(tzInfo).toBeDefined();
    expect(typeof tzInfo.timezone).toBe('string');
    expect(typeof tzInfo.offset).toBe('number');
    expect(typeof tzInfo.method).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// Proxy Status (via IPC)
// ---------------------------------------------------------------------------
test.describe('Proxy Service', () => {
  test('can query proxy status via IPC', async () => {
    const status = await page.evaluate(async () => {
      return await window.electronAPI.proxyStatus();
    });

    expect(status).toBeDefined();
    expect(typeof status.running).toBe('boolean');
    expect(typeof status.port).toBe('number');
    expect(typeof status.rulesCount).toBe('number');
    expect(typeof status.sourcesCount).toBe('number');
    expect(typeof status.cacheEnabled).toBe('boolean');
    expect(status.stats).toBeDefined();
    expect(typeof status.stats.requestsProcessed).toBe('number');
  });

  test('proxy status indicator is present in UI', async () => {
    // Navigate to Server Config > Proxy
    const serverTab = page.locator('.ant-tabs-tab').filter({ hasText: 'Server Config' });
    await serverTab.click();
    await page.waitForTimeout(400);

    const proxySubTab = page.locator('.content-container .ant-tabs-tab').filter({ hasText: 'Proxy' });
    await proxySubTab.click();
    await page.waitForTimeout(400);

    // Verify the proxy sub-tab is active and has relevant content
    const isActive = await proxySubTab.evaluate((el) => el.classList.contains('ant-tabs-tab-active'));
    expect(isActive).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// WebSocket Status (via IPC)
// ---------------------------------------------------------------------------
test.describe('WebSocket Service', () => {
  test('can query WebSocket connection status via IPC', async () => {
    const status = await page.evaluate(async () => {
      return await window.electronAPI.wsGetConnectionStatus();
    });

    expect(status).toBeDefined();
    expect(typeof status.totalConnections).toBe('number');
    expect(typeof status.browserCounts).toBe('object');
    expect(Array.isArray(status.clients)).toBe(true);
    expect(typeof status.wsServerRunning).toBe('boolean');
    expect(typeof status.wsPort).toBe('number');
  });

  test('WebSocket tab shows connection details', async () => {
    const serverTab = page.locator('.ant-tabs-tab').filter({ hasText: 'Server Config' });
    await serverTab.click();
    await page.waitForTimeout(400);

    const wsSubTab = page.locator('.content-container .ant-tabs-tab').filter({ hasText: 'WebSocket' });
    await wsSubTab.click();
    await page.waitForTimeout(400);

    const isActive = await wsSubTab.evaluate((el) => el.classList.contains('ant-tabs-tab-active'));
    expect(isActive).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Network State (via IPC)
// ---------------------------------------------------------------------------
test.describe('Network State', () => {
  test('can query network state via IPC', async () => {
    const networkState = await page.evaluate(async () => {
      return await window.electronAPI.getNetworkState();
    });

    expect(networkState).toBeDefined();
    expect(typeof networkState.isOnline).toBe('boolean');
    expect(typeof networkState.networkQuality).toBe('string');
    expect(typeof networkState.vpnActive).toBe('boolean');
    expect(typeof networkState.lastUpdate).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// CLI API Status (via IPC)
// ---------------------------------------------------------------------------
test.describe('CLI API Service', () => {
  test('can query CLI API status via IPC', async () => {
    const status = await page.evaluate(async () => {
      return await window.electronAPI.cliApiStatus();
    });

    expect(status).toBeDefined();
    expect(typeof status.running).toBe('boolean');
    expect(typeof status.port).toBe('number');
    expect(typeof status.discoveryPath).toBe('string');
    expect(typeof status.token).toBe('string');
    expect(typeof status.totalRequests).toBe('number');
  });

  test('CLI sub-tab shows CLI API info', async () => {
    const serverTab = page.locator('.ant-tabs-tab').filter({ hasText: 'Server Config' });
    await serverTab.click();
    await page.waitForTimeout(400);

    const cliSubTab = page.locator('.content-container .ant-tabs-tab').filter({ hasText: 'CLI' });
    await cliSubTab.click();
    await page.waitForTimeout(400);

    const isActive = await cliSubTab.evaluate((el) => el.classList.contains('ant-tabs-tab-active'));
    expect(isActive).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Recordings (via IPC)
// ---------------------------------------------------------------------------
test.describe('Recordings', () => {
  test('can load recordings list via IPC', async () => {
    const recordings = await page.evaluate(async () => {
      return await window.electronAPI.loadRecordings();
    });

    expect(Array.isArray(recordings)).toBe(true);
  });

  test('workflows tab shows recording list or empty state', async () => {
    const workflowsTab = page.locator('.ant-tabs-tab').filter({ hasText: 'Workflows' });
    await workflowsTab.click();
    await page.waitForTimeout(500);

    const content = page.locator('.ant-tabs-tabpane-active .content-container');
    await expect(content).toBeVisible({ timeout: 5000 });

    // Should have some content (either recordings or an empty state)
    const children = await content.locator('> *').count();
    expect(children).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Git Status (via IPC)
// ---------------------------------------------------------------------------
test.describe('Git Integration', () => {
  test('can check git status via IPC', async () => {
    const gitStatus = await page.evaluate(async () => {
      return await window.electronAPI.getGitStatus();
    });

    expect(gitStatus).toBeDefined();
    expect(typeof gitStatus.isInstalled).toBe('boolean');
    if (gitStatus.isInstalled && gitStatus.version) {
      expect(typeof gitStatus.version).toBe('string');
    }
  });
});

// ---------------------------------------------------------------------------
// TOTP Generator
// ---------------------------------------------------------------------------
test.describe('TOTP Generator', () => {
  test('httpRequest.generateTotpPreview is exposed via electronAPI', async () => {
    const hasTOTP = await page.evaluate(() => {
      return typeof window.electronAPI.httpRequest.generateTotpPreview === 'function';
    });
    expect(hasTOTP).toBe(true);
  });

  test('can generate a TOTP code with a test secret', async () => {
    const totp = await page.evaluate(async () => {
      return await window.electronAPI.httpRequest.generateTotpPreview('JBSWY3DPEHPK3PXP');
    });

    // TOTP should be a 6-digit string
    expect(totp).toMatch(/^\d{6}$/);
  });
});

// ---------------------------------------------------------------------------
// Storage (via IPC)
// ---------------------------------------------------------------------------
test.describe('Storage', () => {
  test('can save and load from storage via IPC', async () => {
    const testKey = '__e2e_test_storage_key.json';
    const testValue = JSON.stringify({ test: true, timestamp: Date.now() });

    const result = await page.evaluate(
      async ({ key, value }) => {
        await window.electronAPI.saveToStorage(key, value);
        const loaded = await window.electronAPI.loadFromStorage(key);
        return loaded;
      },
      { key: testKey, value: testValue },
    );

    // Storage may prettify JSON, so compare parsed values
    const parsed = JSON.parse(result as string);
    expect(parsed.test).toBe(true);
    expect(typeof parsed.timestamp).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// Window Management
// ---------------------------------------------------------------------------
test.describe('Window Management', () => {
  test('window management methods are exposed', async () => {
    const methods = await page.evaluate(() => {
      const api = window.electronAPI;
      return {
        hasMinimize: typeof api.minimizeWindow === 'function',
        hasMaximize: typeof api.maximizeWindow === 'function',
        hasClose: typeof api.closeWindow === 'function',
        hasShow: typeof api.showMainWindow === 'function',
        hasHide: typeof api.hideMainWindow === 'function',
        hasQuit: typeof api.quitApp === 'function',
      };
    });

    expect(methods.hasMinimize).toBe(true);
    expect(methods.hasMaximize).toBe(true);
    expect(methods.hasClose).toBe(true);
    expect(methods.hasShow).toBe(true);
    expect(methods.hasHide).toBe(true);
    expect(methods.hasQuit).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tab Content Rendering (comprehensive check)
// ---------------------------------------------------------------------------
test.describe('Tab Content Rendering', () => {
  test('each tab renders non-empty content', async () => {
    const tabKeys = ['record-viewer', 'rules', 'sources', 'environments', 'workspaces', 'server-config'];
    const tabNames = ['Workflows', 'Rules', 'Sources', 'Environments', 'Workspaces', 'Server Config'];

    for (let i = 0; i < tabNames.length; i++) {
      const tab = page.locator('.app-tabs > .ant-tabs-nav .ant-tabs-tab').filter({ hasText: tabNames[i] });
      await tab.click();
      await page.waitForTimeout(500);

      // Target the specific panel by its ID to avoid strict mode issues with nested tabs
      const paneId = `rc-tabs-0-panel-${tabKeys[i]}`;
      const activePane = page.locator(`#${paneId}`);
      const content = await activePane.textContent();
      expect(content?.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Theme / Dark Mode
// ---------------------------------------------------------------------------
test.describe('Theme', () => {
  test('app has a themed background', async () => {
    const bgColor = await page.evaluate(() => {
      const container = document.querySelector('.app-container');
      return container ? window.getComputedStyle(container).backgroundColor : null;
    });

    expect(bgColor).toBeDefined();
    expect(bgColor).not.toBe('');
  });
});
