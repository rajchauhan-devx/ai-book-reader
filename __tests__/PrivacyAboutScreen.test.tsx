import React from 'react';
import { Alert } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { PrivacyAboutScreen } from '../src/screens/PrivacyAboutScreen';
import { storageBackupService } from '../src/services/storageBackup';

const mockReset = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    reset: mockReset,
  }),
}));

jest.mock('../src/theme/ThemeProvider', () => ({
  useAppTheme: () => ({
    colors: require('../src/theme/tokens').lightColors,
    isDark: false,
    preference: 'system',
  }),
}));

jest.mock('../src/components/Screen', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../src/services/storageBackup', () => ({
  storageBackupService: {
    exportDiagnostics: jest.fn().mockResolvedValue('content://diagnostics.txt'),
    deleteAllAppData: jest.fn().mockResolvedValue(true),
  },
}));

describe('PrivacyAboutScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders offline manifesto, diagnostics card, licenses, and danger zone', () => {
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<PrivacyAboutScreen />);
    });

    const textNodes = renderer!.root.findAll(node => (node.type as any) === 'Text').map(node => node.props.children);
    const flattenedText = textNodes.flat(Infinity).join(' ');

    expect(flattenedText).toContain('Offline Manifesto');
    expect(flattenedText).toContain('100% Local Processing');
    expect(flattenedText).toContain('Zero Telemetry & Tracking');
    expect(flattenedText).toContain('Local On-Device Speech Synthesis');
    expect(flattenedText).toContain('Diagnostics Export');
    expect(flattenedText).toContain('Chatterbox-Nano ONNX');
    expect(flattenedText).toContain('Danger Zone');
  });

  it('triggers diagnostics export on button press', async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<PrivacyAboutScreen />);
    });

    const exportBtn = renderer!.root.findByProps({
      label: 'Export Diagnostics',
    });

    await act(async () => {
      exportBtn.props.onPress();
    });

    expect(storageBackupService.exportDiagnostics).toHaveBeenCalledTimes(1);
  });

  it('requires typing DELETE to confirm total app data wipe', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<PrivacyAboutScreen />);
    });

    // Find and open Danger Zone modal
    const openModalBtn = renderer!.root.findByProps({
      label: 'Delete All App Data...',
    });

    act(() => {
      openModalBtn.props.onPress();
    });

    // Find text input and delete button
    const deleteInput = renderer!.root.findByProps({
      placeholder: 'DELETE',
    });
    const confirmBtn = renderer!.root.findByProps({
      label: 'Delete Everything',
    });

    // Initially disabled
    expect(confirmBtn.props.disabled).toBe(true);

    // Type something other than DELETE
    act(() => {
      deleteInput.props.onChangeText('NO');
    });
    expect(confirmBtn.props.disabled).toBe(true);

    // Type DELETE
    act(() => {
      deleteInput.props.onChangeText('DELETE');
    });
    expect(confirmBtn.props.disabled).toBe(false);

    // Press delete
    await act(async () => {
      confirmBtn.props.onPress();
    });

    expect(storageBackupService.deleteAllAppData).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith(
      'Data Deleted',
      expect.stringContaining('permanently wiped'),
      expect.any(Array),
    );
  });
});
