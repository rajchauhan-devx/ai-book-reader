import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  opencodeMimoService,
  fixLigatureSplits,
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

describe('OpenCodeMimoService refinePageSentences', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('uses instant local fallback when disabled', async () => {
    await opencodeMimoService.setApiKey('some-key');
    await opencodeMimoService.setEnabled(false);

    const sentences = [
      { index: 0, text: 'His cup was fil ed to the brim.' },
      { index: 1, text: 'The stal ion leapt forward.' },
    ];

    const refined = await opencodeMimoService.refinePageSentences(sentences);
    expect(refined).toHaveLength(2);
    expect(refined[0].text).toBe('His cup was filled to the brim.');
    expect(refined[0].style).toBe('neutral');
    expect(refined[1].text).toBe('The stallion leapt forward.');
  });

  it('uses instant local fallback when no API key is set', async () => {
    await opencodeMimoService.setApiKey('');
    await opencodeMimoService.setEnabled(true);

    const sentences = [
      { index: 0, text: '"Run!" yel ed Jason.' },
    ];

    const refined = await opencodeMimoService.refinePageSentences(sentences);
    expect(refined[0].text).toBe('"Run!" yelled Jason.');
    expect(refined[0].style).toBe('neutral');
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

  it('falls back gracefully to local ligature fix if API call throws an error', async () => {
    await opencodeMimoService.setApiKey('test-key');
    await opencodeMimoService.setEnabled(true);

    global.fetch = jest.fn().mockRejectedValue(new Error('Network offline'));

    const sentences = [
      { index: 0, text: 'The dark stal ion galloped.' },
    ];

    const refined = await opencodeMimoService.refinePageSentences(sentences);
    expect(refined[0].text).toBe('The dark stallion galloped.');
    expect(refined[0].style).toBe('neutral');
  });
});