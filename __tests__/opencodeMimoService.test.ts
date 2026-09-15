import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  opencodeMimoService,
  fixLigatureSplits,
  detectLocalSpeechEmotion,
  DEFAULT_OPENCODE_BASE_URL,
  DEFAULT_OPENCODE_MODEL,
} from '../src/services/opencodeMimoService';

declare const global: any;

describe('fixLigatureSplits', () => {
  it('handles empty or blank strings', () => {
    expect(fixLigatureSplits('')).toBe('');
    expect(fixLigatureSplits('   ')).toBe('   ');
  });

  it('corrects broken double-l words from EPUB font dropouts', () => {
    expect(fixLigatureSplits('His cup was fil ed to the brim.')).toBe(
      'His cup was filled to the brim.',
    );
    expect(fixLigatureSplits('The dark stal ion ran wild.')).toBe(
      'The dark stallion ran wild.',
    );
    expect(fixLigatureSplits('"Look out!" yel ed Jason.')).toBe(
      '"Look out!" yelled Jason.',
    );
    expect(fixLigatureSplits('They roasted marshmal ows at the campfire.')).toBe(
      'They roasted marshmallows at the campfire.',
    );
    expect(fixLigatureSplits('Standing on the hil , he looked down.')).toBe(
      'Standing on the hill, he looked down.',
    );
    expect(fixLigatureSplits('Final y they arrived.')).toBe(
      'Finally they arrived.',
    );
    expect(fixLigatureSplits('They were pul ing the ropes.')).toBe(
      'They were pulling the ropes.',
    );
  });

  it('corrects split -ly adverbs', () => {
    expect(fixLigatureSplits('It was real ly cold outside.')).toBe(
      'It was really cold outside.',
    );
    expect(fixLigatureSplits('She actual ly knew the truth.')).toBe(
      'She actually knew the truth.',
    );
  });

  it('preserves normal text without corruption', () => {
    const normal = 'The quick brown fox jumps over the lazy dog.';
    expect(fixLigatureSplits(normal)).toBe(normal);
  });
});

describe('OpenCodeMimoService configuration', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('returns default config when storage is empty', async () => {
    const config = await opencodeMimoService.getConfig();
    expect(config.apiKey).toBe('');
    expect(config.baseUrl).toBe(DEFAULT_OPENCODE_BASE_URL);
    expect(config.model).toBe(DEFAULT_OPENCODE_MODEL);
    expect(config.enabled).toBe(true);
  });

  it('updates and persists API key, baseUrl, model, and enabled flag', async () => {
    await opencodeMimoService.setApiKey('test-key-12345');
    await opencodeMimoService.setBaseUrl('https://custom.opencode.ai/zen/v1');
    await opencodeMimoService.setModel('mimo-v2.5-free');
    await opencodeMimoService.setEnabled(false);

    const config = await opencodeMimoService.getConfig();
    expect(config.apiKey).toBe('test-key-12345');
    expect(config.baseUrl).toBe('https://custom.opencode.ai/zen/v1');
    expect(config.model).toBe('mimo-v2.5-free');
    expect(config.enabled).toBe(false);
  });
});

describe('OpenCodeMimoService connection test', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('fails immediately when no API key is provided', async () => {
    await opencodeMimoService.setApiKey('');
    const res = await opencodeMimoService.testConnection('');
    expect(res.success).toBe(false);
    expect(res.message).toContain('required');
  });

  it('succeeds when API returns 200 with chat response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'ready' } }],
      }),
    } as any);

    const res = await opencodeMimoService.testConnection('valid-api-key');
    expect(res.success).toBe(true);
    expect(res.message).toContain('Connected successfully');
  });

  it('handles HTTP error responses gracefully', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized: Invalid API Key',
    } as any);

    const res = await opencodeMimoService.testConnection('invalid-key');
    expect(res.success).toBe(false);
    expect(res.message).toContain('401');
  });
});

describe('detectLocalSpeechEmotion', () => {
  it('detects whispering cues', () => {
    const res = detectLocalSpeechEmotion('"Keep your voice down," she whispered.');
    expect(res.style).toBe('whispering');
  });

  it('detects terrified cues', () => {
    const res = detectLocalSpeechEmotion('"What is that thing?!" Jason stammered in terror.');
    expect(res.style).toBe('terrified');
  });

  it('detects shouting / extreme screams', () => {
    const res = detectLocalSpeechEmotion('"GET OUT NOW!" she screamed.');
    expect(res.style).toBe('shouting');
  });

  it('detects angry cues', () => {
    const res = detectLocalSpeechEmotion('"Don\'t you dare touch that," he snarled furiously.');
    expect(res.style).toBe('angry');
  });

  it('detects cheerful cues', () => {
    const res = detectLocalSpeechEmotion('"That was hilarious!" they laughed happily.');
    expect(res.style).toBe('cheerful');
  });

  it('detects sad / weeping cues', () => {
    const res = detectLocalSpeechEmotion('"I cannot bear this loss," she sobbed tearfully.');
    expect(res.style).toBe('sad');
  });

  it('detects hopeful / pleading cues', () => {
    const res = detectLocalSpeechEmotion('"Please give me one more chance," he pleaded warmly.');
    expect(res.style).toBe('hopeful');
  });

  it('detects excited exclamation in dialogue', () => {
    const res = detectLocalSpeechEmotion('"Look over there!"');
    expect(res.style).toBe('excited');
  });

  it('defaults narrative descriptions to narration-relaxed', () => {
    const res = detectLocalSpeechEmotion('The ancient oak tree stood silently under the autumn sky.');
    expect(res.style).toBe('narration-relaxed');
  });
});

describe('OpenCodeMimoService refinePageSentences', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('uses smart on-device emotion detection when disabled', async () => {
    await opencodeMimoService.setApiKey('some-key');
    await opencodeMimoService.setEnabled(false);

    const sentences = [
      { index: 0, text: 'His cup was fil ed to the brim.' },
      { index: 1, text: '"Hurry up!" yel ed Jason.' },
    ];

    const refined = await opencodeMimoService.refinePageSentences(sentences);
    expect(refined).toHaveLength(2);
    expect(refined[0].text).toBe('His cup was filled to the brim.');
    expect(refined[0].style).toBe('narration-relaxed');
    expect(refined[1].text).toBe('"Hurry up!" yelled Jason.');
    expect(refined[1].style).toBe('shouting');
  });

  it('uses smart on-device emotion detection when no API key is set', async () => {
    await opencodeMimoService.setApiKey('');
    await opencodeMimoService.setEnabled(true);

    const sentences = [
      { index: 0, text: '"Quiet!" she whispered.' },
    ];

    const refined = await opencodeMimoService.refinePageSentences(sentences);
    expect(refined[0].text).toBe('"Quiet!" she whispered.');
    expect(refined[0].style).toBe('whispering');
  });

  it('parses MiMo v2.5 refined sentences and styles correctly', async () => {
    await opencodeMimoService.setApiKey('test-key');
    await opencodeMimoService.setEnabled(true);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify([
                { index: 0, text: '"Look out below!" yelled Jason.', style: 'excited' },
                { index: 1, text: 'They crept through the dark tunnel.', style: 'whispering' },
              ]),
            },
          },
        ],
      }),
    } as any);

    const sentences = [
      { index: 0, text: '"Look out below!" yel ed Jason.' },
      { index: 1, text: 'They crept through the dark tunnel.' },
    ];

    const refined = await opencodeMimoService.refinePageSentences(sentences);
    expect(refined).toHaveLength(2);
    expect(refined[0].text).toBe('"Look out below!" yelled Jason.');
    expect(refined[0].style).toBe('excited');
    expect(refined[1].style).toBe('whispering');
  });

  it('falls back gracefully to smart local emotion if API call throws an error', async () => {
    await opencodeMimoService.setApiKey('test-key');
    await opencodeMimoService.setEnabled(true);

    global.fetch = jest.fn().mockRejectedValue(new Error('Network offline'));

    const sentences = [
      { index: 0, text: 'The dark stal ion galloped.' },
      { index: 1, text: '"Stop!" he shouted.' },
    ];

    const refined = await opencodeMimoService.refinePageSentences(sentences);
    expect(refined[0].text).toBe('The dark stallion galloped.');
    expect(refined[0].style).toBe('narration-relaxed');
    expect(refined[1].style).toBe('shouting');
  });
});