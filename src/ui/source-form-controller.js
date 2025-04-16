// source-form-controller.js - Controls the form for adding sources
class SourceFormController {
    constructor() {
        // Type selection
        this.sourceType = document.getElementById('sourceType');

        // Type-specific rows
        this.fileSourceRow = document.getElementById('fileSourceRow');
        this.envSourceRow = document.getElementById('envSourceRow');
        this.httpSourceRow = document.getElementById('httpSourceRow');

        // File source elements
        this.browseBtn = document.getElementById('browseBtn');
        this.filePathDisplay = document.getElementById('filePathDisplay');
        this.currentFilePath = null;

        // Env source elements
        this.envNameInput = document.getElementById('envNameInput');

        // HTTP source elements
        this.httpUrlInput = document.getElementById('httpUrlInput');
        this.httpMethodSelect = document.getElementById('httpMethodSelect');
        this.testRequestBtn = document.getElementById('testRequestBtn');
        this.httpResponsePreview = document.getElementById('httpResponsePreview');
        this.responseContent = document.getElementById('responseContent');
        this.httpTestResponse = null;

        // HTTP Request Options
        this.tabButtons = document.querySelectorAll('.tab-btn');
        this.tabContents = document.querySelectorAll('.tab-content');
        this.addQueryParamBtn = document.getElementById('addQueryParamBtn');
        this.addHeaderBtn = document.getElementById('addHeaderBtn');
        this.contentTypeSelect = document.getElementById('contentTypeSelect');
        this.jsonBodyEditor = document.getElementById('jsonBodyEditor');
        this.formBodyEditor = document.getElementById('formBodyEditor');
        this.queryParamsContainer = document.getElementById('queryParamsContainer');
        this.headersContainer = document.getElementById('headersContainer');

        // HTTP Refresh Options
        this.refreshIntervalSelect = document.getElementById('refreshIntervalSelect');
        this.refreshIntervalCustom = document.getElementById('refreshIntervalCustom');
        this.refreshIntervalCustomRow = document.getElementById('refreshIntervalCustomRow');

        // JSON Filter elements
        this.enableJsonFilter = document.getElementById('enableJsonFilter');
        this.jsonFilterOptions = document.getElementById('jsonFilterOptions');
        this.jsonPathInput = document.getElementById('jsonPathInput');
        this.testJsonPathBtn = document.getElementById('testJsonPathBtn');
        this.jsonPathPreview = document.getElementById('jsonPathPreview');
        this.jsonPathResult = document.getElementById('jsonPathResult');

        // Track HTTP request options
        this.queryParams = [];
        this.headers = [];

        // Common elements
        this.tagInput = document.getElementById('tagInput');
        this.addSourceBtn = document.getElementById('addSourceBtn');

        // Initialize event listeners
        this._initEventListeners();

        // Initialize HTTP options UI
        this._initHttpOptionsUI();

        // Initialize TOTP listeners
        this._initTOTPEventListeners();

        // Ensure refresh interval custom row is hidden initially
        if (this.refreshIntervalCustomRow) {
            this.refreshIntervalCustomRow.classList.add('hidden');
        }
    }

    /**
     * Initialize event listeners
     * @private
     */
    _initEventListeners() {
        // Handle source type change
        this.sourceType.addEventListener('change', () => this._handleSourceTypeChange());

        // Handle file browse button
        this.browseBtn.addEventListener('click', () => this._handleBrowseButtonClick());

        // Handle test request button
        this.testRequestBtn.addEventListener('click', () => this._handleTestRequestButtonClick());

        // Handle add source button
        this.addSourceBtn.addEventListener('click', () => this._handleAddSourceButtonClick());

        // Tab navigation
        this.tabButtons.forEach(button => {
            button.addEventListener('click', () => this._switchTab(button));
        });

        // HTTP option buttons
        this.addQueryParamBtn.addEventListener('click', () => this._addQueryParam());
        this.addHeaderBtn.addEventListener('click', () => this._addHeader());

        // Toggle between JSON and form body
        this.contentTypeSelect.addEventListener('change', () => this._toggleBodyType());

        // Handle refresh interval select change
        if (this.refreshIntervalSelect) {
            this.refreshIntervalSelect.addEventListener('change', () => this._handleRefreshIntervalChange());

            // Ensure initial state is correct (custom input hidden unless 'custom' is selected)
            this._handleRefreshIntervalChange();
        }

        // JSON Filter event listeners
        if (this.enableJsonFilter) {
            this.enableJsonFilter.addEventListener('change', () => this._toggleJsonFilterOptions());
        }

        if (this.testJsonPathBtn) {
            this.testJsonPathBtn.addEventListener('click', () => this._testJsonPath());
        }
    }

    /**
     * Initialize HTTP options UI
     * @private
     */
    _initHttpOptionsUI() {
        try {
            // Make sure all required elements exist
            if (!this.contentTypeSelect || !this.jsonBodyEditor || !this.formBodyEditor ||
                !this.headersContainer || !this.queryParamsContainer) {
                console.error("Missing required elements for HTTP options UI initialization");
                console.log("Available elements:", {
                    contentTypeSelect: !!this.contentTypeSelect,
                    jsonBodyEditor: !!this.jsonBodyEditor,
                    formBodyEditor: !!this.formBodyEditor,
                    headersContainer: !!this.headersContainer,
                    queryParamsContainer: !!this.queryParamsContainer
                });
                return;
            }

            // Initial UI setup
            this._toggleBodyType();

            // Add some default headers
            this._addHeader('Accept', 'application/json');
            this._addHeader('User-Agent', 'OpenHeaders/1.0');
        } catch (error) {
            console.error("Error initializing HTTP options UI:", error);
        }
    }

    /**
     * Handle source type change
     * @private
     */
    _handleSourceTypeChange() {
        const type = this.sourceType.value;

        // Hide all source rows
        this.fileSourceRow.classList.add('hidden');
        this.envSourceRow.classList.add('hidden');
        this.httpSourceRow.classList.add('hidden');
        this.httpResponsePreview.classList.add('hidden');

        // Show the appropriate row based on selection
        if (type === 'file') {
            this.fileSourceRow.classList.remove('hidden');
        } else if (type === 'env') {
            this.envSourceRow.classList.remove('hidden');
        } else if (type === 'http') {
            this.httpSourceRow.classList.remove('hidden');

            // Ensure refresh interval is set to a default value
            if (this.refreshIntervalSelect) {
                this.refreshIntervalSelect.value = 'none';
            }

            // Always hide the custom interval row when switching to HTTP type
            if (this.refreshIntervalCustomRow) {
                this.refreshIntervalCustomRow.classList.add('hidden');
            }
        }
    }

    /**
     * Handle refresh interval select change
     * @private
     */
    _handleRefreshIntervalChange() {
        const value = this.refreshIntervalSelect.value;

        // Show/hide the custom input row based on selection
        if (value === 'custom') {
            this.refreshIntervalCustomRow.classList.remove('hidden');
        } else {
            this.refreshIntervalCustomRow.classList.add('hidden');
        }
    }

    /**
     * Switch between tabs in the HTTP options
     * @param {HTMLElement} activeButton - The clicked tab button
     * @private
     */
    _switchTab(activeButton) {
        // Remove active class from all buttons
        this.tabButtons.forEach(btn => btn.classList.remove('active'));

        // Add active class to clicked button
        activeButton.classList.add('active');

        // Hide all tab contents
        this.tabContents.forEach(content => content.classList.remove('active'));

        // Show the selected tab content
        const targetId = activeButton.dataset.target;
        document.getElementById(targetId).classList.add('active');
    }

    /**
     * Toggle between JSON and form-encoded body types
     * @private
     */
    _toggleBodyType() {
        // Make sure all elements exist
        if (!this.contentTypeSelect || !this.jsonBodyEditor || !this.formBodyEditor) {
            console.error("Missing required elements for body type toggle");
            return;
        }

        const contentType = this.contentTypeSelect.value;

        if (contentType === 'application/json') {
            // Show JSON editor, hide form editor
            if (this.jsonBodyEditor.parentElement) {
                this.jsonBodyEditor.parentElement.style.display = 'block';
            }
            if (this.formBodyEditor.parentElement) {
                this.formBodyEditor.parentElement.style.display = 'none';
            }
        } else {
            // Show form editor, hide JSON editor
            if (this.jsonBodyEditor.parentElement) {
                this.jsonBodyEditor.parentElement.style.display = 'none';
            }
            if (this.formBodyEditor.parentElement) {
                this.formBodyEditor.parentElement.style.display = 'block';
            }
        }
    }

    /**
     * Parse the form body editor text into key-value pairs
     * @returns {Object} Parsed form data
     * @private
     */
    _parseFormBody() {
        const formText = this.formBodyEditor.value.trim();
        if (!formText) return {};

        const result = {};
        const lines = formText.split('\n');

        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine || !trimmedLine.includes(':')) continue;

            // Split at the first colon
            const colonIndex = trimmedLine.indexOf(':');
            const key = trimmedLine.substring(0, colonIndex).trim();
            const value = trimmedLine.substring(colonIndex + 1).trim();

            if (key) {
                result[key] = value;
            }
        }

        return result;
    }

    /**
     * Add a query parameter row to the UI
     * @param {string} key - Parameter key
     * @param {string} value - Parameter value
     * @private
     */
    _addQueryParam(key = '', value = '') {
        const paramId = `query-param-${Date.now()}`;
        const paramRow = document.createElement('div');
        paramRow.className = 'param-row';
        paramRow.dataset.id = paramId;

        paramRow.innerHTML = `
            <input type="text" class="param-key" placeholder="Parameter name" value="${key}" />
            <input type="text" class="param-value" placeholder="Value" value="${value}" />
            <button class="remove-param-btn">✕</button>
        `;

        this.queryParamsContainer.appendChild(paramRow);

        // Add event listener to remove button
        paramRow.querySelector('.remove-param-btn').addEventListener('click', () => {
            paramRow.remove();
            this.queryParams = this.queryParams.filter(p => p.id !== paramId);
        });

        // Add to query params array
        this.queryParams.push({ id: paramId, key, value });
    }

    /**
     * Add a header row to the UI
     * @param {string} key - Header name
     * @param {string} value - Header value
     * @private
     */
    _addHeader(key = '', value = '') {
        const headerId = `header-${Date.now()}`;
        const headerRow = document.createElement('div');
        headerRow.className = 'param-row';
        headerRow.dataset.id = headerId;

        headerRow.innerHTML = `
            <input type="text" class="param-key" placeholder="Header name" value="${key}" />
            <input type="text" class="param-value" placeholder="Value" value="${value}" />
            <button class="remove-param-btn">✕</button>
        `;

        this.headersContainer.appendChild(headerRow);

        // Add event listener to remove button
        headerRow.querySelector('.remove-param-btn').addEventListener('click', () => {
            headerRow.remove();
            this.headers = this.headers.filter(h => h.id !== headerId);
        });

        // Add to headers array
        this.headers.push({ id: headerId, key, value });
    }

    /**
     * Collect the current HTTP request options from the UI
     * @returns {Object} The request options
     * @private
     */
    _collectRequestOptions() {
        try {
            // Collect query parameters
            const queryParams = {};
            document.querySelectorAll('#queryParamsContainer .param-row').forEach(row => {
                const key = row.querySelector('.param-key').value.trim();
                const value = row.querySelector('.param-value').value.trim();
                if (key) {
                    queryParams[key] = value;
                }
            });

            // Collect headers
            const headers = {};
            document.querySelectorAll('#headersContainer .param-row').forEach(row => {
                const key = row.querySelector('.param-key').value.trim();
                const value = row.querySelector('.param-value').value.trim();
                if (key) {
                    headers[key] = value;
                }
            });

            // Get content type
            const contentType = this.contentTypeSelect.value;

            // Collect request body based on content type
            let body = null;
            if (contentType === 'application/json') {
                // Try to parse JSON
                try {
                    const jsonText = this.jsonBodyEditor.value.trim();
                    if (jsonText) {
                        body = JSON.parse(jsonText);
                    }
                } catch (err) {
                    console.error('Invalid JSON:', err);
                    alert('Invalid JSON in request body. Please check your syntax.');
                    throw err;
                }
            } else {
                // Form URL encoded body
                body = this._parseFormBody();
            }

            // Collect JSON filter options
            const jsonFilter = {
                enabled: this.enableJsonFilter && this.enableJsonFilter.checked,
                path: this.jsonPathInput ? this.jsonPathInput.value.trim() : ''
            };

            const totpOptions = this._collectTOTPOptions();

            return {
                queryParams,
                headers,
                body,
                contentType,
                jsonFilter,
                totpSecret: totpOptions.enabled ? totpOptions.secret : null
            };
        } catch (error) {
            console.error("Error collecting request options:", error);
            throw error;
        }
    }

    /**
     * Collect refresh options from the UI
     * @param {string} sourceType - The type of source
     * @returns {Object} Refresh options
     * @private
     */
    _collectRefreshOptions(sourceType) {
        // Only HTTP sources can have refresh options
        if (sourceType !== 'http') {
            return {
                interval: 0,
                lastRefresh: Date.now(),
                nextRefresh: 0
            };
        }

        // For HTTP sources, get interval from UI
        if (!this.refreshIntervalSelect) {
            return {
                interval: 0,
                lastRefresh: Date.now(),
                nextRefresh: 0
            };
        }

        const selectedValue = this.refreshIntervalSelect.value;
        let interval = 0; // Default to no auto-refresh

        if (selectedValue === 'custom' && this.refreshIntervalCustom) {
            // Get custom interval from input
            const customValue = parseInt(this.refreshIntervalCustom.value, 10);
            if (!isNaN(customValue) && customValue > 0) {
                interval = customValue;
            }
        } else if (selectedValue !== 'none') {
            // Parse the selected interval value
            interval = parseInt(selectedValue, 10);
        }

        // Calculate nextRefresh timestamp if interval > 0
        const lastRefresh = Date.now();
        const nextRefresh = interval > 0 ? lastRefresh + (interval * 60 * 1000) : 0;

        return {
            interval,
            lastRefresh,
            nextRefresh
        };
    }

    /**
     * Handle browse button click
     * @private
     */
    async _handleBrowseButtonClick() {
        try {
            const selectedPath = await window.electronAPI.openFileDialog();
            if (selectedPath) {
                this.currentFilePath = selectedPath;
                this.filePathDisplay.textContent = selectedPath;
            }
        } catch (error) {
            console.error('Error selecting file:', error);
            alert('Failed to select file: ' + error.message);
        }
    }

    /**
     * Handle "Test Request" button click for HTTP type
     * @private
     */
    async _handleTestRequestButtonClick() {
        let url = this.httpUrlInput.value.trim();
        const method = this.httpMethodSelect.value;

        if (!url) {
            alert('Please enter a URL');
            return;
        }

        // Add protocol if missing
        if (!url.match(/^https?:\/\//i)) {
            url = 'https://' + url;
            this.httpUrlInput.value = url;
        }

        try {
            // Collect request options from the UI
            const requestOptions = this._collectRequestOptions();
            console.log("Testing HTTP request with options:", requestOptions);

            // Disable button during request
            this.testRequestBtn.disabled = true;
            this.testRequestBtn.textContent = 'Testing...';

            const response = await window.electronAPI.testHttpRequest(url, method, requestOptions);
            console.log("Test HTTP response received:", response);
            this.httpTestResponse = response;

            // Show preview of the response using the simplified formatter
            try {
                const jsonResponse = JSON.parse(response);

                // Log the complete response for debugging
                console.log("Full parsed test response:", jsonResponse);

                // Extract the body content for display preview
                const bodyContent = jsonResponse.body || '';
                console.log("Extracted body content:",
                    bodyContent.substring(0, 100) + (bodyContent.length > 100 ? '...' : ''));

                // Format and display
                this.responseContent.textContent = formatHttpResponse(response);
                this.httpResponsePreview.classList.remove('hidden');
            } catch (parseError) {
                console.error("Error parsing HTTP response:", parseError);
                this.responseContent.textContent = response;
                this.httpResponsePreview.classList.remove('hidden');
            }
        } catch (error) {
            console.error("Error testing HTTP request:", error);
            alert(`Failed to test request: ${error.message}`);
            this.httpResponsePreview.classList.add('hidden');
        } finally {
            // Re-enable button
            this.testRequestBtn.disabled = false;
            this.testRequestBtn.textContent = 'Test Request';
        }
    }

    /**
     * Handle "Add Source" button click
     * @private
     */
    async _handleAddSourceButtonClick() {
        try {
            const type = this.sourceType.value;
            let sourcePath = '';
            let method = '';
            let requestOptions = {};
            let refreshOptions = { interval: 0 };
            let initialContent = '';

            // Validate and get source path based on type
            if (type === 'file') {
                if (!this.currentFilePath) {
                    alert('Please select a file');
                    return;
                }
                sourcePath = this.currentFilePath;
                // Set default refresh options for file
                refreshOptions = this._collectRefreshOptions(type);
            } else if (type === 'env') {
                sourcePath = this.envNameInput.value.trim();
                if (!sourcePath) {
                    alert('Please enter an environment variable name');
                    return;
                }
                // Set default refresh options for env
                refreshOptions = this._collectRefreshOptions(type);
            } else if (type === 'http') {
                sourcePath = this.httpUrlInput.value.trim();
                if (!sourcePath) {
                    alert('Please enter a URL');
                    return;
                }

                // Add protocol if missing
                if (!sourcePath.match(/^https?:\/\//i)) {
                    sourcePath = 'https://' + sourcePath;
                    this.httpUrlInput.value = sourcePath;
                }

                method = this.httpMethodSelect.value;

                // Collect HTTP request options and refresh options
                try {
                    requestOptions = this._collectRequestOptions();
                    console.log("Collected request options:", JSON.stringify(requestOptions, null, 2));

                    // Collect refresh options with source type
                    refreshOptions = this._collectRefreshOptions(type);
                    console.log("Collected refresh options:", JSON.stringify(refreshOptions, null, 2));
                } catch (err) {
                    console.error("Error collecting options:", err);
                    return; // Stop if there was an error collecting options
                }

                // For HTTP type, if we have a test response, extract just the body content
                if (this.httpTestResponse) {
                    try {
                        console.log("Extracting body from HTTP test response:", this.httpTestResponse);
                        const response = JSON.parse(this.httpTestResponse);
                        // Get the actual body content
                        initialContent = response.body || '';
                        console.log("Extracted body content:",
                            initialContent.substring(0, 100) + (initialContent.length > 100 ? '...' : ''));

                        // Apply JSON filter if enabled and we have a path
                        const jsonFilter = {
                            enabled: this.enableJsonFilter && this.enableJsonFilter.checked,
                            path: this.jsonPathInput ? this.jsonPathInput.value.trim() : ''
                        };

                        if (jsonFilter.enabled && jsonFilter.path && initialContent) {
                            console.log(`Applying JSON filter with path: ${jsonFilter.path} to initial content`);
                            initialContent = window.applyJsonFilter(initialContent, jsonFilter);
                            console.log(`Filtered initial content: ${initialContent}`);
                        }
                    } catch (err) {
                        console.error("Error parsing HTTP test response:", err);
                        // If we can't parse it, just use it as is
                        initialContent = this.httpTestResponse;
                        console.log("Using raw response as content");
                    }
                } else {
                    // If no test was performed, set a loading message
                    initialContent = '';
                    console.log("No test performed, will let service fetch initial content");
                }
            }

            // Get the JSON filter as a separate property (not inside requestOptions)
            const jsonFilter = {
                enabled: this.enableJsonFilter && this.enableJsonFilter.checked,
                path: this.jsonPathInput ? this.jsonPathInput.value.trim() : ''
            };

            // Notify the SourceTableController to add a new source
            const sourceTag = this.tagInput.value.trim() || '';

            console.log("Dispatching add-source event with:", {
                sourceType: type,
                sourcePath,
                sourceTag,
                sourceMethod: method,
                sourceContent: initialContent ? "Content available" : "No content",
                requestOptions: JSON.stringify(requestOptions),
                jsonFilter: JSON.stringify(jsonFilter),
                refreshOptions: JSON.stringify(refreshOptions)
            });

            const event = new CustomEvent('add-source', {
                detail: {
                    sourceType: type,
                    sourcePath,
                    sourceTag,
                    sourceMethod: method,
                    sourceContent: initialContent,
                    requestOptions: requestOptions,
                    jsonFilter: jsonFilter,  // Add as separate property
                    refreshOptions: refreshOptions
                }
            });

            document.dispatchEvent(event);
            console.log("Event dispatched");

            // Reset form
            this._resetForm();
        } catch (error) {
            console.error("Error in add source handler:", error);
            alert("Failed to add source: " + error.message);
        }
    }

    /**
     * Reset the form to its default state
     * @private
     */
    _resetForm() {
        // Safely update DOM elements with null checks
        if (this.filePathDisplay) this.filePathDisplay.textContent = 'No file selected';
        this.currentFilePath = null;

        if (this.envNameInput) this.envNameInput.value = '';
        if (this.httpUrlInput) this.httpUrlInput.value = '';
        if (this.httpMethodSelect) this.httpMethodSelect.value = 'GET';
        if (this.tagInput) this.tagInput.value = '';

        if (this.httpResponsePreview) this.httpResponsePreview.classList.add('hidden');
        this.httpTestResponse = null;

        // Reset HTTP options
        if (this.queryParamsContainer) this.queryParamsContainer.innerHTML = '';
        if (this.headersContainer) this.headersContainer.innerHTML = '';
        if (this.jsonBodyEditor) this.jsonBodyEditor.value = '';
        if (this.formBodyEditor) this.formBodyEditor.value = '';

        // Reset refresh options
        if (this.refreshIntervalSelect) this.refreshIntervalSelect.value = 'none';
        if (this.refreshIntervalCustom) this.refreshIntervalCustom.value = '';
        if (this.refreshIntervalCustomRow) this.refreshIntervalCustomRow.classList.add('hidden');

        // Reset JSON filter
        if (this.enableJsonFilter) this.enableJsonFilter.checked = false;
        if (this.jsonPathInput) this.jsonPathInput.value = '';
        if (this.jsonFilterOptions) this.jsonFilterOptions.classList.add('hidden');
        if (this.jsonPathPreview) this.jsonPathPreview.classList.add('hidden');

        // Add back default headers
        this._addHeader('Accept', 'application/json');
        this._addHeader('User-Agent', 'OpenHeaders/1.0');

        // Reset arrays
        this.queryParams = [];
        this.headers = [];
    }

    /**
     * Toggle JSON filter options visibility
     * @private
     */
    _toggleJsonFilterOptions() {
        if (this.enableJsonFilter.checked) {
            this.jsonFilterOptions.classList.remove('hidden');
        } else {
            this.jsonFilterOptions.classList.add('hidden');
            // Hide the preview too
            this.jsonPathPreview.classList.add('hidden');
        }
    }

    /**
     * Test the JSON path against the current HTTP test response
     * @private
     */
    _testJsonPath() {
        // Check if we have a test response and a path
        if (!this.httpTestResponse) {
            alert('Please test the HTTP request first to get a response');
            return;
        }

        const path = this.jsonPathInput.value.trim();
        if (!path) {
            alert('Please enter a JSON path');
            return;
        }

        try {
            // Parse the test response
            const response = JSON.parse(this.httpTestResponse);

            // Get the body content
            const body = response.body || '';

            if (!body) {
                alert('The HTTP response body is empty');
                return;
            }

            // Try to parse the body as JSON
            let jsonBody;
            try {
                jsonBody = JSON.parse(body);
            } catch (e) {
                alert('The HTTP response body is not valid JSON');
                return;
            }

            // Apply the path
            const jsonFilter = { enabled: true, path };
            const filteredResult = applyJsonFilter(body, jsonFilter);

            // Show the result
            this.jsonPathResult.textContent = filteredResult;
            this.jsonPathPreview.classList.remove('hidden');
        } catch (error) {
            console.error('Error testing JSON path:', error);
            alert(`Error testing path: ${error.message}`);
        }
    }

    /**
     * Initialize TOTP event listeners
     * @private
     */
    _initTOTPEventListeners() {
        // Check if TOTP elements exist
        const enableTOTPCheckbox = document.getElementById('enableTOTP');
        const totpOptionsPanel = document.getElementById('totpOptionsPanel');
        const totpSecretInput = document.getElementById('totpSecretInput');
        const testTOTPBtn = document.getElementById('testTOTPBtn');
        const totpPreview = document.getElementById('totpPreview');

        if (!enableTOTPCheckbox || !totpOptionsPanel) {
            console.log('TOTP elements not found in the DOM');
            return;
        }

        // Toggle TOTP options visibility
        enableTOTPCheckbox.addEventListener('change', () => {
            if (enableTOTPCheckbox.checked) {
                totpOptionsPanel.classList.remove('hidden');
            } else {
                totpOptionsPanel.classList.add('hidden');
                totpPreview.classList.add('hidden');

                // Clear any existing timer
                if (this.totpCountdownTimer) {
                    clearInterval(this.totpCountdownTimer);
                    this.totpCountdownTimer = null;
                }
            }
        });

        // Test TOTP button click
        if (testTOTPBtn && totpSecretInput && totpPreview) {
            testTOTPBtn.addEventListener('click', async () => {
                // Use our async handler that properly awaits the TOTP generation
                await this._handleTestTOTPClick();
            });
        }
    }

    /**
     * Update the TOTP preview with the current code
     * @param {string} secret - TOTP secret key
     * @private
     */
    async _updateTOTPPreview(secret) {
        const totpCodeElement = document.getElementById('totpCode');
        if (!totpCodeElement) return;

        try {
            // Use the utility function from utils.js
            if (typeof window.generateTOTP === 'function') {
                // Since generateTOTP is now async, we need to await it
                const code = await window.generateTOTP(secret);
                totpCodeElement.textContent = code;
            } else {
                // Fallback if function is not available
                console.error('generateTOTP function not found');
                totpCodeElement.textContent = 'ERROR';
            }
        } catch (error) {
            console.error('Error updating TOTP preview:', error);
            totpCodeElement.textContent = 'ERROR';
        }
    }

    /**
     * Test TOTP button click handler
     * @private
     */
    async _handleTestTOTPClick() {
        const totpSecretInput = document.getElementById('totpSecretInput');
        const totpPreview = document.getElementById('totpPreview');

        if (!totpSecretInput || !totpPreview) return;

        const secret = totpSecretInput.value.trim();
        if (!secret) {
            alert('Please enter a TOTP secret key');
            return;
        }

        try {
            // Make sure we await the update
            await this._updateTOTPPreview(secret);
            totpPreview.classList.remove('hidden');

            // Start the countdown timer
            this._startTOTPCountdown(secret);
        } catch (error) {
            console.error('Error testing TOTP:', error);
            alert(`Error generating TOTP: ${error.message}`);
        }
    }

    /**
     * Start the TOTP countdown timer
     * @param {string} secret - TOTP secret key
     * @private
     */
    _startTOTPCountdown(secret) {
        const totpTimeRemainingElement = document.getElementById('totpTimeRemaining');
        const totpCodeElement = document.getElementById('totpCode');

        if (!totpTimeRemainingElement || !totpCodeElement) return;

        // Clear any existing timer
        if (this.totpCountdownTimer) {
            clearInterval(this.totpCountdownTimer);
            this.totpCountdownTimer = null;
        }

        // Calculate initial remaining time
        const period = 30; // Default TOTP period
        const now = Math.floor(Date.now() / 1000);
        const currentTimeSlot = Math.floor(now / period);
        const nextChange = (currentTimeSlot + 1) * period;
        let remaining = nextChange - now;

        // Update time remaining immediately
        totpTimeRemainingElement.textContent = `(${remaining}s)`;

        // Start countdown
        this.totpCountdownTimer = setInterval(async () => {
            remaining -= 1;

            if (remaining <= 0) {
                // Time to generate a new code
                await this._updateTOTPPreview(secret);
                remaining = period;
            }

            totpTimeRemainingElement.textContent = `(${remaining}s)`;
        }, 1000);
    }

    /**
     * Collect TOTP options from the UI
     * @returns {Object} TOTP options
     * @private
     */
    _collectTOTPOptions() {
        const enableTOTPCheckbox = document.getElementById('enableTOTP');
        const totpSecretInput = document.getElementById('totpSecretInput');

        if (!enableTOTPCheckbox || !totpSecretInput) {
            return { enabled: false };
        }

        return {
            enabled: enableTOTPCheckbox.checked,
            secret: totpSecretInput.value.trim()
        };
    }
}

// Export the class
window.SourceFormController = SourceFormController;