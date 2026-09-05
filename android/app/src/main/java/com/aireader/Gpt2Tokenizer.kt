package com.aireader

import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.regex.Pattern

internal class Gpt2Tokenizer(tokenizerFile: File) {
  private val vocab = HashMap<String, Long>()
  private val mergeRanks = HashMap<Pair<String, String>, Int>()
  private val byteEncoder = buildByteEncoder()
  private val cache = ConcurrentHashMap<String, List<String>>()
  private val pattern = Pattern.compile(
    "'s|'t|'re|'ve|'m|'ll|'d| ?\\p{L}+| ?\\p{N}+| ?[^\\s\\p{L}\\p{N}]+|\\s+(?!\\S)|\\s+",
  )

  init {
    val root = JSONObject(tokenizerFile.readText())
    val model = root.getJSONObject("model")
    val vocabJson = model.getJSONObject("vocab")
    vocabJson.keys().forEach { token -> vocab[token] = vocabJson.getLong(token) }
    val merges = model.getJSONArray("merges")
    for (index in 0 until merges.length()) {
      val pair = parseMerge(merges, index)
      if (pair != null) mergeRanks[pair] = index
    }
  }

  fun encode(text: String): LongArray {
    val ids = ArrayList<Long>()
    val matcher = pattern.matcher(text)
    while (matcher.find()) {
      val encoded = buildString {
        matcher.group().toByteArray(Charsets.UTF_8).forEach { byte ->
          append(byteEncoder[byte.toInt() and 0xff])
        }
      }
      bpe(encoded).forEach { token -> ids += vocab[token] ?: 50_256L }
    }
    if (ids.isEmpty()) ids += 50_256L
    // This pack's tokenizer template terminates every text prompt with two GPT-2
    // end-of-text tokens, matching the conversion's Python reference runner.
    ids += 50_256L
    ids += 50_256L
    return ids.toLongArray()
  }

  private fun bpe(token: String): List<String> = cache.getOrPut(token) {
    var pieces = token.map { it.toString() }
    while (pieces.size > 1) {
      var bestIndex = -1
      var bestRank = Int.MAX_VALUE
      for (index in 0 until pieces.lastIndex) {
        val rank = mergeRanks[pieces[index] to pieces[index + 1]] ?: continue
        if (rank < bestRank) {
          bestRank = rank
          bestIndex = index
        }
      }
      if (bestIndex < 0) break
      val merged = ArrayList<String>(pieces.size - 1)
      var index = 0
      while (index < pieces.size) {
        if (index == bestIndex) {
          merged += pieces[index] + pieces[index + 1]
          index += 2
        } else {
          merged += pieces[index]
          index += 1
        }
      }
      pieces = merged
    }
    pieces
  }

  private fun parseMerge(merges: JSONArray, index: Int): Pair<String, String>? {
    val value = merges.get(index)
    return when (value) {
      is String -> {
        val split = value.split(' ', limit = 2)
        if (split.size == 2) split[0] to split[1] else null
      }
      is JSONArray -> if (value.length() >= 2) value.getString(0) to value.getString(1) else null
      else -> null
    }
  }

  private fun buildByteEncoder(): Array<String> {
    val bytes = ArrayList<Int>()
    bytes += 33..126
    bytes += 161..172
    bytes += 174..255
    val chars = bytes.toMutableList()
    var extra = 0
    for (byte in 0..255) {
      if (byte !in bytes) {
        bytes += byte
        chars += 256 + extra
        extra += 1
      }
    }
    val encoder = Array(256) { "" }
    bytes.indices.forEach { encoder[bytes[it]] = chars[it].toChar().toString() }
    return encoder
  }
}
