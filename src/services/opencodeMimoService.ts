import AsyncStorage from '@react-native-async-storage/async-storage';

export const OPENCODE_STORAGE_KEYS = {
  API_KEY: '@ai-book-reader/opencode-api-key',
  BASE_URL: '@ai-book-reader/opencode-base-url',
  MODEL: '@ai-book-reader/opencode-model',
  ENABLED: '@ai-book-reader/opencode-enabled',
} as const;

export const DEFAULT_OPENCODE_BASE_URL = 'https://opencode.ai/zen/v1';
export const DEFAULT_OPENCODE_MODEL = 'mimo-v2.5-free';

export type SpeechEmotionStyle =
  | 'neutral'
  | 'whispering'
  | 'excited'
  | 'terrified'
  | 'cheerful'
  | 'angry'
  | 'sad'
  | 'dramatic'
  | 'shouting'
  | 'friendly'
  | 'hopeful'
  | 'empathetic'
  | 'narration-relaxed';

export interface RefinedSentence {
  index: number;
  text: string;
  style: SpeechEmotionStyle;
}

export interface OpenCodeConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  enabled: boolean;
}

/**
 * Fast local regex fixer for common EPUB font ligature dropouts.
 * Replaces spaces inside broken words (e.g. "fil ed" -> "filled", "stal ion" -> "stallion").
 */
export function fixLigatureSplits(text: string): string {
  if (!text) return '';

  let cleaned = text;

  // Strip soft hyphens and invisible zero-width markers
  cleaned = cleaned.replace(/\u00AD/g, '')
    .replace(/\u200B/g, '')
    .replace(/\uFEFF/g, '')
    .replace(/\u00A0/g, ' ');

  // De-hyphenate words broken by line-break or spaced hyphens: e.g. "in- formation" -> "information"
  cleaned = cleaned.replace(/(\b[A-Za-z]{2,})-(?:[ \t]*\r?\n[ \t]*|[ \t]+)([a-z]{2,}\b)/g, (_, prefix, suffix) => {
    if (/^(self|well|half|all|ex|non|anti)$/i.test(prefix)) {
      return `${prefix}-${suffix}`;
    }
    return `${prefix}${suffix}`;
  });

  // Specific common words frequently broken in EPUB OCR
  cleaned = cleaned.replace(/\bFinal y\b/g, 'Finally');
  cleaned = cleaned.replace(/\bfinal y\b/g, 'finally');
  cleaned = cleaned.replace(/\bmarshmal ow(s)?\b/gi, 'marshmallow$1');
  cleaned = cleaned.replace(/\bstal ion(s)?\b/gi, 'stallion$1');
  cleaned = cleaned.replace(/\bhil\s+([,.\!?;:])/g, 'hill$1');
  cleaned = cleaned.replace(/\bhil\b(?!\s*([a-zA-Z]))/g, 'hill');

  // Common broken double-l suffixes: "fil ed" -> "filled", "yel ed" -> "yelled", etc.
  cleaned = cleaned.replace(/\b(fil|yel|cal|kil|pul|rol|bel|dwi|stil|spe|sme|spi|dri|chi|gri|thr|swel|fulfi) (ed|ing|er|est)\b/gi, '$1l$2');

  // Common -ly splits: "real ly" -> "really", "actual ly" -> "actually"
  cleaned = cleaned.replace(/\b([a-zA-Z]{3,}) (ly)\b/gi, '$1$2');

  // Common ff, fi, fl, ffi, ffl ligature dropouts frequently found in PDFs
  cleaned = cleaned.replace(/\bof fice(s|r|rs)?\b/gi, 'office$1');
  cleaned = cleaned.replace(/\bof fer(s|ed|ing)?\b/gi, 'offer$1');
  cleaned = cleaned.replace(/\bof ficial(s|ly)?\b/gi, 'official$1');
  cleaned = cleaned.replace(/\bof fspring\b/gi, 'offspring');
  cleaned = cleaned.replace(/\bof fense(s)?\b/gi, 'offense$1');
  cleaned = cleaned.replace(/\bef fect(s|ive|ively)?\b/gi, 'effect$1');
  cleaned = cleaned.replace(/\bef fort(s|less)?\b/gi, 'effort$1');
  cleaned = cleaned.replace(/\baf ter(wards|noon|noons)?\b/gi, 'after$1');
  cleaned = cleaned.replace(/\baf fair(s)?\b/gi, 'affair$1');
  cleaned = cleaned.replace(/\baf ford(able|s|ed|ing)?\b/gi, 'afford$1');
  cleaned = cleaned.replace(/\baf fect(s|ed|ing)?\b/gi, 'affect$1');
  cleaned = cleaned.replace(/\bdif fer(ent|ently|ence|ences|s|ed|ing)?\b/gi, 'differ$1');
  cleaned = cleaned.replace(/\bdif ficult(y|ies)?\b/gi, 'difficult$1');
  cleaned = cleaned.replace(/\bsuf fer(s|ed|ing|ings)?\b/gi, 'suffer$1');
  cleaned = cleaned.replace(/\btra ffic\b/gi, 'traffic');
  cleaned = cleaned.replace(/\bstaf f(s)?\b/gi, 'staff$1');
  cleaned = cleaned.replace(/\bclif f(s)?\b/gi, 'cliff$1');
  cleaned = cleaned.replace(/\bstif f(ly|en|ness)?\b/gi, 'stiff$1');
  cleaned = cleaned.replace(/\bcon flict(s|ed|ing)?\b/gi, 'conflict$1');
  cleaned = cleaned.replace(/\bcon firm(s|ed|ing|ation)?\b/gi, 'confirm$1');
  cleaned = cleaned.replace(/\bcon fident(ly|ce)?\b/gi, 'confident$1');
  cleaned = cleaned.replace(/\bcon fuse(s|d|ing|ion)?\b/gi, 'confuse$1');
  cleaned = cleaned.replace(/\bcon fession(s)?\b/gi, 'confession$1');
  cleaned = cleaned.replace(/\bin fluence(s|d)?\b/gi, 'influence$1');
  cleaned = cleaned.replace(/\bin form(s|ed|ing|ation)?\b/gi, 'inform$1');
  cleaned = cleaned.replace(/\bre flect(s|ed|ing|ion|ions)?\b/gi, 'reflect$1');
  cleaned = cleaned.replace(/\bpro fessor(s)?\b/gi, 'professor$1');
  cleaned = cleaned.replace(/\bde fine(s|d)?\b/gi, 'define$1');
  cleaned = cleaned.replace(/\bde finite(ly)?\b/gi, 'definite$1');
  cleaned = cleaned.replace(/\bfi nd(s|ing)?\b/gi, 'find$1');
  cleaned = cleaned.replace(/\bfi rst(ly)?\b/gi, 'first$1');
  cleaned = cleaned.replace(/\bfi ve\b/gi, 'five');
  cleaned = cleaned.replace(/\bfi re(s|d|ing)?\b/gi, 'fire$1');
  cleaned = cleaned.replace(/\bfi nal(ly|s)?\b/gi, 'final$1');
  cleaned = cleaned.replace(/\bfi gure(s|d)?\b/gi, 'figure$1');
  cleaned = cleaned.replace(/\bfl ow(s|ed|ing)?\b/gi, 'flow$1');
  cleaned = cleaned.replace(/\bfl y(ing)?\b/gi, 'fly$1');
  cleaned = cleaned.replace(/\bfl ight(s)?\b/gi, 'flight$1');
  cleaned = cleaned.replace(/\bfl ame(s)?\b/gi, 'flame$1');
  cleaned = cleaned.replace(/\bfl ash(es|ed|ing)?\b/gi, 'flash$1');
  cleaned = cleaned.replace(/\bfl oor(s)?\b/gi, 'floor$1');

  // Clean dangling spaces before punctuation (e.g. "hil ," -> "hill,")
  cleaned = cleaned.replace(/\s+([,.\!?;:])/g, '$1');

  return cleaned;
}

/**
 * High-performance on-device heuristic that detects emotional delivery from
 * literary dialogue tags, punctuation, and scene cues with 0 network latency.
 */
export function detectLocalSpeechEmotion(rawText: string): { text: string; style: SpeechEmotionStyle } {
  const cleaned = fixLigatureSplits(rawText);
  if (!cleaned.trim()) {
    return { text: cleaned, style: 'neutral' };
  }

  const lower = cleaned.toLowerCase();

  // 1. Whispering / quiet secrets
  if (
    /\b(whispered|murmured|hissed|muttered|breathed|tiptoed|under (her|his|their) breath)\b/i.test(lower) ||
    /\b(shh+|quietly|in a whisper)\b/i.test(lower)
  ) {
    return { text: cleaned, style: 'whispering' };
  }

  // 2. Terrified / fear / trembling
  if (
    /\b(gasped|stammered|stuttered|shuddered|trembled|quivered|whimpered|cowered|panicked|in terror|in horror)\b/i.test(lower)
  ) {
    return { text: cleaned, style: 'terrified' };
  }

  // 3. Shouting / extreme rage / screaming
  if (
    /\b(screamed|shrieked|bellowed|hollered|yelled|roared|shouted)\b/i.test(lower) ||
    (/!{2,}/.test(cleaned) && /[A-Z]{3,}/.test(cleaned))
  ) {
    return { text: cleaned, style: 'shouting' };
  }

  // 4. Angry / stern / aggression
  if (
    /\b(snarled|growled|snapped|scowled|fumed|seethed|glared|furiously|angrily)\b/i.test(lower)
  ) {
    return { text: cleaned, style: 'angry' };
  }

  // 5. Cheerful / joyful / amused
  if (
    /\b(laughed|giggled|chuckled|beamed|smiled|grinned|cheered|playfully|happily)\b/i.test(lower) ||
    /\b(haha|hoho|he-he)\b/i.test(lower)
  ) {
    return { text: cleaned, style: 'cheerful' };
  }

  // 6. Sad / weeping / grief
  if (
    /\b(sobbed|wept|cried|mourned|sniffled|choked back|brokenly|sadly|tearfully|with grief)\b/i.test(lower)
  ) {
    return { text: cleaned, style: 'sad' };
  }

  // 7. Hopeful / affectionate
  if (
    /\b(pleaded|begged|prayed|tenderly|warmly|softly smiled|hoped)\b/i.test(lower)
  ) {
    return { text: cleaned, style: 'hopeful' };
  }

  // 8. General exclamation in dialogue
  if (cleaned.includes('!') && (cleaned.includes('"') || cleaned.includes('“') || cleaned.includes('”'))) {
    return { text: cleaned, style: 'excited' };
  }

  // 9. Standard spoken dialogue
  if (cleaned.includes('"') || cleaned.includes('“') || cleaned.includes('”')) {
    return { text: cleaned, style: 'friendly' };
  }

  // 10. Natural narrative cadence
  return { text: cleaned, style: 'narration-relaxed' };
}

class OpenCodeMimoService {
  private cachedConfig: OpenCodeConfig | null = null;

  async getConfig(): Promise<OpenCodeConfig> {
    if (this.cachedConfig) return this.cachedConfig;

    const [apiKey, baseUrl, model, enabledStr] = await Promise.all([
      AsyncStorage.getItem(OPENCODE_STORAGE_KEYS.API_KEY),
      AsyncStorage.getItem(OPENCODE_STORAGE_KEYS.BASE_URL),
      AsyncStorage.getItem(OPENCODE_STORAGE_KEYS.MODEL),
      AsyncStorage.getItem(OPENCODE_STORAGE_KEYS.ENABLED),
    ]);

    this.cachedConfig = {
      apiKey: apiKey || '',
      baseUrl: baseUrl || DEFAULT_OPENCODE_BASE_URL,
      model: model || DEFAULT_OPENCODE_MODEL,
      enabled: enabledStr !== null ? enabledStr === 'true' : true,
    };

    return this.cachedConfig;
  }

  async setApiKey(key: string): Promise<void> {
    const trimmed = key.trim();
    await AsyncStorage.setItem(OPENCODE_STORAGE_KEYS.API_KEY, trimmed);
    if (this.cachedConfig) this.cachedConfig.apiKey = trimmed;
  }

  async setBaseUrl(url: string): Promise<void> {
    const trimmed = url.trim().replace(/\/+$/, '');
    await AsyncStorage.setItem(OPENCODE_STORAGE_KEYS.BASE_URL, trimmed);
    if (this.cachedConfig) this.cachedConfig.baseUrl = trimmed;
  }

  async setModel(model: string): Promise<void> {
    const trimmed = model.trim();
    await AsyncStorage.setItem(OPENCODE_STORAGE_KEYS.MODEL, trimmed);
    if (this.cachedConfig) this.cachedConfig.model = trimmed;
  }

  async setEnabled(enabled: boolean): Promise<void> {
    await AsyncStorage.setItem(OPENCODE_STORAGE_KEYS.ENABLED, String(enabled));
    if (this.cachedConfig) this.cachedConfig.enabled = enabled;
  }

  /**
   * Tests connection to OpenCode Zen with MiMo model.
   */
  async testConnection(customApiKey?: string): Promise<{ success: boolean; message: string }> {
    const config = await this.getConfig();
    const key = customApiKey !== undefined ? customApiKey.trim() : config.apiKey;

    if (!key) {
      return { success: false, message: 'OpenCode API Key is required.' };
    }

    const endpoint = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            {
              role: 'user',
              content: 'Ping test. Reply with one word: ready',
            },
          ],
          max_tokens: 10,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          message: `API returned HTTP ${response.status}: ${errorText.slice(0, 100)}`,
        };
      }

      const data = await response.json();
      const reply = data?.choices?.[0]?.message?.content?.trim() || 'OK';
      return {
        success: true,
        message: `Connected successfully to ${config.model} (${reply})`,
      };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Network request failed',
      };
    }
  }

  /**
   * Refines a page of book sentences using MiMo v2.5:
   * 1. Fixes broken OCR/ligature word splits.
   * 2. Directs emotional voice acting and speech cadence for natural human-like narration.
   * 3. Seamlessly falls back to fast on-device heuristic when offline or without API key.
   */
  async refinePageSentences(
    sentences: Array<{ index: number; text: string }>,
    overrideApiKey?: string,
  ): Promise<RefinedSentence[]> {
    if (!sentences.length) return [];

    const config = await this.getConfig();
    const key = overrideApiKey !== undefined ? overrideApiKey.trim() : config.apiKey;

    // Fast local fallback with smart emotion detection if disabled or no API key
    if (!config.enabled || !key) {
      return sentences.map(s => {
        const detected = detectLocalSpeechEmotion(s.text);
        return {
          index: s.index,
          text: detected.text,
          style: detected.style,
        };
      });
    }

    const endpoint = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;

    const systemPrompt = `You are an expert audiobook speech director, voice acting coach, and text normalizer.
Your mission is to direct voice synthesis so it sounds completely natural, emotionally engaging, and human—never robotic or monotone.

Tasks:
1. Fix OCR and ligature word splits (e.g., "fil ed" -> "filled", "stal ion" -> "stallion", "yel ed" -> "yelled", "marshmal ows" -> "marshmallows", "hil ," -> "hill,").
2. Choose one emotional delivery style for each sentence from strictly:
   ["neutral", "whispering", "excited", "terrified", "cheerful", "angry", "sad", "dramatic", "shouting", "friendly", "hopeful", "empathetic", "narration-relaxed"].
   - For spoken dialogue in quotes: select the tone matching the character's emotion and dialogue tags (e.g. "whispering" for quiet/stealth, "shouting" or "angry" for arguments, "cheerful" for jokes/laughter, "terrified" for horror/panic).
   - For descriptive storytelling or scene narration: use "narration-relaxed", "dramatic", or "empathetic" to sound warm and engaging.
3. Natural Cadence: Keep the author's original words 100% faithful, but preserve and refine natural punctuation (commas, ellipses "...", em-dashes "—", and exclamation marks "!") so the voice takes natural breaths and expressive pauses.

Output MUST be a strictly valid JSON array of objects with fields:
[{"index": number, "text": string, "style": string}]`;

    const userPrompt = JSON.stringify(
      sentences.map(s => ({
        index: s.index,
        text: s.text,
      })),
    );

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.2,
          max_tokens: 3000,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`OpenCode MiMo API error: HTTP ${response.status}`);
      }

      const data = await response.json();
      const rawContent = data?.choices?.[0]?.message?.content?.trim() || '';

      // Extract JSON array from potential markdown fences (```json ... ```)
      const jsonMatch = rawContent.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (!jsonMatch) {
        throw new Error('MiMo did not return a valid JSON array');
      }

      const parsed: Array<{ index: number; text: string; style?: string }> = JSON.parse(jsonMatch[0]);
      const parsedMap = new Map<number, { text: string; style: SpeechEmotionStyle }>();

      const validStyles = new Set<SpeechEmotionStyle>([
        'neutral',
        'whispering',
        'excited',
        'terrified',
        'cheerful',
        'angry',
        'sad',
        'dramatic',
        'shouting',
        'friendly',
        'hopeful',
        'empathetic',
        'narration-relaxed',
      ]);

      for (const item of parsed) {
        if (typeof item.index === 'number' && typeof item.text === 'string') {
          const style = (item.style && validStyles.has(item.style as SpeechEmotionStyle))
            ? (item.style as SpeechEmotionStyle)
            : detectLocalSpeechEmotion(item.text).style;
          parsedMap.set(item.index, { text: item.text.trim(), style });
        }
      }

      // Reconstruct full list, filling missing indices with local emotion detection
      return sentences.map(orig => {
        const refined = parsedMap.get(orig.index);
        if (refined && refined.text.length > 0) {
          return {
            index: orig.index,
            text: fixLigatureSplits(refined.text),
            style: refined.style,
          };
        }
        const fallback = detectLocalSpeechEmotion(orig.text);
        return {
          index: orig.index,
          text: fallback.text,
          style: fallback.style,
        };
      });
    } catch {
      // Graceful instant fallback: apply local ligature fixes and emotion detection without pausing playback
      return sentences.map(s => {
        const detected = detectLocalSpeechEmotion(s.text);
        return {
          index: s.index,
          text: detected.text,
          style: detected.style,
        };
      });
    }
  }
}

export const opencodeMimoService = new OpenCodeMimoService();
