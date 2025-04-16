// renderer.js - Main entry point for renderer process

// Store controller references globally for proper cleanup
let formController = null;
let tableController = null;

// Add global debug function to help with manual debugging in the browser console
window.debugRefresh = function() {
    // If tableController exists
    if (window.tableController) {
        const sources = window.tableController.allSources;
        console.log('===== DEBUG REFRESH INFO =====');

        sources.forEach(src => {
            if (src.refreshOptions) {
                const now = Date.now();
                const remaining = src.refreshOptions.nextRefresh - now;
                const minutes = Math.floor(remaining / (60 * 1000));
                const seconds = Math.floor((remaining % (60 * 1000)) / 1000);

                console.log(`Source ${src.sourceId} (${src.sourceType}):`, {
                    interval: src.refreshOptions.interval,
                    lastRefresh: src.refreshOptions.lastRefresh,
                    nextRefresh: src.refreshOptions.nextRefresh,
                    nextRefreshTime: new Date(src.refreshOptions.nextRefresh).toLocaleTimeString(),
                    remainingMs: remaining,
                    remaining: `${minutes}m ${seconds}s`,
                    nowTime: new Date(now).toLocaleTimeString(),
                    nowMs: now
                });

                // Check what's actually in the DOM
                const statusElement = document.querySelector(`tr[data-source-id="${src.sourceId}"] .refresh-status`);
                if (statusElement) {
                    console.log(`DOM shows: "${statusElement.textContent}"`);
                } else {
                    console.log('DOM element not found');
                }
            }
        });

        return true;
    } else {
        console.log('Table controller not found');
        return false;
    }
};

// Override the onInitialSources method to log EXACTLY what's received from IPC
const originalOnInitialSources = window.electronAPI.onInitialSources;
window.electronAPI.onInitialSources = function(callback) {
    return originalOnInitialSources(function(sources) {
        console.log('EXACT IPC DATA RECEIVED:', JSON.stringify(sources, null, 2));

        // Parse and stringify to check potential JSON conversion issues
        try {
            const parsed = JSON.parse(JSON.stringify(sources));
            console.log('PARSED AND RESTRINGIFIED:', JSON.stringify(parsed, null, 2));

            // Check types of timestamps
            parsed.forEach(src => {
                if (src.refreshOptions) {
                    console.log(`Source ${src.sourceId} timestamp types:`, {
                        lastRefreshType: typeof src.refreshOptions.lastRefresh,
                        nextRefreshType: typeof src.refreshOptions.nextRefresh,
                        lastRefreshValue: src.refreshOptions.lastRefresh,
                        nextRefreshValue: src.refreshOptions.nextRefresh,
                    });
                }
            });
        } catch (e) {
            console.error('Error in re-parsing:', e);
        }

        callback(sources);
    });
};

// Initialize the UI controllers when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOMContentLoaded - Initializing UI controllers");

    try {
        // Initialize controllers
        formController = new SourceFormController();
        tableController = new SourceTableController();

        // Add global references for debugging
        window.formController = formController;
        window.tableController = tableController;

        // Initialize import/export functionality
        initImportExport();

        // Initialize settings dialog
        initSettingsDialog();

        console.log("Controllers initialized successfully");
        console.log("You can use window.debugRefresh() in console to check refresh state");

        // Add automatic debugging every 5 seconds
        window.debugInterval = setInterval(() => {
            window.debugRefresh();
        }, 5000);
    } catch (error) {
        console.error("Error initializing controllers:", error);
    }
});

// Clean up resources when window is being closed
window.addEventListener('beforeunload', () => {
    console.log("Window closing - cleaning up resources");

    // Dispose table controller to stop refresh timers
    if (tableController && typeof tableController.dispose === 'function') {
        tableController.dispose();
    }

    // Clear debug interval if it exists
    if (window.debugInterval) {
        clearInterval(window.debugInterval);
    }
});

// Simple debugging utility for refresh timers
window.checkRefreshTimers = function() {
    if (!window.tableController) {
        console.log("Table controller not available");
        return;
    }

    const now = Date.now();
    console.log("Current time:", new Date(now).toLocaleTimeString());

    window.tableController.allSources.forEach(src => {
        if (src.sourceType === 'http' && src.refreshOptions) {
            // Get values from the source object
            const nextRefresh = Number(src.refreshOptions.nextRefresh || 0);
            const remaining = Math.max(0, nextRefresh - now);
            const minutes = Math.floor(remaining / (60 * 1000));
            const seconds = Math.floor((remaining % (60 * 1000)) / 1000);

            // Get the current UI text
            const statusEl = document.querySelector(`tr[data-source-id="${src.sourceId}"] .refresh-status`);
            const displayText = statusEl ? statusEl.textContent : "Element not found";

            console.log(`Source ${src.sourceId}:`, {
                interval: src.refreshOptions.interval,
                nextRefresh: nextRefresh,
                nextRefreshTime: nextRefresh ? new Date(nextRefresh).toLocaleTimeString() : 'none',
                remainingTime: `${minutes}m ${seconds}s`,
                currentDisplay: displayText
            });
        }
    });

    // Return true for convenience in console
    return true;
};

/**
 * Initialize import/export functionality
 */
function initImportExport() {
    const exportBtn = document.getElementById('exportBtn');
    const importBtn = document.getElementById('importBtn');

    if (!exportBtn || !importBtn) {
        console.error('Import/export buttons not found in the DOM');
        return;
    }

    // Handle export button click
    exportBtn.addEventListener('click', async () => {
        try {
            // Check if we have sources to export
            if (!window.tableController || !window.tableController.allSources || window.tableController.allSources.length === 0) {
                showToast('No sources to export. Add sources first.', 'error');
                return;
            }

            // Show save file dialog
            const filePath = await window.electronAPI.saveFileDialog({
                title: 'Export Sources',
                buttonLabel: 'Export',
                defaultPath: 'open-headers_config.json'
            });

            if (!filePath) {
                console.log('Export canceled');
                return;
            }

            // Call the export function
            const result = await window.electronAPI.exportSources(filePath);

            if (result.success) {
                showToast(`Successfully exported ${window.tableController.allSources.length} source(s)`, 'success');
            } else {
                showToast(`Export failed: ${result.message}`, 'error');
            }
        } catch (error) {
            console.error('Error exporting sources:', error);
            showToast(`Error exporting sources: ${error.message}`, 'error');
        }
    });

    // Handle import button click
    importBtn.addEventListener('click', async () => {
        try {
            // Show open file dialog
            const filePath = await window.electronAPI.openFileDialog();

            if (!filePath) {
                console.log('Import canceled');
                return;
            }

            console.log(`Importing sources from: ${filePath}`);

            // Call the import function
            const result = await window.electronAPI.importSources(filePath);

            console.log('Import result:', result);

            if (result.success) {
                if (result.count > 0) {
                    showToast(`Successfully imported ${result.count} source(s)`, 'success');
                } else {
                    showToast('No sources were imported. File empty or contains duplicates.', 'info');
                }
            } else {
                showToast(`Import failed: ${result.message}`, 'error');
            }
        } catch (error) {
            console.error('Error importing sources:', error);
            showToast(`Error importing sources: ${error.message}`, 'error');
        }
    });

    // Listen for sources imported event
    window.electronAPI.onSourcesImported((count) => {
        console.log(`${count} source(s) imported, refreshing UI`);
        // No need to do anything here as the source controller will send initialSources event
    });
}

/**
 * Initialize settings dialog functionality
 */
function initSettingsDialog() {
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsDialog = document.getElementById('settingsDialog');
    const settingsCancelBtn = document.getElementById('settingsCancelBtn');
    const settingsSaveBtn = document.getElementById('settingsSaveBtn');

    // Settings elements
    const launchAtLogin = document.getElementById('launchAtLogin');
    const hideOnLaunch = document.getElementById('hideOnLaunch');
    const showDockIcon = document.getElementById('showDockIcon');
    const showStatusBarIcon = document.getElementById('showStatusBarIcon');

    if (!settingsBtn || !settingsDialog) {
        console.error('Settings elements not found in the DOM');
        return;
    }

    // Make sure dialog is hidden initially
    settingsDialog.style.display = 'none';
    settingsDialog.classList.add('hidden');

    // Open settings dialog when settings button is clicked
    settingsBtn.addEventListener('click', async () => {
        try {
            console.log('Settings button clicked');

            // Get current settings from main process if API is available
            let settings = {
                launchAtLogin: false,
                hideOnLaunch: false,
                showDockIcon: true,
                showStatusBarIcon: true
            };

            if (window.electronAPI && window.electronAPI.getSettings) {
                try {
                    settings = await window.electronAPI.getSettings();
                    console.log('Retrieved settings:', settings);
                } catch (err) {
                    console.log('Error getting settings, using defaults:', err);
                }
            }

            // FIXED: Update UI to match current settings correctly
            // Use typeof check to handle values that might be explicitly false
            launchAtLogin.checked = typeof settings.launchAtLogin !== 'undefined' ? settings.launchAtLogin : false;
            hideOnLaunch.checked = typeof settings.hideOnLaunch !== 'undefined' ? settings.hideOnLaunch : false;
            showDockIcon.checked = typeof settings.showDockIcon !== 'undefined' ? settings.showDockIcon : true;
            showStatusBarIcon.checked = typeof settings.showStatusBarIcon !== 'undefined' ? settings.showStatusBarIcon : true;

            // Show the dialog
            settingsDialog.style.display = '';
            settingsDialog.classList.remove('hidden');
        } catch (error) {
            console.error('Error loading settings:', error);
            showToast('Error loading settings', 'error');
        }
    });

    // Close dialog when cancel button is clicked
    settingsCancelBtn.addEventListener('click', () => {
        console.log('Settings cancel button clicked');
        settingsDialog.style.display = 'none';
        settingsDialog.classList.add('hidden');
    });

    // Save settings when save button is clicked
    settingsSaveBtn.addEventListener('click', async () => {
        try {
            console.log('Settings save button clicked');

            const newSettings = {
                launchAtLogin: launchAtLogin.checked,
                hideOnLaunch: hideOnLaunch.checked,
                showDockIcon: showDockIcon.checked,
                showStatusBarIcon: showStatusBarIcon.checked
            };

            console.log('Saving settings:', newSettings);

            if (window.electronAPI && window.electronAPI.saveSettings) {
                try {
                    const result = await window.electronAPI.saveSettings(newSettings);

                    if (result.success) {
                        showToast('Settings saved successfully', 'success');
                    } else {
                        showToast(`Failed to save settings: ${result.message}`, 'error');
                    }
                } catch (err) {
                    console.error('Error saving settings:', err);
                    showToast('Error saving settings', 'error');
                }
            } else {
                // Just show a success message if API not available yet
                showToast('Settings saved successfully', 'success');
            }

            // Always hide the dialog after trying to save
            settingsDialog.style.display = 'none';
            settingsDialog.classList.add('hidden');
        } catch (error) {
            console.error('Error in save settings handler:', error);
            showToast('Error saving settings', 'error');

            // Still hide the dialog even on error
            settingsDialog.style.display = 'none';
            settingsDialog.classList.add('hidden');
        }
    });

    // Also close when clicking outside the dialog box (on the overlay)
    settingsDialog.addEventListener('click', (event) => {
        // Only close if the click is directly on the overlay, not on its children
        if (event.target === settingsDialog) {
            settingsDialog.style.display = 'none';
            settingsDialog.classList.add('hidden');
        }
    });
}