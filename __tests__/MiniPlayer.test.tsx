import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { MiniPlayer } from '../src/components/MiniPlayer';
import { initialPlayerState } from '../src/services/narrationPlayer';

const mockLightColors = require('../src/theme/tokens').lightColors;

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
  }),
}));

jest.mock('../src/theme/ThemeProvider', () => ({
  useAppTheme: () => ({
    colors: mockLightColors,
    isDark: false,
    preference: 'light',
  }),
}));

const mockPause = jest.fn();
const mockResume = jest.fn();
const mockStop = jest.fn();
const mockSkipTime = jest.fn();

let mockPlayerState = { ...initialPlayerState };

jest.mock('../src/state/NarrationPlayerProvider', () => ({
  useNarrationPlayer: () => ({
    get playerState() {
      return mockPlayerState;
    },
    get isPlaying() {
      return mockPlayerState.state === 'playing';
    },
    get isBuffering() {
      return mockPlayerState.state === 'buffering';
    },
    pause: mockPause,
    resume: mockResume,
    stop: mockStop,
    skipTime: mockSkipTime,
  }),
}));

describe('MiniPlayer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlayerState = { ...initialPlayerState };
  });

  it('renders nothing when playback state is idle', () => {
    mockPlayerState = { ...initialPlayerState, state: 'idle' };
    let renderer: TestRenderer.ReactTestRenderer | null = null;
    act(() => {
      renderer = TestRenderer.create(<MiniPlayer />);
    });
    expect(renderer!.toJSON()).toBeNull();
  });

  it('renders title, chapter, and progress when playing', () => {
    mockPlayerState = {
      ...initialPlayerState,
      state: 'playing',
      bookId: 'book-1',
      chapterId: 'chap-1',
      bookTitle: 'The Lost Hero',
      chapterTitle: 'Chapter 1',
      sentenceIndex: 3,
      totalSentences: 10,
    };

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    act(() => {
      renderer = TestRenderer.create(<MiniPlayer />);
    });
    const json = JSON.stringify(renderer!.toJSON());
    expect(json).toContain('Chapter 1');
    expect(json).toContain('Sentence 4 of 10');
  });

  it('navigates to ReaderScreen on tap', () => {
    mockPlayerState = {
      ...initialPlayerState,
      state: 'playing',
      bookId: 'book-42',
      chapterId: 'chap-9',
      bookTitle: 'Test Book',
      sentenceIndex: 2,
    };

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    act(() => {
      renderer = TestRenderer.create(<MiniPlayer />);
    });
    const pressables = renderer!.root.findAll(
      el => el.props.accessibilityRole === 'button' && el.props.onPress,
    );
    // First pressable is the reader open area
    act(() => {
      pressables[0].props.onPress();
    });

    expect(mockNavigate).toHaveBeenCalledWith('Reader', {
      bookId: 'book-42',
      initialChapterId: 'chap-9',
      initialSentenceIndex: 2,
    });
  });

  it('toggles pause and skip controls', () => {
    mockPlayerState = {
      ...initialPlayerState,
      state: 'playing',
      bookId: 'book-1',
      sentenceIndex: 1,
    };

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    act(() => {
      renderer = TestRenderer.create(<MiniPlayer />);
    });
    const pauseBtn = renderer!.root.findByProps({
      accessibilityLabel: 'Pause narration',
    });

    act(() => {
      pauseBtn.props.onPress();
    });
    expect(mockPause).toHaveBeenCalled();

    const rewBtn = renderer!.root.findByProps({
      accessibilityLabel: 'Rewind 15 seconds',
    });
    act(() => {
      rewBtn.props.onPress();
    });
    expect(mockSkipTime).toHaveBeenCalledWith(-15000);
  });
});
