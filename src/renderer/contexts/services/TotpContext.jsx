import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import totpUsageTracker from '../../services/TotpUsageTracker';
import { createLogger } from '../../utils/error-handling/logger';

const log = createLogger('TotpContext');

export const TotpContext = createContext();

export const useTotpState = () => {
    const context = useContext(TotpContext);
    if (!context) {
        throw new Error('useTotpState must be used within TotpProvider');
    }
    return context;
};

export const TotpProvider = ({ children }) => {
    // Track TOTP cooldowns for each source
    const [cooldowns, setCooldowns] = useState({});
    // Track if any testing is in progress with TOTP
    const [testingWithTotp, setTestingWithTotp] = useState(false);
    // Track which sources are currently being tested
    const testingSourcesRef = useRef(new Set());
    // Track if we have active cooldowns to monitor
    const [hasActiveCooldowns, setHasActiveCooldowns] = useState(false);
    // Use ref to track the interval to prevent multiple intervals
    const monitoringIntervalRef = useRef(null);
    
    // Check if a request would use TOTP
    const checkIfRequestUsesTotp = useCallback((url, method, requestOptions) => {
        // Check if [[TOTP_CODE]] is present anywhere
        const checkString = (str) => str && str.includes('[[TOTP_CODE]]');
        
        // Check URL
        if (checkString(url)) return true;
        
        // Check headers
        if (requestOptions?.headers) {
            if (Array.isArray(requestOptions.headers)) {
                for (const header of requestOptions.headers) {
                    if (checkString(header.key) || checkString(header.value)) return true;
                }
            } else if (typeof requestOptions.headers === 'object') {
                for (const [key, value] of Object.entries(requestOptions.headers)) {
                    if (checkString(key) || checkString(value)) return true;
                }
            }
        }
        
        // Check query params
        if (requestOptions?.queryParams) {
            if (Array.isArray(requestOptions.queryParams)) {
                for (const param of requestOptions.queryParams) {
                    if (checkString(param.key) || checkString(param.value)) return true;
                }
            } else if (typeof requestOptions.queryParams === 'object') {
                for (const [key, value] of Object.entries(requestOptions.queryParams)) {
                    if (checkString(key) || checkString(value)) return true;
                }
            }
        }
        
        // Check body
        return !!(requestOptions?.body && checkString(requestOptions.body));
        

    }, []);
    
    // Check if a source can use TOTP (not in cooldown and not being tested)
    const canUseTotpForSource = useCallback((sourceId) => {
        if (!sourceId) return true;
        
        // Check if in cooldown
        const cooldownStatus = totpUsageTracker.checkCooldown(sourceId);
        // Commenting out spammy debug log
        // log.debug('[TotpContext] canUseTotpForSource check:', {
        //     sourceId,
        //     cooldownStatus,
        //     testingSources: Array.from(testingSourcesRef.current)
        // });
        
        if (cooldownStatus.inCooldown) {
            return false;
        }
        
        // Check if currently being tested
        return !testingSourcesRef.current.has(sourceId);
        

    }, []);
    
    // Get cooldown remaining seconds for a source
    const getCooldownSecondsForSource = useCallback((sourceId) => {
        if (!sourceId) return 0;
        return cooldowns[sourceId] || 0;
    }, [cooldowns]);
    
    // Start testing with TOTP for a source
    const startTestingWithTotpForSource = useCallback((sourceId) => {
        if (sourceId) {
            testingSourcesRef.current.add(sourceId);
            setTestingWithTotp(true);
            log.debug('Started testing with TOTP for source:', sourceId);
        }
    }, []);
    
    // End testing with TOTP for a source
    const endTestingWithTotpForSource = useCallback((sourceId) => {
        if (sourceId) {
            testingSourcesRef.current.delete(sourceId);
            if (testingSourcesRef.current.size === 0) {
                setTestingWithTotp(false);
            }
            log.debug('Ended testing with TOTP for source:', sourceId);
        }
    }, []);
    
    // Record TOTP usage for a source
    const recordTotpUsageForSource = useCallback((sourceId, secret, code) => {
        if (!sourceId || !code) return;
        
        log.debug('[TotpContext] Recording TOTP usage:', {
            sourceId,
            code: code.substring(0, 3) + '***'
        });
        
        totpUsageTracker.recordUsage(sourceId, secret, code);
        
        // Update cooldown immediately
        const cooldownStatus = totpUsageTracker.checkCooldown(sourceId);
        setCooldowns(prev => ({
            ...prev,
            [sourceId]: cooldownStatus.remainingSeconds
        }));
        
        // Mark that we have active cooldowns
        setHasActiveCooldowns(true);
        
        log.debug('[TotpContext] TOTP usage recorded, cooldown status:', {
            sourceId,
            cooldownStatus,
            hasActiveCooldowns: true
        });
    }, []);
    
    // Monitor all tracked sources for cooldown updates
    useEffect(() => {
        const checkAllCooldowns = () => {
            const newCooldowns = {};
            let stillHasActiveCooldowns = false;
            
            // Get all sources that might have cooldowns
            const allSourceIds = new Set();
            
            // Add sources from current cooldowns state
            Object.keys(cooldowns).forEach(sourceId => allSourceIds.add(sourceId));
            
            // Add sources currently being tested
            testingSourcesRef.current.forEach(sourceId => allSourceIds.add(sourceId));
            
            // Check the tracker directly for any sources with active cooldowns
            // This ensures we don't miss newly added cooldowns
            totpUsageTracker.getAllActiveCooldowns().forEach(sourceId => allSourceIds.add(sourceId));
            
            // Check each source
            for (const sourceId of allSourceIds) {
                const status = totpUsageTracker.checkCooldown(sourceId);
                if (status.inCooldown) {
                    newCooldowns[sourceId] = status.remainingSeconds;
                    stillHasActiveCooldowns = true;
                }
            }
            
            setCooldowns(newCooldowns);
            
            return stillHasActiveCooldowns;
        };
        
        const startMonitoring = () => {
            // Prevent multiple intervals
            if (monitoringIntervalRef.current) return;
            
            // Initial check
            const hasActive = checkAllCooldowns();
            
            if (hasActive) {
                monitoringIntervalRef.current = setInterval(() => {
                    const stillActive = checkAllCooldowns();
                    if (!stillActive && monitoringIntervalRef.current) {
                        clearInterval(monitoringIntervalRef.current);
                        monitoringIntervalRef.current = null;
                        setHasActiveCooldowns(false);
                    }
                }, 1000);
            } else {
                setHasActiveCooldowns(false);
            }
        };
        
        if (hasActiveCooldowns) {
            startMonitoring();
        }
        
        // Cleanup on unmount
        return () => {
            if (monitoringIntervalRef.current) {
                clearInterval(monitoringIntervalRef.current);
                monitoringIntervalRef.current = null;
            }
        };
    }, [hasActiveCooldowns]); // Only depend on hasActiveCooldowns to avoid infinite loop
    
    // Add a source to track (when a component mounts with a TOTP-enabled source)
    const trackTotpSource = useCallback((sourceId) => {
        if (!sourceId) return;
        
        const status = totpUsageTracker.checkCooldown(sourceId);
        if (status.inCooldown) {
            setCooldowns(prev => ({
                ...prev,
                [sourceId]: status.remainingSeconds
            }));
            // Mark that we have active cooldowns to trigger monitoring
            setHasActiveCooldowns(true);
        }
    }, []);
    
    // Remove a source from tracking (when a component unmounts)
    const untrackTotpSource = useCallback((sourceId) => {
        if (!sourceId) return;
        
        setCooldowns(prev => {
            const newCooldowns = { ...prev };
            delete newCooldowns[sourceId];
            return newCooldowns;
        });
        
        testingSourcesRef.current.delete(sourceId);
    }, []);
    
    const value = {
        // State
        testingWithTotp,
        
        // Methods
        checkIfRequestUsesTotp,
        canUseTotpForSource,
        getCooldownSecondsForSource,
        startTestingWithTotpForSource,
        endTestingWithTotpForSource,
        recordTotpUsageForSource,
        trackTotpSource,
        untrackTotpSource,
        
        // Legacy method names for backward compatibility during migration
        canUseTotpSecret: canUseTotpForSource,
        getCooldownSeconds: getCooldownSecondsForSource,
        startTestingWithTotp: startTestingWithTotpForSource,
        endTestingWithTotp: endTestingWithTotpForSource,
        recordTotpUsage: recordTotpUsageForSource,
        trackTotpSecret: trackTotpSource,
        untrackTotpSecret: untrackTotpSource
    };
    
    return (
        <TotpContext.Provider value={value}>
            {children}
        </TotpContext.Provider>
    );
};