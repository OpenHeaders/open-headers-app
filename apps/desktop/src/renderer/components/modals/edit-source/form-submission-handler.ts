import type { FormInstance } from 'antd';
import type React from 'react';
import type {
  JsonFilter,
  RefreshOptions,
  Source,
  SourceMethod,
  SourceRequestOptions,
  SourceType,
} from '../../../../types/source';
import { showMessage } from '../../../utils';
import { createLogger } from '../../../utils/error-handling/logger';
import { validateAllFormFields } from './form-validation';

const log = createLogger('FormSubmissionHandler');

interface HttpOptionsHandle {
  getTotpState?: () => { enabled: boolean; secret?: string };
  getJsonFilterState?: () => { enabled: boolean; path?: string };
  getHeadersState?: () => Array<{ key: string; value: string }>;
}

/** Shape of form values returned by Ant Design form.getFieldsValue() */
export interface EditSourceFormValues {
  sourceType?: SourceType;
  sourcePath?: string;
  sourceTag?: string;
  sourceMethod?: SourceMethod;
  requestOptions?: SourceRequestOptions;
  jsonFilter?: JsonFilter;
  refreshOptions?: RefreshOptions;
  enableTOTP?: boolean;
  totpSecret?: string;
}

/** Minimal environment context needed by form validation */
interface FormEnvContext {
  environmentsReady: boolean;
  getAllVariables: () => Record<string, string>;
  activeEnvironment: string;
}

/** Source data prepared for submission (Source + edit-specific fields) */
interface EditSourceSubmission extends Source {
  refreshNow: boolean;
}

class FormSubmissionHandler {
  form: FormInstance;
  source: Source;
  envContext: FormEnvContext;
  httpOptionsRef: React.MutableRefObject<HttpOptionsHandle | null>;
  totpEnabled: boolean;
  totpSecret: string;

  constructor(
    form: FormInstance,
    source: Source,
    envContext: FormEnvContext,
    httpOptionsRef: React.MutableRefObject<HttpOptionsHandle | null>,
  ) {
    this.form = form;
    this.source = source;
    this.envContext = envContext;
    this.httpOptionsRef = httpOptionsRef;
    this.totpEnabled = false;
    this.totpSecret = '';
  }

  validateJsonFilter(jsonFilter: JsonFilter | null): boolean {
    if (jsonFilter?.enabled === true && !jsonFilter?.path) {
      this.form.setFields([
        {
          name: ['jsonFilter', 'path'],
          errors: ['JSON path is required when filter is enabled'],
        },
      ]);
      showMessage('error', 'JSON filter is enabled but no path is specified. Please enter a JSON path.');
      return false;
    }
    return true;
  }

  async validateAndPrepareData(): Promise<EditSourceFormValues> {
    const fieldsToValidate = ['sourcePath', 'sourceTag', 'sourceMethod'];
    log.debug('Validating fields before save:', fieldsToValidate);

    await this.form.validateFields(fieldsToValidate);

    const values = this.form.getFieldsValue(true) as EditSourceFormValues;
    log.debug('All form values after validation:', {
      refreshOptions: values.refreshOptions,
      jsonFilter: values.jsonFilter,
      sourceType: values.sourceType,
    });

    const jsonFilter: JsonFilter | null = this.form.getFieldValue('jsonFilter');
    if (!this.validateJsonFilter(jsonFilter)) {
      throw new Error('JSON filter validation failed');
    }

    await validateAllFormFields(this.form, this.envContext);

    return values;
  }

  normalizeJsonFilter(jsonFilter: JsonFilter | undefined | null): JsonFilter {
    return {
      enabled: Boolean(jsonFilter?.enabled),
      path: jsonFilter?.enabled === true ? jsonFilter.path || '' : '',
    };
  }

  collectTotpConfiguration(values: EditSourceFormValues): { isTotpEnabled: boolean; totpSecretValue: string } {
    let isTotpEnabled = values.enableTOTP === true;
    let totpSecretValue = values.totpSecret || '';

    if (!isTotpEnabled && this.totpEnabled) {
      isTotpEnabled = true;
      if (!totpSecretValue && this.totpSecret) {
        totpSecretValue = this.totpSecret;
      }
    }

    if (this.httpOptionsRef.current?.getTotpState) {
      const totpState = this.httpOptionsRef.current.getTotpState();
      if (totpState.enabled) {
        isTotpEnabled = true;
        if (totpState.secret) {
          totpSecretValue = totpState.secret;
        }
      }
    }

    return { isTotpEnabled, totpSecretValue };
  }

  prepareSourceData(values: EditSourceFormValues, shouldRefreshNow: boolean): EditSourceSubmission {
    const normalizedJsonFilter = this.normalizeJsonFilter(values.jsonFilter);
    const { isTotpEnabled, totpSecretValue } = this.collectTotpConfiguration(values);

    const requestOptions: SourceRequestOptions = {
      ...this.source.requestOptions,
      ...values.requestOptions,
      headers: values.requestOptions?.headers || this.source.requestOptions?.headers || [],
      queryParams: values.requestOptions?.queryParams || this.source.requestOptions?.queryParams || [],
      body: values.requestOptions?.body || this.source.requestOptions?.body || undefined,
      contentType: values.requestOptions?.contentType || this.source.requestOptions?.contentType || 'application/json',
    };

    // Handle TOTP configuration
    if (isTotpEnabled && totpSecretValue) {
      requestOptions.totpSecret = totpSecretValue;
    } else {
      delete requestOptions.totpSecret;
    }

    const sourceData: EditSourceSubmission = {
      sourceId: this.source.sourceId,
      sourceType: this.source.sourceType,
      sourcePath: values.sourcePath,
      sourceTag: values.sourceTag || '',
      sourceMethod: values.sourceMethod || 'GET',
      requestOptions,
      jsonFilter: normalizedJsonFilter,
      refreshOptions: {
        enabled: false,
        ...this.source.refreshOptions,
        ...values.refreshOptions,
      },
      refreshNow: shouldRefreshNow,
      isFiltered: this.source.isFiltered || normalizedJsonFilter.enabled,
      filteredWith: normalizedJsonFilter.enabled ? normalizedJsonFilter.path : this.source.filteredWith,
    };

    // Preserve the original response if it exists
    if (this.source.originalResponse) {
      sourceData.originalResponse = this.source.originalResponse;
    }

    return sourceData;
  }

  updateFromHttpOptions(sourceData: EditSourceSubmission): void {
    if (!this.httpOptionsRef.current) return;

    if (this.httpOptionsRef.current.getJsonFilterState) {
      const jsonFilterState = this.httpOptionsRef.current.getJsonFilterState();

      if (jsonFilterState.enabled === true && !jsonFilterState.path) {
        throw new Error('JSON filter is enabled but no path is specified. Please enter a JSON path.');
      }

      sourceData.jsonFilter = {
        enabled: Boolean(jsonFilterState.enabled),
        path: jsonFilterState.enabled === true ? jsonFilterState.path || '' : '',
      };

      sourceData.isFiltered = jsonFilterState.enabled;
      sourceData.filteredWith = jsonFilterState.enabled ? jsonFilterState.path : null;
    }

    if (this.httpOptionsRef.current.getHeadersState) {
      const headers = this.httpOptionsRef.current.getHeadersState();
      if (headers && headers.length > 0) {
        if (!sourceData.requestOptions) sourceData.requestOptions = {};
        sourceData.requestOptions.headers = headers;
      }
    }
  }

  ensureUrlProtocol(sourceData: EditSourceSubmission): void {
    if (sourceData.sourceType === 'http' && sourceData.sourcePath && !sourceData.sourcePath.match(/^https?:\/\//i)) {
      sourceData.sourcePath = 'https://' + sourceData.sourcePath;
    }
  }

  validateFinalSourceData(sourceData: EditSourceSubmission): void {
    if (sourceData.jsonFilter?.enabled === true && !sourceData.jsonFilter?.path) {
      throw new Error('JSON filter is enabled but no path is specified. Please enter a JSON path.');
    }
  }

  async handleSubmission(shouldRefreshNow: boolean): Promise<EditSourceSubmission> {
    try {
      const values = await this.validateAndPrepareData();
      const sourceData = this.prepareSourceData(values, shouldRefreshNow);

      this.updateFromHttpOptions(sourceData);
      this.validateFinalSourceData(sourceData);
      this.ensureUrlProtocol(sourceData);

      return sourceData;
    } catch (error) {
      log.error('Form submission failed:', error);
      throw error;
    }
  }
}

export default FormSubmissionHandler;
