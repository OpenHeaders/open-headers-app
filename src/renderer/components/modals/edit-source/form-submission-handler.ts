import { showMessage } from '../../../utils';
import { validateAllFormFields } from './form-validation';
import timeManager from '../../../services/TimeManager';

const { createLogger } = require('../../../utils/error-handling/logger');
const log = createLogger('FormSubmissionHandler');

/**
 * Handles the complex form submission logic for EditSourceModal
 * Extracted for better maintainability and testability
 */
class FormSubmissionHandler {
    constructor(form, source, envContext, httpOptionsRef, originalValuesRef) {
        this.form = form;
        this.source = source;
        this.envContext = envContext;
        this.httpOptionsRef = httpOptionsRef;
        this.originalValuesRef = originalValuesRef;
        // These properties are set dynamically from EditSourceModal
        this.totpEnabled = false;
        this.totpSecret = '';
    }

    /**
     * Validates JSON filter configuration
     * @param {Object} jsonFilter - JSON filter object
     * @returns {boolean} - True if valid, false otherwise
     */
    validateJsonFilter(jsonFilter) {
        if (jsonFilter?.enabled === true && !jsonFilter?.path) {
            // Make the path field visible and mark it as error
            this.form.setFields([
                {
                    name: ['jsonFilter', 'path'],
                    errors: ['JSON path is required when filter is enabled']
                }
            ]);
            showMessage('error', 'JSON filter is enabled but no path is specified. Please enter a JSON path.');
            return false;
        }
        return true;
    }

    /**
     * Validates all form fields and prepares source data
     * @returns {Promise<Object>} - Prepared source data
     */
    async validateAndPrepareData() {
        // First validate basic fields
        const fieldsToValidate = ['sourcePath', 'sourceTag', 'sourceMethod'];
        log.debug('Validating fields before save:', fieldsToValidate);
        
        await this.form.validateFields(fieldsToValidate);
        
        // Get ALL form values after validation
        const values = this.form.getFieldsValue(true);
        log.debug('All form values after validation:', {
            refreshOptions: values.refreshOptions,
            jsonFilter: values.jsonFilter,
            sourceType: values.sourceType
        });
        
        // Validate JSON filter first
        const jsonFilter = this.form.getFieldValue('jsonFilter');
        if (!this.validateJsonFilter(jsonFilter)) {
            throw new Error('JSON filter validation failed');
        }
        
        // Perform comprehensive validation of all fields
        await validateAllFormFields(this.form, this.envContext);
        
        return values;
    }

    /**
     * Normalizes the JSON filter object
     * @param {Object} jsonFilter - Raw JSON filter from form
     * @returns {Object} - Normalized JSON filter
     */
    normalizeJsonFilter(jsonFilter) {
        return {
            enabled: Boolean(jsonFilter?.enabled),
            path: jsonFilter?.enabled === true ? (jsonFilter.path || '') : ''
        };
    }

    /**
     * Collects TOTP configuration from multiple sources
     * @param {Object} values - Form values
     * @returns {Object} - TOTP configuration
     */
    collectTotpConfiguration(values) {
        // First check form values
        let isTotpEnabled = values.enableTOTP === true;
        let totpSecretValue = values.totpSecret || '';

        // Then check component state as an alternative
        if (!isTotpEnabled && this.totpEnabled) {
            isTotpEnabled = true;
            if (!totpSecretValue && this.totpSecret) {
                totpSecretValue = this.totpSecret;
            }
        }

        // Check if ref is available and has TOTP state
        if (this.httpOptionsRef.current && this.httpOptionsRef.current.getTotpState) {
            const totpState = this.httpOptionsRef.current.getTotpState();

            // Override previous values if TOTP is enabled in the ref
            if (totpState.enabled) {
                isTotpEnabled = true;
                if (totpState.secret) {
                    totpSecretValue = totpState.secret;
                }
            }
        }

        return { isTotpEnabled, totpSecretValue };
    }

    /**
     * Prepares the source data object for submission
     * @param {Object} values - Form values
     * @param {boolean} shouldRefreshNow - Whether to refresh immediately
     * @returns {Object} - Prepared source data
     */
    prepareSourceData(values, shouldRefreshNow) {
        const normalizedJsonFilter = this.normalizeJsonFilter(values.jsonFilter);
        const { isTotpEnabled, totpSecretValue } = this.collectTotpConfiguration(values);

        // Prepare source data for update - preserve originalResponse if available
        const sourceData = {
            sourceId: this.source.sourceId,
            sourceType: this.source.sourceType,
            sourcePath: values.sourcePath,
            sourceTag: values.sourceTag || '',
            sourceMethod: values.sourceMethod || 'GET',
            requestOptions: {
                ...this.source.requestOptions,
                ...values.requestOptions,
                headers: values.requestOptions?.headers || this.source.requestOptions?.headers || [],
                queryParams: values.requestOptions?.queryParams || this.source.requestOptions?.queryParams || [],
                body: values.requestOptions?.body || this.source.requestOptions?.body || null,
                contentType: values.requestOptions?.contentType || this.source.requestOptions?.contentType || 'application/json'
            },
            jsonFilter: normalizedJsonFilter,
            refreshOptions: values.refreshOptions || { enabled: false, interval: 0 },
            refreshNow: shouldRefreshNow,
            isFiltered: this.source.isFiltered || normalizedJsonFilter.enabled,
            filteredWith: normalizedJsonFilter.enabled ? normalizedJsonFilter.path : this.source.filteredWith
        };

        // Preserve the original response if it exists
        if (this.source.originalResponse) {
            sourceData.originalResponse = this.source.originalResponse;
        }

        // Handle TOTP configuration
        if (isTotpEnabled && totpSecretValue) {
            sourceData.requestOptions.totpSecret = totpSecretValue;
        } else if (sourceData.requestOptions.totpSecret) {
            delete sourceData.requestOptions.totpSecret;
        }

        return sourceData;
    }

    /**
     * Updates source data with latest state from HttpOptions component
     * @param {Object} sourceData - Source data to update
     */
    updateFromHttpOptions(sourceData) {
        if (!this.httpOptionsRef.current) return;

        // Update JSON filter state
        if (this.httpOptionsRef.current.getJsonFilterState) {
            const jsonFilterState = this.httpOptionsRef.current.getJsonFilterState();

            // Additional validation to ensure path exists when enabled
            if (jsonFilterState.enabled === true && !jsonFilterState.path) {
                throw new Error('JSON filter is enabled but no path is specified. Please enter a JSON path.');
            }

            sourceData.jsonFilter = {
                enabled: Boolean(jsonFilterState.enabled),
                path: jsonFilterState.enabled === true ? (jsonFilterState.path || '') : ''
            };

            sourceData.isFiltered = jsonFilterState.enabled;
            sourceData.filteredWith = jsonFilterState.enabled ? jsonFilterState.path : null;
        }

        // Update headers state
        if (this.httpOptionsRef.current.getHeadersState) {
            const headers = this.httpOptionsRef.current.getHeadersState();
            if (headers && headers.length > 0) {
                sourceData.requestOptions.headers = headers;
            }
        }
    }

    /**
     * Configures refresh timing based on form changes
     * @param {Object} sourceData - Source data to configure
     * @param {boolean} shouldRefreshNow - Whether to refresh immediately
     */
    configureRefreshTiming(sourceData, shouldRefreshNow) {
        const hasIntervalChanged = 
            sourceData.refreshOptions?.interval !== this.originalValuesRef.current.interval;
        const hasEnabledChanged = 
            sourceData.refreshOptions?.enabled !== this.originalValuesRef.current.enabled;

        // Set preserveTiming based on whether we want to keep the current timer running
        if (!hasEnabledChanged && !shouldRefreshNow &&
            this.source.refreshOptions?.nextRefresh &&
            this.source.refreshOptions.nextRefresh > timeManager.now()) {
            
            if (!sourceData.refreshOptions) {
                sourceData.refreshOptions = {};
            }
            sourceData.refreshOptions.preserveTiming = true;
            
            if (hasIntervalChanged) {
                log.debug(`Interval changed but preserving timing (no immediate refresh): old=${this.originalValuesRef.current.interval}m, new=${sourceData.refreshOptions.interval}m`);
            }
        } else if (hasEnabledChanged) {
            // Enabled state changed - don't preserve timing
            if (sourceData.refreshOptions) {
                sourceData.refreshOptions.preserveTiming = false;
            }
        } else if (shouldRefreshNow) {
            // User wants immediate refresh - don't preserve timing
            if (sourceData.refreshOptions) {
                sourceData.refreshOptions.preserveTiming = false;
            }
        }
    }

    /**
     * Ensures URL has proper protocol
     * @param {Object} sourceData - Source data to update
     */
    ensureUrlProtocol(sourceData) {
        if (sourceData.sourceType === 'http' && !sourceData.sourcePath.match(/^https?:\/\//i)) {
            sourceData.sourcePath = 'https://' + sourceData.sourcePath;
        }
    }

    /**
     * Performs final validation checks on prepared source data
     * @param {Object} sourceData - Source data to validate
     * @throws {Error} - If validation fails
     */
    validateFinalSourceData(sourceData) {
        // Final validation check for JSON filter
        if (sourceData.jsonFilter.enabled === true && !sourceData.jsonFilter.path) {
            throw new Error('JSON filter is enabled but no path is specified. Please enter a JSON path.');
        }
    }

    /**
     * Main submission handler
     * @param {boolean} shouldRefreshNow - Whether to refresh immediately
     * @returns {Promise<Object>} - Prepared source data
     */
    async handleSubmission(shouldRefreshNow) {
        try {
            const values = await this.validateAndPrepareData();
            let sourceData = this.prepareSourceData(values, shouldRefreshNow);
            
            this.updateFromHttpOptions(sourceData);
            this.validateFinalSourceData(sourceData);
            this.ensureUrlProtocol(sourceData);
            this.configureRefreshTiming(sourceData, shouldRefreshNow);
            
            return sourceData;
        } catch (error) {
            log.error('Form submission failed:', error);
            throw error;
        }
    }
}

export default FormSubmissionHandler;