import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { ModelSetupScreen } from '../src/screens/ModelSetupScreen';

const mockStartDownload = jest.fn<Promise<void>, [boolean]>(() =>
  Promise.resolve(),
);

let mockStatus = {
  state: 'checking',
  progress: 0,
  downloadedBytes: 0,
  totalBytes: 573_374_780,
  message: 'Waiting for unmetered Wi-Fi',
};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn() }),
}));

jest.mock('../src/theme/ThemeProvider', () => ({
  useAppTheme: () => ({
    colors: require('../src/theme/tokens').lightColors,
  }),
}));

jest.mock('../src/components/Screen', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../src/components/AppButton', () => ({
  AppButton: (props: Record<string, unknown>) =>
    require('react').createElement('AppButton', props),
}));

jest.mock('../src/components/VoicePickerModal', () => ({
  VoicePickerModal: () => null,
}));

jest.mock('../src/state/ModelDownloadProvider', () => ({
  useModelDownload: () => ({
    status: mockStatus,
    startDownload: mockStartDownload,
    pauseDownload: jest.fn(),
  }),
}));

jest.mock('../src/state/NarrationEngineProvider', () => ({
  useNarrationEngine: () => ({
    status: { state: 'idle', progress: 0, message: '' },
    result: null,
    error: null,
    testNaturalVoice: jest.fn(),
    testPhoneVoice: jest.fn(),
    stop: jest.fn(),
  }),
}));

describe('ModelSetupScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStatus = {
      state: 'checking',
      progress: 0,
      downloadedBytes: 0,
      totalBytes: 573_374_780,
      message: 'Waiting for unmetered Wi-Fi',
    };
  });

  test('can switch off Wi-Fi-only mode while waiting and reschedules immediately', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<ModelSetupScreen />);
    });

    const wifiSwitch = renderer.root.findByProps({
      accessibilityRole: 'switch',
    });
    expect(wifiSwitch.props.disabled).toBe(false);
    expect(wifiSwitch.props.accessibilityState).toEqual({ checked: true });

    await act(async () => {
      await wifiSwitch.props.onPress();
    });

    expect(mockStartDownload).toHaveBeenCalledWith(false);
    expect(
      renderer.root.findByProps({ accessibilityRole: 'switch' }).props
        .accessibilityState,
    ).toEqual({ checked: false });
  });

  test('offers a retry action after a download failure', async () => {
    mockStatus = {
      ...mockStatus,
      state: 'failed',
      message: 'Voice download failed (503). Please retry.',
    };

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<ModelSetupScreen />);
    });

    expect(renderer.root.findByProps({ label: 'Retry download' })).toBeTruthy();
  });
});
