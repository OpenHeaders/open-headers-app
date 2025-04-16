// source-table-controller.js - Controls the source table display
class SourceTableController {
    constructor() {
        this.sourcesTableBody = document.getElementById('sourcesTableBody');
        this.allSources = [];
        this.nextSourceId = 1;
        this.initialLoadComplete = false;
        this.refreshTimers = new Map(); // For updating refresh countdown displays

        console.log("SourceTableController initialized");

        // Initialize event listeners
        this._initEventListeners();

        // Initialize data from main process
        this._initFromMainProcess();
    }

    /**
     * Initialize event listeners
     * @private
     */
    _initEventListeners() {
        console.log("Setting up event listeners");

        // Listen for add-source event from SourceFormController
        document.addEventListener('add-source', (event) => {
            console.log("add-source event received", event.detail);
            this._addSource(event.detail);
        });

        // Listen for content updates from the main process
        window.electronAPI.onSourceContentUpdated((sourceId, content) => {
            console.log(`Source content updated for ID ${sourceId}`);
            this._updateSourceContent(sourceId, content);
        });

        // Listen for refresh completion events
        window.electronAPI.onSourceRefreshCompleted((sourceId, content) => {
            console.log(`Refresh completed for source ${sourceId}`);
            const source = this.allSources.find((s) => s.sourceId === sourceId);
            if (source) {
                // Always update the UI after a refresh, even if content is the same
                console.log(`Updating UI after refresh completion for source ${sourceId}`);
                source.sourceContent = content;

                // Reset the refresh timer for the UI
                if (source.sourceType === 'http' && source.refreshOptions && source.refreshOptions.interval > 0) {
                    const now = Date.now();
                    source.refreshOptions.lastRefresh = now;
                    source.refreshOptions.nextRefresh = now + (source.refreshOptions.interval * 60 * 1000);
                    console.log(`Reset refresh countdown in UI for source ${sourceId}. Next refresh at ${new Date(source.refreshOptions.nextRefresh).toLocaleTimeString()}`);
                }

                this._renderSources();
            }
        });

        // Listen for refresh options updates
        window.electronAPI.onRefreshOptionsUpdated((sourceId, refreshOptions) => {
            console.log(`Refresh options updated for source ${sourceId}:`, refreshOptions);
            const source = this.allSources.find((s) => s.sourceId === sourceId);
            if (source) {
                source.refreshOptions = refreshOptions;
                this._renderSources();
            }
        });

        console.log("Event listeners set up successfully");
    }

    /**
     * Initialize data from main process
     * @private
     */
    _initFromMainProcess() {
        window.electronAPI.onInitialSources((loadedSources) => {
            console.log(`Received ${loadedSources.length} source(s) from main process`);

            // Make deep copies of sources to avoid reference issues
            const processedSources = [];

            for (const src of loadedSources) {
                // Create a fresh copy of the source
                const newSrc = JSON.parse(JSON.stringify(src));

                // Ensure timestamps are numbers, not strings
                if (newSrc.refreshOptions) {
                    if (typeof newSrc.refreshOptions.lastRefresh !== 'undefined') {
                        newSrc.refreshOptions.lastRefresh = Number(newSrc.refreshOptions.lastRefresh);
                    }

                    if (typeof newSrc.refreshOptions.nextRefresh !== 'undefined') {
                        newSrc.refreshOptions.nextRefresh = Number(newSrc.refreshOptions.nextRefresh);
                    }

                    // Log the processed refresh info
                    if (newSrc.sourceType === 'http' && newSrc.refreshOptions.interval > 0) {
                        console.log(`Processed source ${newSrc.sourceId} refresh info:`, {
                            interval: newSrc.refreshOptions.interval,
                            lastRefresh: newSrc.refreshOptions.lastRefresh,
                            nextRefresh: newSrc.refreshOptions.nextRefresh,
                            nextRefreshTime: new Date(newSrc.refreshOptions.nextRefresh).toLocaleTimeString()
                        });
                    }
                }

                processedSources.push(newSrc);
            }

            // Store the processed sources
            this.allSources = processedSources;

            this.initialLoadComplete = true;

            // Find the highest sourceId to set nextSourceId correctly
            if (this.allSources.length > 0) {
                const maxId = Math.max(...this.allSources.map(source => source.sourceId));
                this.nextSourceId = maxId + 1;
                console.log(`Setting next source ID to ${this.nextSourceId}`);
            }

            // Render the sources without starting watches (main process is already watching)
            this._renderSources();
            console.log(`Rendered ${this.allSources.length} source(s) in table`);

            // Start the refresh timers for UI updates
            this._startRefreshTimers();
        });
    }

    /**
     * Start the UI refresh timer for auto-refreshing sources
     * @private
     */
    _startRefreshTimers() {
        console.log("Starting refresh timers");

        // Clear any existing timer
        if (this.refreshUpdateTimer) {
            clearInterval(this.refreshUpdateTimer);
            console.log("Cleared existing timer");
        }

        // Create a new timer that updates every second
        this.refreshUpdateTimer = setInterval(() => {
            // Get current time
            const now = Date.now();

            // For each source with refresh enabled, update the display
            this.allSources.forEach(src => {
                if (src.sourceType === 'http' &&
                    src.refreshOptions &&
                    src.refreshOptions.interval > 0 &&
                    src.refreshOptions.nextRefresh) {

                    // Find the DOM element
                    const element = document.querySelector(`tr[data-source-id="${src.sourceId}"] .refresh-status`);
                    if (!element) return;

                    // Calculate the remaining time
                    const nextRefresh = Number(src.refreshOptions.nextRefresh);
                    const remaining = Math.max(0, nextRefresh - now);
                    const minutes = Math.floor(remaining / (60 * 1000));
                    const seconds = Math.floor((remaining % (60 * 1000)) / 1000);

                    // Create the display text
                    const displayText = remaining > 0
                        ? `Refreshes in ${minutes}m ${seconds}s`
                        : 'Refreshing now...';

                    // Update the element text
                    element.textContent = displayText;

                    // Log periodically (every minute or when seconds is 0)
                    if (seconds === 0 || (now % 60000) < 1000) {
                        console.log(`Source ${src.sourceId} refresh countdown: ${displayText}`);
                    }
                }
            });
        }, 1000);

        console.log("Refresh timer started with 1-second interval");
    }

    /**
     * Add a new source
     * @param {Object} sourceData - Source data
     * @private
     */
    async _addSource(sourceData) {
        try {
            console.log("_addSource called with:", sourceData);

            // Check for duplicate sources with improved HTTP comparison
            const existingSource = this.allSources.find(src => {
                // For HTTP sources, check path, type and method
                if (src.sourceType === 'http' && sourceData.sourceType === 'http') {
                    return src.sourcePath === sourceData.sourcePath &&
                        src.sourceMethod === sourceData.sourceMethod;
                }

                // For file and env, just check path and type
                return src.sourceType === sourceData.sourceType &&
                    src.sourcePath === sourceData.sourcePath;
            });

            if (existingSource) {
                console.log(`Source already exists with ID ${existingSource.sourceId}, skipping creation`);
                alert(`This source already exists with ID ${existingSource.sourceId}`);
                return;
            }

            // Check if we have initial content from a test
            let initialContent = '';
            if (sourceData.sourceContent && sourceData.sourceContent.length > 0) {
                initialContent = sourceData.sourceContent;
                console.log(`Using initial content from test: ${initialContent.substring(0, 30)}${initialContent.length > 30 ? '...' : ''}`);
            }

            const newSource = {
                sourceId: this.nextSourceId++,
                sourceType: sourceData.sourceType,
                sourceTag: sourceData.sourceTag || '',
                sourcePath: sourceData.sourcePath,
                sourceMethod: sourceData.sourceMethod || '',
                // Use initial content if available, otherwise set to 'Loading content...'
                sourceContent: initialContent || 'Loading content...',
                requestOptions: sourceData.requestOptions || {},
                jsonFilter: sourceData.jsonFilter || { enabled: false, path: '' },
                refreshOptions: sourceData.refreshOptions || { interval: 0 }
            };

            console.log("Created new source object:", newSource);

            // Add to our collection first
            this.allSources.push(newSource);
            console.log(`Added source to collection, now have ${this.allSources.length} source(s)`);

            // Render immediately to show in UI
            this._renderSources();

            // Create a new watch in the main process
            try {
                // Important: Make sure we're passing the correct initial content
                // If we have content from a test, use it
                const contentToSend = initialContent || '';

                console.log(`Using provided initial content for source ${newSource.sourceId}: ${contentToSend ? 'content available' : 'no content provided'}`);

                console.log("Calling window.electronAPI.newSourceWatch with:",
                    newSource.sourceId,
                    newSource.sourceType,
                    newSource.sourcePath,
                    newSource.sourceTag,
                    newSource.sourceMethod,
                    "requestOptions:", Object.keys(newSource.requestOptions).length > 0 ? "provided" : "empty",
                    "refreshOptions:", newSource.refreshOptions.interval > 0 ?
                        `auto-refresh every ${newSource.refreshOptions.interval}m` : "no auto-refresh",
                    contentToSend ? `initial content (${contentToSend.length} chars)` : "no initial content"
                );

                const success = await window.electronAPI.newSourceWatch(
                    newSource.sourceId,
                    newSource.sourceType,
                    newSource.sourcePath,
                    newSource.sourceTag,
                    newSource.sourceMethod,
                    newSource.requestOptions,
                    newSource.refreshOptions,
                    newSource.jsonFilter,  // Pass jsonFilter as a separate parameter
                    contentToSend  // Use the content from test if available
                );

                if (success) {
                    console.log(`Successfully created watch for source ${newSource.sourceId}`);

                    // Update main process with the full source list
                    this._sendSourcesToMain();
                    console.log("Sent updated sources to main process");
                } else {
                    throw new Error(`Failed to create watch for source ${newSource.sourceId}`);
                }
            } catch (error) {
                console.error('Error adding source:', error);
                alert('Failed to add source: ' + error.message);

                // Remove from our collection on error
                this.allSources = this.allSources.filter(src => src.sourceId !== newSource.sourceId);
                this.nextSourceId--; // Roll back the ID increment
                this._renderSources(); // Re-render without the failed source
            }
        } catch (error) {
            console.error("Error in _addSource:", error);
            alert("An error occurred adding the source: " + error.message);
        }
    }

    /**
     * Update a source's content
     * @param {number} sourceId - Source ID
     * @param {string} content - New content
     * @private
     */
    _updateSourceContent(sourceId, content) {
        console.log(`Table controller received content update for source ${sourceId}`);

        const source = this.allSources.find((s) => s.sourceId === sourceId);
        if (source) {
            // Check if content is meaningful
            if (content === undefined || content === null) {
                console.log(`Received empty content for source ${sourceId}, using placeholder`);
                content = 'No content available';
            }

            const contentChanged = source.sourceContent !== content;

            // Always update the content and re-render, even if it appears unchanged
            // This ensures the UI reflects what's in storage
            source.sourceContent = content;
            console.log(`Updated content for source ${sourceId} in table controller${contentChanged ? ' (changed)' : ' (unchanged)'}`);

            // For HTTP sources with auto-refresh, update the refresh timer display
            if (source.sourceType === 'http' && source.refreshOptions && source.refreshOptions.interval > 0) {
                // Update the next refresh time to now + interval
                const now = Date.now();
                source.refreshOptions.lastRefresh = now;
                source.refreshOptions.nextRefresh = now + (source.refreshOptions.interval * 60 * 1000);
                console.log(`Reset refresh countdown for source ${sourceId} to ${source.refreshOptions.interval} minutes from now`);
            }

            // Always re-render to ensure UI is up to date
            this._renderSources();
        } else {
            console.log(`Source ${sourceId} not found in table controller, cannot update content`);
        }
    }

    /**
     * Remove a source
     * @param {number} sourceId - Source ID
     * @private
     */
    async _removeSource(sourceId) {
        try {
            console.log(`Removing source ${sourceId}`);

            // Check if source exists before trying to remove
            const source = this.allSources.find((s) => s.sourceId === sourceId);
            if (!source) {
                console.log(`Source ${sourceId} not found, nothing to remove`);
                return;
            }

            // Remove from our local array first for responsive UI
            const previousCount = this.allSources.length;
            this.allSources = this.allSources.filter((s) => s.sourceId !== sourceId);
            console.log(`Removed source from collection, now have ${this.allSources.length} source(s) (was ${previousCount})`);

            // Re-render immediately
            this._renderSources();

            // Signal main process to remove the watch
            await window.electronAPI.removeSourceWatch(sourceId);
            console.log(`Successfully removed watch for source ${sourceId}`);

            // Broadcast updated source set to main process
            this._sendSourcesToMain();
            console.log("Sent updated sources to main process");
        } catch (error) {
            console.error('Error removing source:', error);
            alert('Failed to remove source: ' + error.message);
        }
    }

    /**
     * Refresh an HTTP source
     * @param {number} sourceId - Source ID
     * @private
     */
    async _refreshHttpSource(sourceId) {
        try {
            console.log(`Refreshing HTTP source ${sourceId}`);

            // Check if source exists before trying to refresh
            const source = this.allSources.find((s) => s.sourceId === sourceId);
            if (!source) {
                console.log(`Source ${sourceId} not found, nothing to refresh`);
                return;
            }

            // Update UI to show loading
            source.sourceContent = 'Refreshing...';
            this._renderSources();

            await window.electronAPI.refreshHttpSource(sourceId);
            console.log(`Successfully requested refresh for source ${sourceId}`);
        } catch (error) {
            console.error('Error refreshing HTTP source:', error);
            alert('Failed to refresh source: ' + error.message);
        }
    }

    /**
     * Show a dialog to edit refresh options
     * @param {Object} source - The source to edit
     * @private
     */
    _showRefreshOptionsDialog(source) {
        // Create a simple dialog for editing refresh options
        const dialogOverlay = document.createElement('div');
        dialogOverlay.className = 'dialog-overlay';

        const dialogBox = document.createElement('div');
        dialogBox.className = 'dialog-box';

        // Dialog title
        const title = document.createElement('h3');
        title.textContent = 'Edit Auto-Refresh Options';
        dialogBox.appendChild(title);

        // Dialog content
        const content = document.createElement('div');
        content.className = 'dialog-content';

        // Refresh interval select
        const intervalLabel = document.createElement('label');
        intervalLabel.textContent = 'Refresh Interval:';
        content.appendChild(intervalLabel);

        const intervalSelect = document.createElement('select');
        intervalSelect.id = 'dialogRefreshInterval';

        // Create options
        const options = [
            { value: '0', text: 'No auto-refresh' },
            { value: '1', text: 'Every 1 minute' },
            { value: '5', text: 'Every 5 minutes' },
            { value: '15', text: 'Every 15 minutes' },
            { value: '30', text: 'Every 30 minutes' },
            { value: '60', text: 'Every hour' },
            { value: 'custom', text: 'Custom...' }
        ];

        options.forEach(option => {
            const optionElement = document.createElement('option');
            optionElement.value = option.value;
            optionElement.textContent = option.text;
            intervalSelect.appendChild(optionElement);
        });

        // Set current value
        if (source.refreshOptions && source.refreshOptions.interval) {
            const interval = source.refreshOptions.interval;
            const predefinedValues = options.map(o => parseInt(o.value, 10)).filter(v => !isNaN(v));

            if (predefinedValues.includes(interval)) {
                intervalSelect.value = interval.toString();
            } else if (interval > 0) {
                intervalSelect.value = 'custom';
            } else {
                intervalSelect.value = '0';
            }
        } else {
            intervalSelect.value = '0';
        }

        content.appendChild(intervalSelect);

        // Custom interval row
        const customRow = document.createElement('div');
        customRow.className = 'custom-interval-row' +
            ((intervalSelect.value === 'custom') ? '' : ' hidden');

        const customInput = document.createElement('input');
        customInput.type = 'number';
        customInput.id = 'dialogCustomInterval';
        customInput.min = '1';
        customInput.max = '1440'; // 24 hours in minutes
        customInput.value = (source.refreshOptions && source.refreshOptions.interval > 0 &&
            !options.map(o => parseInt(o.value, 10)).filter(v => !isNaN(v)).includes(source.refreshOptions.interval))
            ? source.refreshOptions.interval.toString()
            : '10';

        const customLabel = document.createElement('span');
        customLabel.textContent = 'minutes';

        customRow.appendChild(customInput);
        customRow.appendChild(customLabel);
        content.appendChild(customRow);

        // Show/hide custom row when selection changes
        intervalSelect.addEventListener('change', () => {
            if (intervalSelect.value === 'custom') {
                customRow.classList.remove('hidden');
            } else {
                customRow.classList.add('hidden');
            }
        });

        // Add option to refresh now regardless of interval setting
        const refreshNowContainer = document.createElement('div');
        refreshNowContainer.className = 'refresh-now-container';
        refreshNowContainer.style.marginTop = '15px';

        const refreshNowCheckbox = document.createElement('input');
        refreshNowCheckbox.type = 'checkbox';
        refreshNowCheckbox.id = 'refreshNowCheckbox';
        refreshNowCheckbox.checked = true;

        const refreshNowLabel = document.createElement('label');
        refreshNowLabel.htmlFor = 'refreshNowCheckbox';
        refreshNowLabel.textContent = 'Refresh immediately after saving';
        refreshNowLabel.style.marginLeft = '5px';
        refreshNowLabel.style.fontWeight = 'normal';

        refreshNowContainer.appendChild(refreshNowCheckbox);
        refreshNowContainer.appendChild(refreshNowLabel);
        content.appendChild(refreshNowContainer);

        dialogBox.appendChild(content);

        // Dialog buttons
        const buttonRow = document.createElement('div');
        buttonRow.className = 'dialog-buttons';

        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancel';
        cancelButton.className = 'dialog-button cancel-button';
        cancelButton.addEventListener('click', () => {
            document.body.removeChild(dialogOverlay);
        });

        const saveButton = document.createElement('button');
        saveButton.textContent = 'Save';
        saveButton.className = 'dialog-button save-button';
        saveButton.addEventListener('click', async () => {
            // Collect the new refresh options
            let interval = 0;

            if (intervalSelect.value === 'custom') {
                interval = parseInt(customInput.value, 10);
                if (isNaN(interval) || interval < 1) {
                    alert('Please enter a valid number of minutes (minimum 1)');
                    return;
                }
            } else {
                interval = parseInt(intervalSelect.value, 10);
            }

            // Check if immediate refresh is requested
            const refreshNow = refreshNowCheckbox.checked;

            // Update the refresh options
            const refreshOptions = { interval };

            try {
                // Save to main process
                const success = await window.electronAPI.updateRefreshOptions(
                    source.sourceId,
                    refreshOptions
                );

                if (success) {
                    console.log(`Successfully updated refresh options for source ${source.sourceId}`);

                    // Update local data
                    source.refreshOptions = {
                        ...source.refreshOptions,
                        interval,
                        lastRefresh: Date.now(),
                        nextRefresh: interval > 0 ? Date.now() + (interval * 60 * 1000) : 0
                    };

                    // If refresh now is checked, refresh immediately
                    if (refreshNow && interval > 0) {
                        window.electronAPI.refreshHttpSource(source.sourceId);
                        console.log(`Triggered immediate refresh for source ${source.sourceId}`);
                    }

                    // Re-render to update UI
                    this._renderSources();
                } else {
                    console.error(`Failed to update refresh options for source ${source.sourceId}`);
                    alert('Failed to update refresh options. Please try again.');
                }
            } catch (error) {
                console.error('Error updating refresh options:', error);
                alert(`Error: ${error.message}`);
            }

            // Close the dialog
            document.body.removeChild(dialogOverlay);
        });

        buttonRow.appendChild(cancelButton);
        buttonRow.appendChild(saveButton);
        dialogBox.appendChild(buttonRow);

        dialogOverlay.appendChild(dialogBox);
        document.body.appendChild(dialogOverlay);
    }

    /**
     * Dispose method to clean up resources
     */
    dispose() {
        if (this.refreshUpdateTimer) {
            clearInterval(this.refreshUpdateTimer);
        }
    }

    /**
     * Render the sources table
     * @private
     */
    _renderSources() {
        console.log(`Rendering table with ${this.allSources.length} source(s)`);
        this.sourcesTableBody.innerHTML = '';

        this.allSources.forEach((source) => {
            const row = document.createElement('tr');
            row.dataset.sourceId = source.sourceId;

            // ID
            const idTd = document.createElement('td');
            idTd.textContent = source.sourceId;

            // Type
            const typeTd = document.createElement('td');
            typeTd.textContent = source.sourceType;

            // Tag
            const tagTd = document.createElement('td');
            tagTd.textContent = source.sourceTag;

            // Source Path/URL
            const pathTd = document.createElement('td');

            // For HTTP type, show a trimmed URL with tooltip for the full URL
            if (source.sourceType === 'http') {
                // Trim the URL for display
                pathTd.textContent = formatContent(source.sourcePath, 40); // Use higher limit for URLs

                // Add tooltip with the full URL
                pathTd.title = source.sourcePath;
                pathTd.classList.add('url-cell'); // Optional class for styling
            }
            // For other types, show the full path
            else {
                pathTd.textContent = source.sourcePath;
            }

            // Source Content (trimmed + tooltip)
            const contentTd = document.createElement('td');
            contentTd.classList.add('source-content');
            contentTd.textContent = formatContent(source.sourceContent);
            // Set a tooltip with the full content
            contentTd.title = source.sourceContent || 'No content yet';

            // Actions (remove source + edit refresh options for HTTP)
            const actionsTd = document.createElement('td');

            // For HTTP sources, add refresh options
            if (source.sourceType === 'http') {
                // Add a status indicator for auto-refresh
                const refreshStatusDiv = document.createElement('div');
                refreshStatusDiv.classList.add('refresh-status');
                refreshStatusDiv.id = `refresh-status-${source.sourceId}`;

                // Check if auto-refresh is enabled
                let refreshText = 'No auto-refresh';
                if (source.refreshOptions && source.refreshOptions.interval > 0) {
                    // Calculate time until next refresh if available
                    if (source.refreshOptions.nextRefresh) {
                        const now = Date.now();
                        const remaining = Math.max(0, source.refreshOptions.nextRefresh - now);

                        if (remaining <= 0) {
                            refreshText = 'Refreshing now...';
                        } else {
                            const minutes = Math.floor(remaining / (60 * 1000));
                            const seconds = Math.floor((remaining % (60 * 1000)) / 1000);
                            refreshText = `Refreshes in ${minutes}m ${seconds}s`;
                        }
                    } else {
                        refreshText = `Auto-refresh: ${source.refreshOptions.interval}m`;
                    }
                }

                refreshStatusDiv.textContent = refreshText;
                actionsTd.appendChild(refreshStatusDiv);

                // Add JSON filter status if enabled
                if (source.jsonFilter && source.jsonFilter.enabled && source.jsonFilter.path) {
                    const jsonFilterDiv = document.createElement('div');
                    jsonFilterDiv.classList.add('json-filter-status');
                    jsonFilterDiv.textContent = `JSON Filter: ${source.jsonFilter.path}`;
                    jsonFilterDiv.title = `Content is filtered using path: ${source.jsonFilter.path}`;
                    actionsTd.appendChild(jsonFilterDiv);

                    // Add "View JSON" button for sources with JSON filter
                    const viewJsonLink = document.createElement('a');
                    viewJsonLink.textContent = 'View JSON';
                    viewJsonLink.href = '#';
                    viewJsonLink.className = 'view-json-link';
                    viewJsonLink.addEventListener('click', (event) => {
                        event.preventDefault();
                        this._showJsonViewDialog(source);
                    });
                    actionsTd.appendChild(viewJsonLink);
                }

                // Add a link to edit refresh options
                const editRefreshLink = document.createElement('a');
                editRefreshLink.textContent = 'Edit refresh';
                editRefreshLink.href = '#';
                editRefreshLink.className = 'edit-refresh-link';
                editRefreshLink.addEventListener('click', (event) => {
                    event.preventDefault();
                    this._showRefreshOptionsDialog(source);
                });
                actionsTd.appendChild(editRefreshLink);
            }
            // For ENV sources, show "No auto-refresh" text
            else if (source.sourceType === 'env') {
                const refreshStatusDiv = document.createElement('div');
                refreshStatusDiv.classList.add('refresh-status');
                refreshStatusDiv.textContent = 'No auto-refresh';
                actionsTd.appendChild(refreshStatusDiv);
            }
            // For FILE type, show auto-update notice
            else if (source.sourceType === 'file') {
                const refreshStatusDiv = document.createElement('div');
                refreshStatusDiv.classList.add('refresh-status');
                refreshStatusDiv.textContent = 'Auto-updates on file change';
                actionsTd.appendChild(refreshStatusDiv);
            }

            // Add remove button for all sources
            const removeBtn = document.createElement('button');
            removeBtn.textContent = 'Remove';
            removeBtn.classList.add('remove-btn');
            removeBtn.addEventListener('click', () => {
                this._removeSource(source.sourceId);
            });
            actionsTd.appendChild(removeBtn);

            row.appendChild(idTd);
            row.appendChild(typeTd);
            row.appendChild(tagTd);
            row.appendChild(pathTd);
            row.appendChild(contentTd);
            row.appendChild(actionsTd);

            this.sourcesTableBody.appendChild(row);
        });
    }

    /**
     * Show a dialog to view the original JSON response
     * @param {Object} source - The source to view
     * @private
     */
    _showJsonViewDialog(source) {
        // Create a dialog for viewing the JSON
        const dialogOverlay = document.createElement('div');
        dialogOverlay.className = 'dialog-overlay';

        const dialogBox = document.createElement('div');
        dialogBox.className = 'dialog-box json-view-dialog';
        dialogBox.style.width = '80%';
        dialogBox.style.maxWidth = '800px';
        dialogBox.style.height = '80%';
        dialogBox.style.maxHeight = '600px';
        dialogBox.style.display = 'flex';
        dialogBox.style.flexDirection = 'column';

        // Dialog title
        const title = document.createElement('h3');
        title.textContent = 'Original JSON Response';
        title.style.marginBottom = '10px';
        dialogBox.appendChild(title);

        // Subtitle showing the path being filtered
        const subtitle = document.createElement('p');
        subtitle.textContent = `JSON Filter Path: ${source.jsonFilter && source.jsonFilter.path ? source.jsonFilter.path : 'none'}`;
        subtitle.style.color = '#666';
        subtitle.style.marginTop = '0';
        subtitle.style.marginBottom = '10px';
        dialogBox.appendChild(subtitle);

        // Loading indicator
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'loading-indicator';
        loadingDiv.textContent = 'Loading JSON...';
        loadingDiv.style.textAlign = 'center';
        loadingDiv.style.padding = '20px';
        dialogBox.appendChild(loadingDiv);

        // Content area (initially hidden)
        const content = document.createElement('div');
        content.className = 'dialog-content';
        content.style.flex = '1';
        content.style.overflow = 'hidden';
        content.style.display = 'none';

        // JSON display area (pre element with scrolling)
        const jsonDisplay = document.createElement('pre');
        jsonDisplay.className = 'json-display';
        jsonDisplay.style.height = '100%';
        jsonDisplay.style.overflow = 'auto';
        jsonDisplay.style.margin = '0';
        jsonDisplay.style.padding = '10px';
        jsonDisplay.style.backgroundColor = '#f5f5f5';
        jsonDisplay.style.border = '1px solid #ddd';
        jsonDisplay.style.borderRadius = '4px';
        jsonDisplay.style.fontSize = '14px';
        content.appendChild(jsonDisplay);

        dialogBox.appendChild(content);

        // Dialog buttons
        const buttonRow = document.createElement('div');
        buttonRow.className = 'dialog-buttons';
        buttonRow.style.marginTop = '15px';
        buttonRow.style.display = 'flex';
        buttonRow.style.justifyContent = 'space-between';

        // Left button group for actions
        const leftButtons = document.createElement('div');

        // Add a refresh button to force a refresh and get new JSON
        if (source.sourceType === 'http') {
            const refreshButton = document.createElement('button');
            refreshButton.textContent = 'Refresh JSON';
            refreshButton.className = 'dialog-button save-button';
            refreshButton.style.backgroundColor = '#28a745';

            refreshButton.addEventListener('click', async () => {
                // Show loading indicator
                content.style.display = 'none';
                loadingDiv.style.display = 'block';
                loadingDiv.textContent = 'Refreshing JSON...';

                try {
                    // Request a refresh from the main process
                    await window.electronAPI.refreshHttpSource(source.sourceId);

                    // Wait for a short period to allow the refresh to complete
                    setTimeout(async () => {
                        try {
                            // Get the updated source
                            const updatedSource = this.allSources.find(src => src.sourceId === source.sourceId);

                            // Hide loading indicator
                            loadingDiv.style.display = 'none';
                            content.style.display = 'block';

                            // Show the updated JSON
                            if (updatedSource && updatedSource.originalJson && updatedSource.originalJson.length > 0) {
                                try {
                                    const parsedJson = JSON.parse(updatedSource.originalJson);
                                    jsonDisplay.textContent = JSON.stringify(parsedJson, null, 2);
                                } catch (e) {
                                    jsonDisplay.textContent = updatedSource.originalJson;
                                }
                            } else {
                                jsonDisplay.textContent = 'No JSON content available after refresh';
                            }
                        } catch (error) {
                            loadingDiv.style.display = 'none';
                            content.style.display = 'block';
                            jsonDisplay.textContent = `Error after refresh: ${error.message}`;
                        }
                    }, 1000); // Wait 1 second for refresh to complete
                } catch (error) {
                    loadingDiv.style.display = 'none';
                    content.style.display = 'block';
                    jsonDisplay.textContent = `Error refreshing: ${error.message}`;
                }
            });

            leftButtons.appendChild(refreshButton);
        }

        // Right button group for close
        const rightButtons = document.createElement('div');

        const closeButton = document.createElement('button');
        closeButton.textContent = 'Close';
        closeButton.className = 'dialog-button cancel-button';
        closeButton.addEventListener('click', () => {
            document.body.removeChild(dialogOverlay);
        });

        rightButtons.appendChild(closeButton);

        // Add button groups to row
        buttonRow.appendChild(leftButtons);
        buttonRow.appendChild(rightButtons);

        dialogBox.appendChild(buttonRow);

        dialogOverlay.appendChild(dialogBox);
        document.body.appendChild(dialogOverlay);

        // Fetch the original JSON
        this._fetchOriginalJson(source).then(jsonString => {
            try {
                // Hide loading indicator
                loadingDiv.style.display = 'none';

                // Show content area
                content.style.display = 'block';

                // Log the raw jsonString for debugging
                console.log(`Received jsonString (${jsonString.length} chars): ${jsonString.substring(0, 100)}${jsonString.length > 100 ? '...' : ''}`);

                // Format JSON with syntax highlighting if available
                if (typeof jsonString === 'string') {
                    if (jsonString.trim().startsWith('{') || jsonString.trim().startsWith('[')) {
                        try {
                            // Try to parse the JSON string to format it nicely
                            const parsedJson = JSON.parse(jsonString);
                            jsonDisplay.textContent = JSON.stringify(parsedJson, null, 2);
                        } catch (e) {
                            // If parsing fails, just show the raw string
                            console.error('Error parsing JSON:', e);
                            jsonDisplay.textContent = jsonString;
                        }
                    } else {
                        // Not JSON, just display as-is
                        jsonDisplay.textContent = jsonString;
                    }
                } else {
                    jsonDisplay.textContent = 'No JSON content available';
                }
            } catch (error) {
                console.error('Error displaying JSON:', error);
                jsonDisplay.textContent = `Error: ${error.message}`;
            }
        }).catch(error => {
            // Hide loading indicator
            loadingDiv.style.display = 'none';

            // Show content area with error
            content.style.display = 'block';
            jsonDisplay.textContent = `Error fetching JSON: ${error.message}`;
            console.error('Error fetching JSON:', error);
        });
    }

    /**
     * Fetch the original JSON for a source
     * @param {Object} source - The source to fetch JSON for
     * @returns {Promise<string>} - Promise resolving to JSON string
     * @private
     */
    async _fetchOriginalJson(source) {
        // Add debugging to see what's available
        console.log(`Fetching original JSON for source ${source.sourceId}`);
        console.log(`originalJson exists: ${source.originalJson ? 'Yes' : 'No'}`);
        console.log(`originalJson length: ${source.originalJson ? source.originalJson.length : 0} chars`);

        // If we already have stored original JSON, use it
        if (source.originalJson && source.originalJson.length > 0) {
            console.log(`Using stored original JSON for source ${source.sourceId} (${source.originalJson.length} chars)`);
            return source.originalJson;
        }

        // For HTTP sources without stored original JSON, show a message
        if (source.sourceType === 'http' && (!source.originalJson || source.originalJson.length === 0)) {
            console.log(`No stored original JSON for source ${source.sourceId}, showing message`);
            return "Original JSON data is not available for this source. Please refresh the source to retrieve the original data.";
        }

        // For non-HTTP sources, return the current content
        return source.sourceContent;
    }

    /**
     * Send sources to the main process with all necessary data
     * @private
     */
    _sendSourcesToMain() {
        try {
            // Ensure we have all sources with complete data
            const sources = this.allSources.map(src => {
                // Make a deep copy to prevent reference issues
                const copiedSrc = JSON.parse(JSON.stringify(src));

                // Ensure originalJson is included for HTTP sources
                if (src.sourceType === 'http') {
                    console.log(`Sending source ${src.sourceId} to main process with originalJson length: ${src.originalJson ? src.originalJson.length : 0} chars`);
                }

                return copiedSrc;
            });

            // Send to main process
            window.electronAPI.updateSources(sources);
            console.log(`Sent ${sources.length} source(s) to main process`);
        } catch (error) {
            console.error('Error sending sources to main process:', error);
        }
    }
}

// Export the class
window.SourceTableController = SourceTableController;