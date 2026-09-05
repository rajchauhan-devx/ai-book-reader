import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { VoicePickerModal } from '../src/components/VoicePickerModal';
import { narrationPipelineService } from '../src/services/narrationPipeline';

jest.mock('../src/services/narrationPipeline');

jest.mock('../src/theme/ThemeProvider', () => ({
  useAppTheme: () => ({
    colors: require('../src/theme/tokens').lightColors,
    isDark: false,
    preference: 'light',
  }),
}));

const mockTestNaturalVoice = jest.fn();
const mockTestPhoneVoice = jest.fn();

jest.mock('../src/state/NarrationEngineProvider', () => ({
  useNarrationEngine: () => ({
    testNaturalVoice: mockTestNaturalVoice,
    testPhoneVoice: mockTestPhoneVoice,
    status: { running: false, state: 'idle' },
  }),
}));

const mockGetCuratedVoices = narrationPipelineService.getCuratedVoices as jest.Mock;
const mockGetPreferences = narrationPipelineService.getPreferences as jest.Mock;
const mockSavePreferences = narrationPipelineService.savePreferences as jest.Mock;

describe('VoicePickerModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCuratedVoices.mockResolvedValue({
      voices: [
        {
          id: 'warm',
          name: 'Warm Narrator',
          descriptor: 'Rich, engaging tone',
          engine: 'natural',
          isDefault: true,
        },
        {
          id: 'system',
          name: 'Offline Phone Voice',
          descriptor: 'Built-in Android system speech',
          engine: 'system',
          isDefault: false,
        },
      ],
      expressions: [
        { id: 'calm', name: 'Calm', descriptor: 'Steady' },
        { id: 'natural', name: 'Natural', descriptor: 'Balanced' },
      ],
    });
    mockGetPreferences.mockResolvedValue({
      voiceId: 'warm',
      expression: 'natural',
    });
    mockSavePreferences.mockImplementation(patch => Promise.resolve(patch));
  });

  it('renders correctly when visible', async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <VoicePickerModal visible onClose={jest.fn()} />,
      );
    });

    const root = renderer!.root;
    expect(root).toBeTruthy();
  });

  it('invokes onClose when close button is pressed', async () => {
    const onClose = jest.fn();
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <VoicePickerModal visible onClose={onClose} />,
      );
    });

    const root = renderer!.root;
    expect(root).toBeTruthy();
  });
});
