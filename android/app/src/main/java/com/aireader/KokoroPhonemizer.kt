package com.aireader

import android.content.Context
import android.util.Log
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import java.util.zip.GZIPInputStream

/**
 * High-performance English Grapheme-to-Phoneme (G2P) engine calibrated for Kokoro-82M.
 *
 * Translates English text, dialogue, and prose into Kokoro-82M IPA phonemes.
 * Uses a 90,000+ word verified lexicon (us_gold) compressed in assets,
 * English morphological inflection rules (plurals, verb tenses, gerunds, adverbs),
 * and an expressive phonics fallback engine for fantasy names and novel terms.
 */
internal object KokoroPhonemizer {
  private const val TAG = "KokoroPhonemizer"
  private val lexicon = ConcurrentHashMap<String, String>(95000)
  @Volatile private var isLoaded = false
  @Volatile private var isLoading = false

  fun initialize(context: Context) {
    if (isLoaded || isLoading) return
    synchronized(this) {
      if (isLoaded || isLoading) return
      isLoading = true
    }

    try {
      val assetCandidates = listOf("kokoro_lexicon.json", "kokoro_lexicon.json.gz")
      val am = context.assets
      var openedStream: java.io.InputStream? = null
      var resolvedAsset = ""

      for (candidate in assetCandidates) {
        try {
          openedStream = am.open(candidate)
          resolvedAsset = candidate
          break
        } catch (_: Exception) {}
      }

      if (openedStream != null) {
        openedStream.use { rawIn ->
          val bufferedIn = java.io.BufferedInputStream(rawIn, 64 * 1024)
          bufferedIn.mark(4)
          val b1 = bufferedIn.read()
          val b2 = bufferedIn.read()
          bufferedIn.reset()

          val isGzip = (b1 == 0x1f && b2 == 0x8b)
          val streamToRead = if (isGzip) GZIPInputStream(bufferedIn) else bufferedIn

          val reader = BufferedReader(InputStreamReader(streamToRead, Charsets.UTF_8), 64 * 1024)
          val jsonReader = android.util.JsonReader(reader)
          jsonReader.beginObject()
          while (jsonReader.hasNext()) {
            val key = jsonReader.nextName()
            val value = jsonReader.nextString()
            lexicon[key] = value
          }
          jsonReader.endObject()
          jsonReader.close()
        }
        Log.i(TAG, "Loaded ${lexicon.size} English pronunciations from $resolvedAsset")
      } else {
        Log.w(TAG, "Lexicon asset not found in assets, using rule-based phonics")
      }
    } catch (e: Exception) {
      Log.e(TAG, "Error loading Kokoro lexicon: ${e.message}", e)
    } finally {
      isLoaded = true
      isLoading = false
    }
  }

  // Common high-frequency English words and contractions
  private val CONTRACTIONS = mapOf(
    "i" to "ˈI",
    "i'm" to "ˈIm",
    "i'll" to "ˈIəl",
    "i'd" to "ˈId",
    "i've" to "ˈIv",
    "you're" to "jˈɔɹ",
    "you'll" to "jˈul",
    "you'd" to "jˈud",
    "you've" to "jˈuv",
    "he's" to "hˈiz",
    "she's" to "ʃˈiz",
    "it's" to "ˈɪts",
    "we're" to "wˈiɹ",
    "we've" to "wˈiv",
    "they're" to "ðˈɛɹ",
    "they've" to "ðˈAv",
    "that's" to "ðˈæts",
    "there's" to "ðˈɛɹz",
    "what's" to "wˈʌts",
    "here's" to "hˈiɹz",
    "don't" to "dˈOnt",
    "doesn't" to "dˈʌzənt",
    "didn't" to "dˈɪdᵊnt",
    "can't" to "kˈænt",
    "cannot" to "kˈænɑt",
    "won't" to "wˈOnt",
    "wouldn't" to "wˈʊdənt",
    "shouldn't" to "ʃˈʊdənt",
    "couldn't" to "kˈʊdənt",
    "isn't" to "ˈɪzənt",
    "aren't" to "ˈɑɹnt",
    "wasn't" to "wˈɑzənt",
    "weren't" to "wˈɜɹnt",
    "haven't" to "hˈævənt",
    "hasn't" to "hˈæzənt",
    "hadn't" to "hˈædənt",
    "ain't" to "ˈAnt",
    "let's" to "lˈɛts"
  )

  /**
   * Translates plain English text into Kokoro IPA phonemes.
   */
  fun phonemize(text: String, context: Context? = null): String {
    if (context != null && !isLoaded) {
      initialize(context)
    }

    val trimmed = text.trim()
    if (trimmed.isEmpty()) return ""

    val sb = StringBuilder(trimmed.length * 2)
    val tokens = tokenizeText(trimmed)

    for ((index, token) in tokens.withIndex()) {
      if (token.isPunctuation) {
        sb.append(token.text)
        if (token.text != "'" && token.text != "“" && token.text != "\"") {
          sb.append(' ')
        }
      } else {
        if (index > 0 && !sb.endsWith(' ') && !sb.endsWith('“') && !sb.endsWith('"') && !sb.endsWith('\'')) {
          sb.append(' ')
        }
        val phonemes = wordToPhonemes(token.text)
        sb.append(phonemes)
      }
    }

    return sb.toString().replace(Regex("\\s+"), " ").trim()
  }

  private data class Token(val text: String, val isPunctuation: Boolean)

  private fun tokenizeText(text: String): List<Token> {
    val result = ArrayList<Token>()
    var i = 0
    val len = text.length

    while (i < len) {
      val c = text[i]
      if (c.isWhitespace()) {
        i++
        continue
      }

      // Check punctuation
      if (c == ',' || c == '.' || c == '!' || c == '?' || c == ';' || c == ':' ||
          c == '—' || c == '…' || c == '(' || c == ')' || c == '“' || c == '”' || c == '"') {
        result.add(Token(c.toString(), true))
        i++
        continue
      }

      // Ellipsis "..."
      if (c == '.' && i + 2 < len && text[i + 1] == '.' && text[i + 2] == '.') {
        result.add(Token("…", true))
        i += 3
        continue
      }

      // Em-dash "--"
      if (c == '-' && i + 1 < len && text[i + 1] == '-') {
        result.add(Token("—", true))
        i += 2
        continue
      }

      // Word with apostrophe (e.g. didn't, half-blood)
      val start = i
      while (i < len && (text[i].isLetterOrDigit() || text[i] == '\'' || text[i] == '’' || text[i] == '-')) {
        i++
      }
      val word = text.substring(start, i).replace('’', '\'')
      if (word.isNotEmpty()) {
        result.add(Token(word, false))
      }
    }

    return result
  }

  private fun wordToPhonemes(word: String): String {
    val clean = word.trim('\'', '"', '-', ' ')
    if (clean.isEmpty()) return ""

    val lower = clean.lowercase(Locale.US)

    // 1. Direct contraction lookup
    CONTRACTIONS[lower]?.let { return it }

    // 2. Direct lexicon lookup (exact and lowercase)
    lexicon[clean]?.let { return it }
    lexicon[lower]?.let { return it }

    // 3. Hyphenated compound words (e.g., half-blood -> hˈæf blˈʌd)
    if (clean.contains('-')) {
      val parts = clean.split('-').map { wordToPhonemes(it) }
      return parts.filter { it.isNotBlank() }.joinToString(" ")
    }

    // 4. Morphological inflection handling
    val inflected = tryMorphologicalInflection(lower)
    if (inflected != null) return inflected

    // 5. Rule-based English phonics fallback
    return ruleBasedPhonics(lower)
  }

  /**
   * Inflects known root words for standard English suffixes.
   */
  private fun tryMorphologicalInflection(word: String): String? {
    // Suffix -s / -es / 's
    if (word.endsWith("'s") && word.length > 2) {
      val root = word.substring(0, word.length - 2)
      lexicon[root]?.let { return appendPluralS(it) }
    }
    if (word.endsWith("s") && word.length > 3) {
      // Try stripping 's'
      val root1 = word.substring(0, word.length - 1)
      lexicon[root1]?.let { return appendPluralS(it) }

      // Try stripping 'es' (e.g., matches -> match)
      if (word.endsWith("es") && word.length > 4) {
        val root2 = word.substring(0, word.length - 2)
        lexicon[root2]?.let { return appendPluralEs(it) }
      }
      // Try -ies -> -y (e.g., stories -> story)
      if (word.endsWith("ies") && word.length > 4) {
        val rootY = word.substring(0, word.length - 3) + "y"
        lexicon[rootY]?.let { return appendPluralS(it) }
      }
    }

    // Suffix -ed
    if (word.endsWith("ed") && word.length > 3) {
      val rootD = word.substring(0, word.length - 1) // e.g. shared -> share
      lexicon[rootD]?.let { return appendPastEd(it) }

      val rootEd = word.substring(0, word.length - 2) // e.g. walked -> walk
      lexicon[rootEd]?.let { return appendPastEd(it) }

      if (word.endsWith("ied") && word.length > 4) { // e.g. tried -> try
        val rootY = word.substring(0, word.length - 3) + "y"
        lexicon[rootY]?.let { return appendPastEd(it) }
      }
    }

    // Suffix -ing
    if (word.endsWith("ing") && word.length > 4) {
      val rootIng = word.substring(0, word.length - 3) // e.g. walk -> walking
      lexicon[rootIng]?.let { return it + "ɪŋ" }

      val rootE = rootIng + "e" // e.g. make -> making
      lexicon[rootE]?.let { return it.trimEnd('e', 'i', 'I') + "ɪŋ" }
    }

    // Suffix -ly
    if (word.endsWith("ly") && word.length > 4) {
      val rootLy = word.substring(0, word.length - 2)
      lexicon[rootLy]?.let { return it + "li" }
    }

    // Suffix -er
    if (word.endsWith("er") && word.length > 3) {
      val rootEr = word.substring(0, word.length - 2)
      lexicon[rootEr]?.let { return it + "ɚ" }
    }

    // Suffix -est
    if (word.endsWith("est") && word.length > 4) {
      val rootEst = word.substring(0, word.length - 3)
      lexicon[rootEst]?.let { return it + "ᵻst" }
    }

    return null
  }

  private fun appendPluralS(rootPhonemes: String): String {
    val last = rootPhonemes.lastOrNull() ?: return "s"
    return when (last) {
      's', 'z', 'ʃ', 'ʒ', 'ʧ', 'ʤ' -> rootPhonemes + "ᵻz"
      'p', 't', 'k', 'f', 'θ' -> rootPhonemes + "s"
      else -> rootPhonemes + "z"
    }
  }

  private fun appendPluralEs(rootPhonemes: String): String {
    return rootPhonemes + "ᵻz"
  }

  private fun appendPastEd(rootPhonemes: String): String {
    val last = rootPhonemes.lastOrNull() ?: return "d"
    return when (last) {
      't', 'd' -> rootPhonemes + "ᵻd"
      'p', 'k', 'f', 's', 'ʃ', 'ʧ', 'θ' -> rootPhonemes + "t"
      else -> rootPhonemes + "d"
    }
  }

  /**
   * English letter-to-sound phonetic generator for fantasy names and rare novel words.
   */
  private fun ruleBasedPhonics(word: String): String {
    val sb = StringBuilder()
    var i = 0
    val len = word.length
    var hasVowel = false

    // Put primary stress on initial syllable
    sb.append('ˈ')

    while (i < len) {
      val c = word[i]
      val next = if (i + 1 < len) word[i + 1] else ' '
      val next2 = if (i + 2 < len) word[i + 2] else ' '

      // Digraphs & trigraphs
      if (c == 't' && next == 'h') {
        sb.append(if (word.length <= 4 && (word == "the" || word == "this" || word == "that" || word == "them" || word == "with")) 'ð' else 'θ')
        i += 2
        continue
      }
      if (c == 's' && next == 'h') {
        sb.append('ʃ')
        i += 2
        continue
      }
      if (c == 'c' && next == 'h') {
        sb.append('ʧ')
        i += 2
        continue
      }
      if (c == 'p' && next == 'h') {
        sb.append('f')
        i += 2
        continue
      }
      if (c == 'w' && next == 'h') {
        sb.append('w')
        i += 2
        continue
      }
      if (c == 'n' && next == 'g') {
        sb.append('ŋ')
        i += 2
        continue
      }
      if (c == 'c' && next == 'k') {
        sb.append('k')
        i += 2
        continue
      }
      if (c == 'q' && next == 'u') {
        sb.append("kw")
        i += 2
        continue
      }

      // Vowel combinations
      if (c == 'e' && (next == 'e' || next == 'a')) {
        sb.append('i')
        hasVowel = true
        i += 2
        continue
      }
      if (c == 'o' && next == 'o') {
        sb.append(if (next2 == 'k' || next2 == 'd') 'ʊ' else 'u')
        hasVowel = true
        i += 2
        continue
      }
      if (c == 'a' && (next == 'i' || next == 'y')) {
        sb.append('A')
        hasVowel = true
        i += 2
        continue
      }
      if (c == 'o' && (next == 'i' || next == 'y')) {
        sb.append('Q')
        hasVowel = true
        i += 2
        continue
      }
      if (c == 'o' && (next == 'u' || next == 'w')) {
        sb.append(if (word.endsWith("ow") && word.length <= 4) 'O' else 'W')
        hasVowel = true
        i += 2
        continue
      }
      if (c == 'i' && next == 'g' && next2 == 'h') {
        sb.append('I')
        hasVowel = true
        i += 3
        continue
      }
      if (c == 'e' && next == 'r') {
        sb.append('ɚ')
        hasVowel = true
        i += 2
        continue
      }
      if (c == 'a' && next == 'r') {
        sb.append("ɑɹ")
        hasVowel = true
        i += 2
        continue
      }
      if (c == 'o' && next == 'r') {
        sb.append("ɔɹ")
        hasVowel = true
        i += 2
        continue
      }

      // Single vowels
      if (c == 'a') {
        sb.append(if (i == len - 1) 'ə' else 'æ')
        hasVowel = true
        i++
        continue
      }
      if (c == 'e') {
        // Silent final 'e'
        if (i == len - 1 && hasVowel) {
          i++
          continue
        }
        sb.append('ɛ')
        hasVowel = true
        i++
        continue
      }
      if (c == 'i') {
        sb.append('ɪ')
        hasVowel = true
        i++
        continue
      }
      if (c == 'o') {
        sb.append(if (i == len - 1) 'O' else 'ɑ')
        hasVowel = true
        i++
        continue
      }
      if (c == 'u') {
        sb.append('ʌ')
        hasVowel = true
        i++
        continue
      }
      if (c == 'y') {
        sb.append(if (i == 0) 'j' else 'i')
        hasVowel = true
        i++
        continue
      }

      // Consonants
      if (c == 'c') {
        sb.append(if (next == 'e' || next == 'i' || next == 'y') 's' else 'k')
        i++
        continue
      }
      if (c == 'g') {
        sb.append(if (next == 'e' || next == 'i' || next == 'y') 'ʤ' else 'ɡ')
        i++
        continue
      }
      if (c == 'j') {
        sb.append('ʤ')
        i++
        continue
      }
      if (c == 'r') {
        sb.append('ɹ')
        i++
        continue
      }
      if (c == 'x') {
        sb.append("ks")
        i++
        continue
      }

      // Standard consonants: b, d, f, h, k, l, m, n, p, s, t, v, w, z
      if (c in 'a'..'z') {
        sb.append(c)
      }
      i++
    }

    return sb.toString()
  }
}
