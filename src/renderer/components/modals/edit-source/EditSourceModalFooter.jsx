import React from 'react';
import { Button, Tooltip } from 'antd';

/**
 * EditSourceModalFooter component provides the modal footer with Cancel and Save buttons
 * Handles loading states, tooltips, and button states based on form validation
 */
const EditSourceModalFooter = ({
    source,
    saving,
    testing,
    refreshingSourceId,
    totpEnabled,
    totpSecret,
    refreshNow,
    canUseTotpSecret,
    getCooldownSeconds,
    onCancel,
    onSave
}) => {
    // Determine if TOTP cooldown is active
    const isTotpCooldownActive = totpEnabled && 
        totpSecret && 
        source && 
        source.sourceId && 
        !canUseTotpSecret(source.sourceId) && 
        refreshNow;
    
    // Loading state for save button
    const isSaveLoading = saving || 
        refreshingSourceId === source.sourceId || 
        isTotpCooldownActive;
    
    // Disabled state for buttons
    const isDisabled = testing || isTotpCooldownActive;
    
    // Tooltip messages
    const getCancelTooltip = () => {
        if (testing) return "Please wait for the test request to complete";
        if (saving || refreshingSourceId === source.sourceId) return "Please wait for the current operation to complete";
        return "";
    };
    
    const getSaveTooltip = () => {
        if (testing) return "Please wait for the test request to complete";
        if (isTotpCooldownActive) return `TOTP cooldown active. Please wait ${getCooldownSeconds(source.sourceId)} seconds.`;
        if (saving || refreshingSourceId === source.sourceId) return "Saving changes...";
        return "Save changes and refresh source data";
    };

    return [
        <Tooltip 
            title={getCancelTooltip()}
            key="cancel-tooltip"
        >
            <Button 
                key="cancel" 
                onClick={onCancel} 
                disabled={isDisabled}
            >
                Cancel
            </Button>
        </Tooltip>,
        <Tooltip 
            title={getSaveTooltip()}
            key="save-tooltip"
        >
            <Button
                key="save"
                type="primary"
                onClick={onSave}
                loading={isSaveLoading}
                disabled={isDisabled}
            >
                Save
            </Button>
        </Tooltip>
    ];
};

export default EditSourceModalFooter;