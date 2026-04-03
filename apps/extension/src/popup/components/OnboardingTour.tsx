import {
  ApiTwoTone,
  ControlTwoTone,
  EditTwoTone,
  EyeTwoTone,
  LayoutTwoTone,
  LikeTwoTone,
  SmileTwoTone,
  StarTwoTone,
  ThunderboltTwoTone,
  VideoCameraTwoTone,
} from '@ant-design/icons';
import { useKeyboardNav } from '@context/KeyboardNavContext';
import { Space, Tour, type TourProps, Typography } from 'antd';
import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getBrowserAPI } from '@/types/browser';

const logoUrl = getBrowserAPI().runtime.getURL('images/icon48.png');

const { Text } = Typography;

const STORAGE_KEY = 'onboardingCompleted';
const TOTAL_STEPS = 7;

interface OnboardingTourProps {
  open: boolean | null;
  onClose: () => void;
}

function getTarget(selector: string): HTMLElement | null {
  return document.querySelector(selector);
}

const Kbd: React.FC<{ children: string; small?: boolean }> = ({ children, small }) => (
  <span
    className="kbd-key"
    style={{
      fontSize: small ? 9 : 11,
      verticalAlign: 'middle',
      ...(small ? { height: 16, minWidth: 16, padding: '0 3px' } : {}),
    }}
  >
    {children}
  </span>
);

const StepDescription: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 13, lineHeight: 1.6, marginTop: 4 }}>{children}</div>
);

const OnboardingTour: React.FC<OnboardingTourProps> = ({ open, onClose }) => {
  const { setIsTourOpen } = useKeyboardNav();
  const [isVisible, setIsVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  // On mount, check if onboarding should auto-show (first time)
  useEffect(() => {
    if (open !== null) return;
    const browserAPI = getBrowserAPI();
    browserAPI.storage.local.get([STORAGE_KEY], (result: Record<string, unknown>) => {
      if (!result[STORAGE_KEY]) {
        // Set tour open immediately to hide ConnectionInfo, then show tour after brief layout settle
        setIsTourOpen(true);
        setTimeout(() => setIsVisible(true), 100);
      }
    });
  }, [open, setIsTourOpen]);

  // Controlled mode: open prop overrides
  useEffect(() => {
    if (open !== null) {
      setIsVisible(open);
      if (open) setCurrentStep(0);
    }
  }, [open]);

  // Sync tour visibility to keyboard nav context
  useEffect(() => {
    setIsTourOpen(isVisible);
  }, [isVisible, setIsTourOpen]);

  const handleClose = useCallback(() => {
    setIsVisible(false);
    setCurrentStep(0);
    const browserAPI = getBrowserAPI();
    browserAPI.storage.local.set({ [STORAGE_KEY]: true });
    onClose();
  }, [onClose]);

  const indicatorsRender: TourProps['indicatorsRender'] = useCallback(
    (current: number) => (
      <Text type="secondary" style={{ fontSize: 11 }}>
        Step {current + 1} of {TOTAL_STEPS}
      </Text>
    ),
    [],
  );

  const btnRow: React.CSSProperties = useMemo(() => ({ display: 'inline-flex', alignItems: 'center', gap: 4 }), []);

  const sharedStepProps = useMemo(
    () => ({
      prevButtonProps: {
        children: (
          <span style={btnRow}>
            <Kbd small>{'\u2190'}</Kbd>
            <span>Previous</span>
          </span>
        ),
      },
      nextButtonProps: {
        children: (
          <span style={btnRow}>
            <span>Next</span>
            <Kbd small>{'\u2192'}</Kbd>
          </span>
        ),
      },
      closable: {
        closeIcon: (
          <span className="kbd-key" style={{ fontSize: 13, height: 24, minWidth: 32, padding: '0 6px' }}>
            Esc
          </span>
        ),
      },
    }),
    [btnRow],
  );

  const lastStepProps = useMemo(
    () => ({
      ...sharedStepProps,
      nextButtonProps: {
        children: (
          <span style={btnRow}>
            <span>Finish</span>
            <Kbd small>Esc</Kbd>
          </span>
        ),
      },
    }),
    [sharedStepProps, btnRow],
  );

  const steps: TourProps['steps'] = useMemo(
    () => [
      {
        title: (
          <Space size={8}>
            <img src={logoUrl} alt="Open Headers" style={{ width: 18, height: 18 }} />
            <span>Welcome to Open Headers</span>
          </Space>
        ),
        styles: { section: { width: 380 } },
        description: (
          <StepDescription>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Intercept and modify HTTP traffic in real time.
            </Text>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: 'rgba(22, 119, 255, 0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <EditTwoTone style={{ fontSize: 16 }} />
                </div>
                <div>
                  <Text strong style={{ fontSize: 13 }}>
                    Modify
                  </Text>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Headers, cookies, auth tokens, CORS, payloads
                    </Text>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: 'rgba(114, 46, 209, 0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <ApiTwoTone twoToneColor="#722ed1" style={{ fontSize: 16 }} />
                </div>
                <div>
                  <Text strong style={{ fontSize: 13 }}>
                    Route
                  </Text>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Redirect requests, block trackers, rewrite URLs
                    </Text>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: 'rgba(82, 196, 26, 0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <EyeTwoTone twoToneColor="#52c41a" style={{ fontSize: 16 }} />
                </div>
                <div>
                  <Text strong style={{ fontSize: 13 }}>
                    Debug
                  </Text>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Inspect live requests, inject scripts, record sessions
                    </Text>
                  </div>
                </div>
              </div>
            </div>
          </StepDescription>
        ),
        target: () => getTarget('.header')!,
        placement: 'bottom' as const,
        ...sharedStepProps,
      },
      {
        title: (
          <Space size={8}>
            <ApiTwoTone />
            <span>Connection Status</span>
          </Space>
        ),
        description: (
          <StepDescription>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Shows whether the desktop app is connected.
            </Text>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#52c41a' }}
                />
                <Text style={{ fontSize: 12 }}>
                  <Text strong>Connected</Text> — live sync, create & edit rules
                </Text>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#ff4d4f' }}
                />
                <Text style={{ fontSize: 12 }}>
                  <Text strong>Disconnected</Text> — cached rules still active
                </Text>
              </div>
            </div>
          </StepDescription>
        ),
        target: () => getTarget('.connection-status')!,
        placement: 'bottom' as const,
        ...sharedStepProps,
      },
      {
        title: (
          <Space size={8}>
            <LayoutTwoTone />
            <span>Switch Between Tabs</span>
          </Space>
        ),
        description: (
          <StepDescription>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Press a number key to switch instantly.
            </Text>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
              <Space size={6}>
                <Kbd>1</Kbd>
                <Text style={{ fontSize: 12 }}>
                  <Text strong>This Page</Text> — rules matching the current tab
                </Text>
              </Space>
              <Space size={6}>
                <Kbd>2</Kbd>
                <Text style={{ fontSize: 12 }}>
                  <Text strong>All Rules</Text> — every rule you've created
                </Text>
              </Space>
              <Space size={6}>
                <Kbd>3</Kbd>
                <Text style={{ fontSize: 12 }}>
                  <Text strong>Tags</Text> — organize and pause groups
                </Text>
              </Space>
            </div>
          </StepDescription>
        ),
        target: () => getTarget('.header-rules-tabs .ant-tabs-nav')!,
        placement: 'bottom' as const,
        ...sharedStepProps,
      },
      {
        title: (
          <Space size={8}>
            <ControlTwoTone />
            <span>Browse & Navigate Rules</span>
          </Space>
        ),
        description: (
          <StepDescription>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Navigate rows with keyboard shortcuts
            </Text>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr auto 1fr auto 1fr',
                columnGap: 8,
                rowGap: 2,
                marginTop: 6,
                alignItems: 'center',
              }}
            >
              <Space size={2}>
                <Kbd>{'\u2191'}</Kbd>
                <Kbd>{'\u2193'}</Kbd>
              </Space>
              <Text style={{ fontSize: 11 }}>Move</Text>
              <Space size={2}>
                <Kbd>{'\u2192'}</Kbd>
                <Kbd>{'\u2190'}</Kbd>
              </Space>
              <Text style={{ fontSize: 11 }}>Expand</Text>
              <Kbd>Space</Kbd>
              <Text style={{ fontSize: 11 }}>Toggle</Text>
              <Kbd>e</Kbd>
              <Text style={{ fontSize: 11 }}>Edit</Text>
              <Kbd>c</Kbd>
              <Text style={{ fontSize: 11 }}>Copy</Text>
              <Space size={2}>
                <Kbd>d</Kbd>
                <Kbd>d</Kbd>
              </Space>
              <Text style={{ fontSize: 11 }}>Delete</Text>
            </div>
          </StepDescription>
        ),
        target: () => getTarget('.entries-list')!,
        placement: 'top' as const,
        scrollIntoViewOptions: false,
        ...sharedStepProps,
      },
      {
        title: (
          <Space size={8}>
            <VideoCameraTwoTone />
            <span>Record Browser Workflows</span>
          </Space>
        ),
        description: (
          <StepDescription>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Capture browser activity for debugging or demos.
            </Text>
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 12 }}>Press</Text>
              <Kbd>r</Kbd>
              <Text style={{ fontSize: 12 }}>to start/stop recording from the keyboard</Text>
            </div>
          </StepDescription>
        ),
        target: () => getTarget('.recording-button')!,
        placement: 'top' as const,
        ...sharedStepProps,
      },
      {
        title: (
          <Space size={8}>
            <ThunderboltTwoTone />
            <span>All Keyboard Shortcuts</span>
          </Space>
        ),
        description: (
          <StepDescription>
            <Text type="secondary" style={{ fontSize: 12 }}>
              The popup is fully keyboard-navigable.
            </Text>
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 12 }}>Press</Text>
              <Kbd>?</Kbd>
              <Text style={{ fontSize: 12 }}>at any time to see every shortcut</Text>
            </div>
          </StepDescription>
        ),
        target: () => getTarget('.footer .kbd-key')!,
        placement: 'top' as const,
        ...sharedStepProps,
      },
      {
        title: (
          <Space size={8}>
            <SmileTwoTone />
            <span>Help Us Grow</span>
          </Space>
        ),
        description: (
          <StepDescription>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Help us grow and reach more developers.
            </Text>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <StarTwoTone style={{ fontSize: 14 }} />
                <button
                  type="button"
                  onClick={() => {
                    void chrome.tabs.create({ url: 'https://github.com/OpenHeaders/open-headers-app' });
                  }}
                  style={{
                    cursor: 'pointer',
                    fontSize: 13,
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: 'var(--ant-color-link)',
                  }}
                >
                  Give us a star on GitHub
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <LikeTwoTone style={{ fontSize: 14 }} />
                <Text style={{ fontSize: 13 }}>Recommend us to your friends & colleagues</Text>
              </div>
            </div>
          </StepDescription>
        ),
        target: () => getTarget('.github-star-button')!,
        placement: 'top' as const,
        ...lastStepProps,
      },
    ],
    [sharedStepProps, lastStepProps],
  );

  return (
    <Tour
      open={isVisible}
      current={currentStep}
      onChange={setCurrentStep}
      onClose={handleClose}
      steps={steps}
      indicatorsRender={indicatorsRender}
      disabledInteraction
      mask={{ color: 'rgba(0, 0, 0, 0.6)' }}
      scrollIntoViewOptions={false}
      getPopupContainer={() => document.getElementById('root') || document.body}
      styles={{
        section: { width: 360, minHeight: 160 },
      }}
      zIndex={3000}
    />
  );
};

export default OnboardingTour;
