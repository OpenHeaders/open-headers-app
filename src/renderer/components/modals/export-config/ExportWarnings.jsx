import React from 'react';
import { Alert } from 'antd';
import { WarningOutlined, InfoCircleOutlined } from '@ant-design/icons';

/**
 * ExportWarnings component for displaying contextual warnings and information alerts
 * Provides dynamic warnings based on export configuration and sensitive data inclusion
 * 
 * @param {string} environmentOption - Environment export option ('none', 'schema', 'full')
 * @param {boolean} includeWorkspace - Whether workspace configuration is included
 * @param {boolean} includeCredentials - Whether authentication credentials are included
 * @param {string} exportPurpose - Export purpose ('team' or 'backup')
 */
const ExportWarnings = ({ 
    environmentOption, 
    includeWorkspace, 
    includeCredentials, 
    exportPurpose 
}) => {
    // Determine if security warning should be shown for sensitive data
    const showSecurityWarning = (environmentOption === 'full' || (includeWorkspace && includeCredentials));
    
    // Determine if team-ready info should be shown (safe configuration)
    const showTeamReadyInfo = (
        exportPurpose === 'team' && 
        environmentOption === 'schema' && 
        !includeCredentials
    );

    return (
        <>
            {/* Security warning for sensitive data export */}
            {showSecurityWarning && (
                <Alert
                    message="Security Warning"
                    description={
                        <div>
                            This export will contain sensitive data:
                            <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                                {environmentOption === 'full' && <li>Environment variables (API tokens, passwords, etc.)</li>}
                                {includeCredentials && <li>Git authentication credentials</li>}
                            </ul>
                            Store it securely and never commit to version control.
                        </div>
                    }
                    type="warning"
                    showIcon
                    icon={<WarningOutlined />}
                />
            )}

            {/* Team-ready confirmation for safe exports */}
            {showTeamReadyInfo && (
                <Alert
                    message="Team Export Ready"
                    description={
                        includeWorkspace 
                            ? "This configuration can be safely committed to Git. Team members will import the file and immediately connect to your Git repository. They'll only need to add their own authentication credentials and environment variable values."
                            : "This configuration can be safely committed to Git. Team members will need to provide their own environment variable values."
                    }
                    type="info"
                    showIcon
                    icon={<InfoCircleOutlined />}
                />
            )}
        </>
    );
};

export default ExportWarnings;