/**
 * HTTP Options Tab Component
 *
 * Combines JSON Filter, TOTP Authentication, and Auto-Refresh cards
 * into a unified options configuration interface.
 *
 * Features:
 * - JSON response filtering configuration
 * - TOTP authentication setup and testing
 * - Auto-refresh interval configuration
 * - Organized two-column layout
 *
 * @component
 * @since 3.0.0
 */

import type { FormInstance } from 'antd';
import { Col, Row } from 'antd';
import type React from 'react';
import AutoRefreshCard from './AutoRefreshCard';
import JsonFilterCard from './JsonFilterCard';
import TotpAuthCard from './TotpAuthCard';

interface HttpOptionsTabProps {
  // JSON Filter props
  jsonFilterEnabled: boolean;
  handleJsonFilterToggle: (enabled: boolean) => void;
  validateVariableExists: (value: string) => { valid: boolean; error?: string };
  form: FormInstance;

  // TOTP props
  handleTotpToggle: (checked: boolean) => void;
  handleTotpSecretChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleTestTotp: () => Promise<void>;
  totpError: string | null;
  totpTesting: boolean;
  totpPreviewVisible: boolean;
  totpCode: string;
  timeRemaining: number;
  testSourceId: string;
  canUseTotpSecret: (sourceId: string) => boolean;
  getCooldownSeconds: (sourceId: string) => number;

  // Auto-refresh props
  refreshEnabled: boolean;
  handleRefreshToggle: (checked: boolean) => void;
  refreshType: string;
  handleRefreshTypeChange: (e: { target: { value?: string } }) => void;
  customInterval: number;
  handlePresetIntervalChange: (value: number) => void;
  handleCustomIntervalChange: (value: number | null) => void;
}

/**
 * HTTP Options tab component combining various configuration cards
 *
 *  props - Component props
 *  props.jsonFilterEnabled - JSON filter enabled state
 *  props.handleJsonFilterToggle - JSON filter toggle handler
 *  props.validateVariableExists - Variable validation function
 *  props.form - Form instance
 *  props.handleTotpToggle - TOTP toggle handler
 *  props.handleTotpSecretChange - TOTP secret change handler
 *  props.handleTestTotp - TOTP test handler
 *  props.totpError - TOTP error message
 *  props.totpTesting - TOTP testing state
 *  props.totpPreviewVisible - TOTP preview visibility
 *  props.totpCode - Current TOTP code
 *  props.timeRemaining - Time remaining for TOTP code
 *  props.testSourceId - Test source ID
 *  props.canUseTotpSecret - TOTP cooldown check function
 *  props.getCooldownSeconds - Cooldown seconds function
 *  props.refreshEnabled - Auto-refresh enabled state
 *  props.handleRefreshToggle - Refresh toggle handler
 *  props.refreshType - Refresh type (preset/custom)
 *  props.handleRefreshTypeChange - Refresh type change handler
 *  props.customInterval - Custom interval value
 *  props.handlePresetIntervalChange - Preset interval change handler
 *  props.handleCustomIntervalChange - Custom interval change handler
 *  HTTP options tab component
 */
const HttpOptionsTab: React.FC<HttpOptionsTabProps> = ({
  // JSON Filter props
  jsonFilterEnabled,
  handleJsonFilterToggle,
  validateVariableExists,
  form,

  // TOTP props
  handleTotpToggle,
  handleTotpSecretChange,
  handleTestTotp,
  totpError,
  totpTesting,
  totpPreviewVisible,
  totpCode,
  timeRemaining,
  testSourceId,
  canUseTotpSecret,
  getCooldownSeconds,

  // Auto-refresh props
  refreshEnabled,
  handleRefreshToggle,
  refreshType,
  handleRefreshTypeChange,
  customInterval,
  handlePresetIntervalChange,
  handleCustomIntervalChange,
}) => {
  return (
    <Row gutter={16}>
      <Col span={12}>
        <JsonFilterCard
          jsonFilterEnabled={jsonFilterEnabled}
          handleJsonFilterToggle={handleJsonFilterToggle}
          validateVariableExists={validateVariableExists}
          form={form}
        />

        <TotpAuthCard
          handleTotpToggle={handleTotpToggle}
          handleTotpSecretChange={handleTotpSecretChange}
          handleTestTotp={handleTestTotp}
          totpError={totpError}
          totpTesting={totpTesting}
          totpPreviewVisible={totpPreviewVisible}
          totpCode={totpCode}
          timeRemaining={timeRemaining}
          testSourceId={testSourceId}
          canUseTotpSecret={canUseTotpSecret}
          getCooldownSeconds={getCooldownSeconds}
        />
      </Col>
      <Col span={12}>
        <AutoRefreshCard
          refreshEnabled={refreshEnabled}
          handleRefreshToggle={handleRefreshToggle}
          refreshType={refreshType}
          handleRefreshTypeChange={handleRefreshTypeChange}
          customInterval={customInterval}
          handlePresetIntervalChange={handlePresetIntervalChange}
          handleCustomIntervalChange={handleCustomIntervalChange}
          form={form}
        />
      </Col>
    </Row>
  );
};

export default HttpOptionsTab;
