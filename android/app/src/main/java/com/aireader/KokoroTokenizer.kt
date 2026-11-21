package com.aireader

import android.content.Context
import org.json.JSONObject
import java.io.File

/**
 * Phonetic tokenizer for Kokoro-82M ONNX model.
 * Maps English text and phonetic representations into token IDs matching Kokoro's vocabulary.
 * Follows the Kokoro contract: input tokens are padded with leading and trailing 0 tokens.
 */
internal class KokoroTokenizer(context: Context? = null, configFile: File? = null) {
  companion object {
    const val PAD_TOKEN = 0L
    const val MAX_TOKENS = 510

    // Exact Kokoro-82M vocabulary mapping
    private val DEFAULT_VOCAB: Map<Char, Long> = mapOf(
      ';' to 1L, ':' to 2L, ',' to 3L, '.' to 4L, '!' to 5L, '?' to 6L,
      '—' to 9L, '…' to 10L, '"' to 11L, '(' to 12L, ')' to 13L,
      '“' to 14L, '”' to 15L, ' ' to 16L, '\u0303' to 17L,
      'ʣ' to 18L, 'ʥ' to 19L, 'ʦ' to 20L, 'ʨ' to 21L, 'ᵝ' to 22L, '\uAB67' to 23L,
      'A' to 24L, 'I' to 25L, 'O' to 31L, 'Q' to 33L, 'S' to 35L, 'T' to 36L,
      'W' to 39L, 'Y' to 41L, 'ᵊ' to 42L,
      'a' to 43L, 'b' to 44L, 'c' to 45L, 'd' to 46L, 'e' to 47L, 'f' to 48L,
      'h' to 50L, 'i' to 51L, 'j' to 52L, 'k' to 53L, 'l' to 54L, 'm' to 55L,
      'n' to 56L, 'o' to 57L, 'p' to 58L, 'q' to 59L, 'r' to 60L, 's' to 61L,
      't' to 62L, 'u' to 63L, 'v' to 64L, 'w' to 65L, 'x' to 66L, 'y' to 67L,
      'z' to 68L,
      'ɑ' to 69L, 'ɐ' to 70L, 'ɒ' to 71L, 'æ' to 72L, 'β' to 75L, 'ɔ' to 76L,
      'ɕ' to 77L, 'ç' to 78L, 'ɖ' to 80L, 'ð' to 81L, 'ʤ' to 82L, 'ə' to 83L,
      'ɚ' to 85L, 'ɛ' to 86L, 'ɜ' to 87L, 'ɟ' to 90L, 'ɡ' to 92L, 'ɥ' to 99L,
      'ɨ' to 101L, 'ɪ' to 102L, 'ʝ' to 103L, 'ɯ' to 110L, 'ɰ' to 111L, 'ŋ' to 112L,
      'ɳ' to 113L, 'ɲ' to 114L, 'ɴ' to 115L, 'ø' to 116L, 'ɸ' to 118L, 'θ' to 119L,
      'œ' to 120L, 'ɹ' to 123L, 'ɾ' to 125L, 'ɻ' to 126L, 'ʁ' to 128L, 'ɽ' to 129L,
      'ʂ' to 130L, 'ʃ' to 131L, 'ʈ' to 132L, 'ʧ' to 133L, 'ʊ' to 135L, 'ʋ' to 136L,
      'ʌ' to 138L, 'ɣ' to 139L, 'ɤ' to 140L, 'χ' to 142L, 'ʎ' to 143L, 'ʒ' to 147L,
      'ʔ' to 148L,
      'ˈ' to 156L, 'ˌ' to 157L, 'ː' to 158L, 'ʰ' to 162L, 'ʲ' to 164L,
      '↓' to 169L, '→' to 171L, '↗' to 172L, '↘' to 173L, 'ᵻ' to 177L
    )
  }

  private val vocab: Map<Char, Long>
  private val appContext: Context? = context

  init {
    if (context != null) {
      KokoroPhonemizer.initialize(context)
    }

    var loaded: Map<Char, Long>? = null

    // 1. Try loading from configFile if provided
    if (configFile != null && configFile.exists()) {
      try {
        val json = JSONObject(configFile.readText(Charsets.UTF_8))
        if (json.has("vocab")) {
          val vocabObj = json.getJSONObject("vocab")
          val map = mutableMapOf<Char, Long>()
          for (key in vocabObj.keys()) {
            if (key.isNotEmpty()) {
              map[key[0]] = vocabObj.getLong(key)
            }
          }
          if (map.isNotEmpty()) {
            loaded = map
          }
        }
      } catch (_: Exception) {}
    }

    // 2. Try loading from assets/kokoro_vocab.json
    if (loaded == null && context != null) {
      try {
        context.assets.open("kokoro_vocab.json").use { stream ->
          val jsonText = stream.bufferedReader().readText()
          val json = JSONObject(jsonText)
          val map = mutableMapOf<Char, Long>()
          for (key in json.keys()) {
            if (key.isNotEmpty()) {
              map[key[0]] = json.getLong(key)
            }
          }
          if (map.isNotEmpty()) {
            loaded = map
          }
        }
      } catch (_: Exception) {}
    }

    vocab = loaded ?: DEFAULT_VOCAB
  }

  /**
   * Encodes English text into token IDs.
   * If text is raw English words, it converts them through KokoroPhonemizer to IPA phonemes first.
   */
  fun encode(text: String): LongArray {
    val cleaned = text.trim()
    if (cleaned.isEmpty()) {
      return longArrayOf(PAD_TOKEN, PAD_TOKEN)
    }

    // Convert English text to Kokoro IPA phonemes
    val phonemes = KokoroPhonemizer.phonemize(cleaned, appContext)
    val targetString = if (phonemes.isNotEmpty()) phonemes else cleaned

    val ids = ArrayList<Long>(MAX_TOKENS + 2)
    ids.add(PAD_TOKEN)

    var count = 0
    for (ch in targetString) {
      if (count >= MAX_TOKENS) break
      val id = vocab[ch]
      if (id != null) {
        ids.add(id)
        count++
      } else if (ch.isWhitespace()) {
        ids.add(vocab[' '] ?: 16L)
        count++
      }
    }

    ids.add(PAD_TOKEN)
    return ids.toLongArray()
  }

  fun getVocabSize(): Int = vocab.size
}
