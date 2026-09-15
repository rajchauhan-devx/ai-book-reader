package com.aireader.narration

import android.content.Context
import java.io.File
import java.security.MessageDigest

data class ChapterAudioStatus(
  val readySegments: Int,
  val totalSegments: Int,
  val durationMs: Long,
  val totalBytes: Long,
  val isComplete: Boolean,
)

class AudioCacheStore(private val context: Context) {

  private val audioRootDir: File
    get() = File(context.filesDir, "audio")

  fun chapterDir(bookId: String, voiceId: String, chapterId: String): File {
    val dir = File(audioRootDir, "$bookId/$voiceId/$chapterId")
    if (!dir.exists()) dir.mkdirs()
    return dir
  }

  fun computeCacheKey(
    normalizedText: String,
    modelPackId: String,
    modelVersion: String,
    voiceId: String,
    expression: String,
  ): String {
    val input = "$normalizedText:$modelPackId:$modelVersion:$voiceId:$expression"
    val digest = MessageDigest.getInstance("SHA-256")
    val hashBytes = digest.digest(input.toByteArray(Charsets.UTF_8))
    return hashBytes.joinToString("") { "%02x".format(it) }.take(16)
  }

  fun segmentFile(
    bookId: String,
    voiceId: String,
    chapterId: String,
    sentenceIndex: Int,
    cacheKey: String,
  ): File {
    val dir = chapterDir(bookId, voiceId, chapterId)
    return File(dir, "seg_${sentenceIndex}_$cacheKey.wav")
  }

  fun findCachedSegment(
    bookId: String,
    voiceId: String,
    chapterId: String,
    sentenceIndex: Int,
  ): File? {
    val dir = chapterDir(bookId, voiceId, chapterId)
    if (!dir.exists() || !dir.isDirectory) return null
    val files = dir.listFiles { file ->
      file.isFile && file.name.startsWith("seg_${sentenceIndex}_") && (file.name.endsWith(".wav") || file.name.endsWith(".mp3"))
    } ?: return null
    return files.firstOrNull { isValidWav(it) }
  }

  fun isValidWav(file: File): Boolean {
    if (!file.exists() || file.length() < 32) return false
    try {
      file.inputStream().use { input ->
        val header = ByteArray(12)
        val read = input.read(header)
        if (read < 4) return false
        val riff = String(header, 0, 4, Charsets.US_ASCII)
        if (read >= 12) {
          val wave = String(header, 8, 4, Charsets.US_ASCII)
          if (riff == "RIFF" && wave == "WAVE") return true
        }
        // Check for MP3: ID3 header or MPEG sync word
        if (riff.startsWith("ID3")) return true
        val b0 = header[0].toInt() and 0xFF
        val b1 = header[1].toInt() and 0xFF
        if (b0 == 0xFF && (b1 and 0xE0) == 0xE0) return true
        return file.length() > 200
      }
    } catch (_: Exception) {
      return false
    }
  }

  fun wavDurationMs(file: File, sampleRate: Int = 24_000): Long {
    if (!isValidWav(file)) return 0L
    val len = file.length()
    try {
      file.inputStream().use { input ->
        val header = ByteArray(4)
        input.read(header)
        val riff = String(header, 0, 4, Charsets.US_ASCII)
        if (riff == "RIFF") {
          val dataBytes = len - 44
          if (dataBytes <= 0) return 0L
          val samples = dataBytes / 2
          return (samples * 1000L) / sampleRate
        }
      }
    } catch (_: Exception) {}
    // 48kbps MP3 = 6000 bytes per second
    return (len * 1000L) / 6000L
  }

  fun getChapterAudioStatus(
    bookId: String,
    voiceId: String,
    chapterId: String,
    totalSentences: Int,
  ): ChapterAudioStatus {
    val dir = File(audioRootDir, "$bookId/$voiceId/$chapterId")
    if (!dir.exists() || !dir.isDirectory) {
      return ChapterAudioStatus(0, totalSentences, 0L, 0L, false)
    }

    val wavs = dir.listFiles { file -> file.isFile && (file.name.endsWith(".wav") || file.name.endsWith(".mp3")) } ?: emptyArray()
    var validCount = 0
    var totalBytes = 0L
    var totalDuration = 0L

    for (file in wavs) {
      if (isValidWav(file)) {
        validCount++
        totalBytes += file.length()
        totalDuration += wavDurationMs(file)
      }
    }

    return ChapterAudioStatus(
      readySegments = validCount,
      totalSegments = totalSentences,
      durationMs = totalDuration,
      totalBytes = totalBytes,
      isComplete = totalSentences > 0 && validCount >= totalSentences,
    )
  }

  fun removeChapterAudio(bookId: String, voiceId: String, chapterId: String): Boolean {
    val dir = File(audioRootDir, "$bookId/$voiceId/$chapterId")
    return if (dir.exists()) dir.deleteRecursively() else true
  }

  fun removeBookAudio(bookId: String): Boolean {
    val dir = File(audioRootDir, bookId)
    return if (dir.exists()) dir.deleteRecursively() else true
  }

  fun removeVoiceAudio(voiceId: String): Boolean {
    if (!audioRootDir.exists() || !audioRootDir.isDirectory) return true
    var success = true
    audioRootDir.listFiles()?.forEach { bookDir ->
      val voiceDir = File(bookDir, voiceId)
      if (voiceDir.exists()) {
        if (!voiceDir.deleteRecursively()) success = false
      }
    }
    return success
  }

  fun removeAllAudio(): Boolean {
    return if (audioRootDir.exists()) audioRootDir.deleteRecursively() else true
  }

  fun getTotalAudioBytes(): Long {
    if (!audioRootDir.exists() || !audioRootDir.isDirectory) return 0L
    return audioRootDir.walkTopDown()
      .filter { it.isFile }
      .sumOf { it.length() }
  }

  fun getBookAudioBytes(bookId: String): Long {
    val dir = File(audioRootDir, bookId)
    if (!dir.exists() || !dir.isDirectory) return 0L
    return dir.walkTopDown()
      .filter { it.isFile }
      .sumOf { it.length() }
  }
}
