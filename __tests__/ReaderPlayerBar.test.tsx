import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { ReaderPlayerBar } from '../src/components/ReaderPlayerBar';
import type { PlaybackState } from '../src/services/narrationPlayer';

jest.mock('../src/theme/ThemeProvider', () => ({
  useAppTheme: () => ({
    colors: require('../src/theme/tokens').lightColors,
    isDark: false,
    preference: 'light',
  }),
}));

const mockPlay = jest.fn();
const mockPause = jest.fn();
const mockResume = jest.fn();
const mockNextSentence = jest.fn();
const mockPrevSentence = jest.fn();
const mockSkipTime = jest.fn();
const mockSetSpeed = jest.fn();
const mockSetSleepTimer = jest.fn();

const mockDefaultPlayerState = {
  state: 'idle' as PlaybackState,
  bookId: null as string | null,
  chapterId: null as string | null,
  bookTitle: null as string | null,
  chapterTitle: null as string | null,
  sentenceIndex: 0,
  totalSentences: 0,
  positionMs: 0,
  durationMs: 0,
  speed: 1.0,
  sleepTimerSecondsRemaining: 0,
  isSleepTimerActive: false,
  sleepTimerEndOfChapter: false,
};

let mockCurrentTestState = { ...mockDefaultPlayerState };

jest.mock('../src/state/NarrationPlayerProvider', () => ({
  useNarrationPlayer: () => ({
    get playerState() {
      return mockCurrentTestState;
    },
    get isPlaying() {
      return mockCurrentTestState.state === 'playing';
    },
    get isBuffering() {
      return mockCurrentTestState.state === 'buffering';
    },
    play: mockPlay,
    pause: mockPause,
    resume: mockResume,
    nextSentence: mockNextSentence,
    prevSentence: mockPrevSentence,
    skipTime: mockSkipTime,
    setSpeed: mockSetSpeed,
    setSleepTimer: mockSetSleepTimer,
  }),
}));

describe('ReaderPlayerBar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentTestState = { ...mockDefaultPlayerState };
  });

  it('renders sentence progress, controls, and speed badge', () => {
    mockCurrentTestState = {
      ...mockDefaultPlayerState,
      state: 'idle',
      speed: 1.25,
    };

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <ReaderPlayerBar
          bookId="book-1"
          chapterId="chap-1"
          chapterTitle="Chapter 1"
          bookTitle="The Lost Hero"
          activeSentenceIndex={2}
          totalSentences={20}
          onOpenVoicePicker={jest.fn()}
        />,
      );
    });

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain('Sentence 3 of 20');
    expect(json).toContain('1.25');
  });

  it('triggers play when play button is pressed', async () => {
    mockCurrentTestState = {
      ...mockDefaultPlayerState,
      state: 'idle',
    };

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <ReaderPlayerBar
          bookId="book-1"
          chapterId="chap-1"
          activeSentenceIndex={4}
          totalSentences={20}
          onOpenVoicePicker={jest.fn()}
        />,
      );
    });

    const playBtn = renderer.root.findByProps({
      accessibilityLabel: 'Play narration',
    });

    await act(async () => {
      await playBtn.props.onPress();
    });

    expect(mockPlay).toHaveBeenCalledWith('book-1', 'chap-1', 4);
  });

  it('navigates next and previous sentence', () => {
    mockCurrentTestState = {
      ...mockDefaultPlayerState,
      state: 'playing',
      bookId: 'book-1',
      chapterId: 'chap-1',
      sentenceIndex: 5,
      totalSentences: 20,
    };

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <ReaderPlayerBar
          bookId="book-1"
          chapterId="chap-1"
          activeSentenceIndex={5}
          totalSentences={20}
          onOpenVoicePicker={jest.fn()}
        />,
      );
    });

    const nextBtn = renderer.root.findByProps({
      accessibilityLabel: 'Next sentence',
    });
    act(() => {
      nextBtn.props.onPress();
    });
    expect(mockNextSentence).toHaveBeenCalled();

    const prevBtn = renderer.root.findByProps({
      accessibilityLabel: 'Previous sentence',
    });
    act(() => {
      prevBtn.props.onPress();
    });
    expect(mockPrevSentence).toHaveBeenCalled();
  });

  it('opens speed sheet and allows selecting a new speed', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <ReaderPlayerBar
          bookId="book-1"
          chapterId="chap-1"
          activeSentenceIndex={0}
          totalSentences={10}
          onOpenVoicePicker={jest.fn()}
        />,
      );
    });

    const speedBtn = renderer.root.findByProps({
      accessibilityLabel: 'Playback speed 1x. Tap to change.',
    });
    act(() => {
      speedBtn.props.onPress();
    });

    const speed15Btn = renderer.root.findByProps({
      accessibilityLabel: '1.5x speed',
    });
    await act(async () => {
      await speed15Btn.props.onPress();
    });

    expect(mockSetSpeed).toHaveBeenCalledWith(1.5);
  });
});
