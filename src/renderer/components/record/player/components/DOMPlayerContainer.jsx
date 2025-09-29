/**
 * DOMPlayerContainer Component
 *
 * Container for the rrweb DOM playback player
 * Handles styling and positioning for the player
 *
 * @param {Object} props - Component props
 * @param {React.RefObject} props.playerContainerRef - Ref for the player container
 * @param {Object} props.token - Ant Design theme token
 * @param {string} props.viewMode - Current view mode
 */

import React from 'react';

const DOMPlayerContainer = ({ playerContainerRef, token, viewMode }) => {
    if (viewMode !== 'dom') return null;

    return (
        <div
            ref={playerContainerRef}
            style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                background: token.colorBgLayout,
                borderRadius: '6px',
                border: `1px solid ${token.colorBorderSecondary}`,
                overflow: 'hidden',
                position: 'absolute',
                top: 0,
                left: 0
            }}
        />
    );
};

export default DOMPlayerContainer;