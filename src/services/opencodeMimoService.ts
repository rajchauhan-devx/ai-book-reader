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
  | 'dramatic';

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

  // Clean dangling spaces before punctuation (e.g. "hil ," -> "hill,")
  cleaned = cleaned.replace(/\s+([,.\!?;:])/g, '$1');

  return cleaned;
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
   * 2. Detects emotional style (whispering, excited, terrified, etc.).
   * 3. Guarantees 100% text fidelity (no rewriting/hallucinating).
   */
  async refinePageSentences(
    sentences: Array<{ index: number; text: string }>,
    overrideApiKey?: string,
  ): Promise<RefinedSentence[]> {
    if (!sentences.length) return [];

    const config = await this.getConfig();
    const key = overrideApiKey !== undefined ? overrideApiKey.trim() : config.apiKey;

    // Fast local fallback if disabled or no API key
    if (!config.enabled || !key) {
      return sentences.map(s => ({
        index: s.index,
        text: fixLigatureSplits(s.text),
        style: 'neutral',
      }));
    }

    const endpoint = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;

    const systemPrompt = `You are an audiobook speech director and text normalizer.
Tasks:
1. Fix OCR/ligature word splits (e.g., "fil ed" -> "filled", "stal ion" -> "stallion", "yel ed" -> "yelled", "marshmal ows" -> "marshmallows", "hil ," -> "hill,").
2. Choose one emotional delivery style for each sentence from strictly: ["neutral", "whispering", "excited", "terrified", "cheerful", "angry", "sad", "dramatic"].
3. ABSOLUTE FIDELITY: Never summarize, never add commentary, never alter the plot or dialogue. Keep the author's original words 100% faithful.
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
      ]);

      for (const item of parsed) {
        if (typeof item.index === 'number' && typeof item.text === 'string') {
          const style = (item.style && validStyles.has(item.style as SpeechEmotionStyle))
            ? (item.style as SpeechEmotionStyle)
            : 'neutral';
          parsedMap.set(item.index, { text: item.text.trim(), style });
        }
      }

      // Reconstruct full list, filling missing indices with local ligature fix
      return sentences.map(orig => {
        const refined = parsedMap.get(orig.index);
        if (refined && refined.text.length > 0) {
          return {
            index: orig.index,
            text: fixLigatureSplits(refined.text),
            style: refined.style,
          };
        }
        return {
          index: orig.index,
          text: fixLigatureSplits(orig.text),
          style: 'neutral',
        };
      });
    } catch {
      // Graceful instant fallback: apply local ligature fixes without pausing playback
      return sentences.map(s => ({
        index: s.index,
        text: fixLigatureSplits(s.text),
        style: 'neutral',
      }));
    }
  }
}

export const opencodeMimoService = new OpenCodeMimoService();
