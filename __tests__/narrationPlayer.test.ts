import {
  narrationPlayerService,
  type PlayerState,
} from '../src/services/narrationPlayer';

describe('narrationPlayerService', () => {
  beforeEach(async () => {
    await narrationPlayerService.stop();
  });

  it('provides initial default idle state', async () => {
    const state = await narrationPlayerService.getPlayerState();
    expect(state.state).toBe('idle');
    expect(state.bookId).toBeNull();
    expect(state.sentenceIndex).toBe(0);
    expect(state.speed).toBe(1.0);
    expect(state.isSleepTimerActive).toBe(false);
  });

  it('updates state on play and emits to subscribers', async () => {
    const states: PlayerState[] = [];
    const unsub = narrationPlayerService.subscribe(s => states.push(s));

    await narrationPlayerService.play('book-123', 'chap-456', 5, 'warm', 'natural', 1.25);

    expect(states.length).toBeGreaterThan(0);
    const lastState = states[states.length - 1];
    expect(lastState.state).toBe('playing');
    expect(lastState.bookId).toBe('book-123');
    expect(lastState.chapterId).toBe('chap-456');
    expect(lastState.sentenceIndex).toBe(5);
    expect(lastState.speed).toBe(1.25);

    unsub();
  });

  it('pauses, resumes, and stops playback cleanly', async () => {
    await narrationPlayerService.play('book-1', 'chap-1', 2);
    let state = await narrationPlayerService.getPlayerState();
    expect(state.state).toBe('playing');

    await narrationPlayerService.pause();
    state = await narrationPlayerService.getPlayerState();
    expect(state.state).toBe('paused');

    await narrationPlayerService.resume();
    state = await narrationPlayerService.getPlayerState();
    expect(state.state).toBe('playing');

    await narrationPlayerService.stop();
    state = await narrationPlayerService.getPlayerState();
    expect(state.state).toBe('idle');
  });

  it('navigates sentences and clamps seek', async () => {
    await narrationPlayerService.play('book-1', 'chap-1', 0);
    await narrationPlayerService.seekSentence(4);
    let state = await narrationPlayerService.getPlayerState();
    expect(state.sentenceIndex).toBe(4);

    await narrationPlayerService.seekSentence(-5);
    state = await narrationPlayerService.getPlayerState();
    expect(state.sentenceIndex).toBe(0);
  });

  it('clamps variable playback speed within 0.75x and 2.0x', async () => {
    await narrationPlayerService.setSpeed(1.5);
    let state = await narrationPlayerService.getPlayerState();
    expect(state.speed).toBe(1.5);

    await narrationPlayerService.setSpeed(0.5);
    state = await narrationPlayerService.getPlayerState();
    expect(state.speed).toBe(0.75);

    await narrationPlayerService.setSpeed(3.0);
    state = await narrationPlayerService.getPlayerState();
    expect(state.speed).toBe(2.0);
  });

  it('configures sleep timer presets and chapter end', async () => {
    await narrationPlayerService.setSleepTimer('10m');
    let state = await narrationPlayerService.getPlayerState();
    expect(state.isSleepTimerActive).toBe(true);
    expect(state.sleepTimerSecondsRemaining).toBe(600);
    expect(state.sleepTimerEndOfChapter).toBe(false);

    await narrationPlayerService.setSleepTimer('chapter');
    state = await narrationPlayerService.getPlayerState();
    expect(state.isSleepTimerActive).toBe(true);
    expect(state.sleepTimerEndOfChapter).toBe(true);

    await narrationPlayerService.setSleepTimer('off');
    state = await narrationPlayerService.getPlayerState();
    expect(state.isSleepTimerActive).toBe(false);
  });
});
