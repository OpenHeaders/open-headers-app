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

import React from 'react';
import { Row, Col } from 'antd';
import JsonFilterCard from './JsonFilterCard';
import TotpAuthCard from './TotpAuthCard';
import AutoRefreshCard from './AutoRefreshCard';

/**
 * HTTP Options tab component combining various configuration cards
 * 
 * @param {Object} props - Component props
 * @param {boolean} props.jsonFilterEnabled - JSON filter enabled state
 * @param {Function} props.handleJsonFilterToggle - JSON filter toggle handler
 * @param {Function} props.validateVariableExists - Variable validation function
 * @param {Object} props.form - Form instance
 * @param {Function} props.handleTotpToggle - TOTP toggle handler
 * @param {Function} props.handleTotpSecretChange - TOTP secret change handler
 * @param {Function} props.handleTestTotp - TOTP test handler
 * @param {string} props.totpError - TOTP error message
 * @param {boolean} props.totpTesting - TOTP testing state
 * @param {boolean} props.totpPreviewVisible - TOTP preview visibility
 * @param {string} props.totpCode - Current TOTP code
 * @param {number} props.timeRemaining - Time remaining for TOTP code
 * @param {string} props.testSourceId - Test source ID
 * @param {Function} props.canUseTotpSecret - TOTP cooldown check function
 * @param {Function} props.getCooldownSeconds - Cooldown seconds function
 * @param {boolean} props.refreshEnabled - Auto-refresh enabled state
 * @param {Function} props.handleRefreshToggle - Refresh toggle handler
 * @param {string} props.refreshType - Refresh type (preset/custom)
 * @param {Function} props.handleRefreshTypeChange - Refresh type change handler
 * @param {number} props.customInterval - Custom interval value
 * @param {Function} props.handlePresetIntervalChange - Preset interval change handler
 * @param {Function} props.handleCustomIntervalChange - Custom interval change handler
 * @returns {JSX.Element} HTTP options tab component
 */
const HttpOptionsTab = ({
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
    handleCustomIntervalChange
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