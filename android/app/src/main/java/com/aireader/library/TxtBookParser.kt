package com.aireader.library

import java.io.File
import java.io.InputStreamReader
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction
import java.text.BreakIterator
import java.text.Normalizer
import java.util.Locale

/** Bounded UTF-8 parsing with anchors measured in the original decoded UTF-16 text. */
internal object TxtBookParser {
  const val VERSION = "txt-1"
  const val MAX_SOURCE_BYTES = 16L * 1024 * 1024
  const val MAX_CHARACTERS = 4_000_000
  const val MAX_BLOCK_CHARACTERS = 16_384
  private const val MAX_BLOCKS = 20_000
  private const val MAX_SENTENCES = 100_000
  private const val MAX_CHAPTERS = 1_000
  private val narrationWhitespace = Regex("[\\s\\p{Z}]+")
  private val heading = Regex(
    "^(?:(?:chapter|part|book)\\s+(?:\\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)\\b.*|(?:prologue|epilogue)(?:\\s*[:.\\-].*)?)$",
    RegexOption.IGNORE_CASE,
  )

  fun parse(
    file: File, sourceIdentity: String,
    check: () -> Unit = {}, progress: (Int, String) -> Unit = { _, _ -> },
  ): ParsedDocument {
    check()
    if (file.length() > MAX_SOURCE_BYTES) limit("TXT preparation currently supports source files up to 16 MiB.")
    val decoder = Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
      .onUnmappableCharacter(CodingErrorAction.REPORT)
    val source = StringBuilder()
    try {
      InputStreamReader(file.inputStream(), decoder).use { reader ->
        val buffer = CharArray(8192)
        while (true) {
          check()
          val size = reader.read(buffer)
          if (size < 0) break
          if (source.length + size > MAX_CHARACTERS) limit("This book exceeds the current 4 million character preparation limit.")
          if ((0 until size).any { buffer[it] == '\u0000' }) {
            throw PreparationFailure("BOOK_INVALID_TEXT", "This TXT file contains binary data.")
          }
          source.append(buffer, 0, size)
        }
      }
    } catch (_: CharacterCodingException) {
      throw PreparationFailure("BOOK_TEXT_ENCODING", "Save this TXT book with UTF-8 encoding and import it again.")
    }
    progress(15, "Finding paragraphs and chapters")
    val text = source.toString()
    val chapters = mutableListOf<ParsedChapter>()
    var chapterTitle = "Opening"
    var chapterStart = 0
    var blocks = mutableListOf<ParsedBlock>()
    var paragraphStart = -1
    var paragraphEnd = 0
    var blockCount = 0
    var sentenceCount = 0

    fun addBlock(start: Int, end: Int, kind: String) {
      check()
      if (++blockCount > MAX_BLOCKS) limit("This book has more than 20,000 text blocks.")
      if (end - start > MAX_BLOCK_CHARACTERS) limit("A paragraph is too long. Add paragraph breaks and import the TXT file again.")
      val raw = text.substring(start, end)
      val anchor = "txt:utf16:$start-$end"
      val sentenceSpans = com.aireader.narration.TextNormalizer.splitSentences(raw)
      val parsedSentences = mutableListOf<ParsedSentence>()
      for (span in sentenceSpans) {
        check()
        val original = span.text
        val nfc = Normalizer.normalize(original, Normalizer.Form.NFC)
          .replace(narrationWhitespace, " ").trim()
        val normalized = com.aireader.narration.TextNormalizer.fixLigatureSplits(nfc)
        if (normalized.isNotEmpty()) {
          if (++sentenceCount > MAX_SENTENCES) limit("This book has more than 100,000 sentences.")
          val sentenceAnchor = "txt:utf16:${start + span.start}-${start + span.end}"
          parsedSentences.add(ParsedSentence(
            contentId(sourceIdentity, "sentence", sentenceAnchor, original), original,
            normalized, sentenceAnchor, textHash(normalized),
          ))
        }
      }
      blocks.add(ParsedBlock(contentId(sourceIdentity, kind, anchor, raw), kind, raw, anchor, textHash(raw), parsedSentences))
    }

    fun flushParagraph() {
      if (paragraphStart >= 0) addBlock(paragraphStart, paragraphEnd, "paragraph")
      paragraphStart = -1
    }

    fun flushChapter() {
      if (blocks.isEmpty()) return
      if (chapters.size >= MAX_CHAPTERS) limit("This book has more than 1,000 chapters.")
      val anchor = "txt:utf16:$chapterStart"
      chapters.add(ParsedChapter(contentId(sourceIdentity, "chapter", anchor, chapterTitle), chapterTitle, anchor, blocks))
      blocks = mutableListOf()
    }

    var cursor = if (text.startsWith('\uFEFF')) 1 else 0
    chapterStart = cursor
    var lastProgress = 15
    while (cursor < text.length) {
      check()
      val lineStart = cursor
      while (cursor < text.length && text[cursor] != '\n' && text[cursor] != '\r') cursor++
      val lineEnd = cursor
      if (cursor < text.length && text[cursor++] == '\r' && cursor < text.length && text[cursor] == '\n') cursor++
      var start = lineStart
      var end = lineEnd
      while (start < end && text[start].isWhitespace()) start++
      while (end > start && text[end - 1].isWhitespace()) end--
      if (start == end) {
        flushParagraph()
      } else if (end - start <= 180 && heading.matches(text.substring(start, end))) {
        flushParagraph()
        flushChapter()
        chapterStart = start
        chapterTitle = text.substring(start, end)
        addBlock(start, end, "heading")
      } else {
        if (paragraphStart < 0) paragraphStart = start
        paragraphEnd = end
        if (paragraphEnd - paragraphStart > MAX_BLOCK_CHARACTERS) limit("A paragraph is too long. Add paragraph breaks and import the TXT file again.")
      }
      val percent = 15 + (cursor.toLong() * 65 / text.length.coerceAtLeast(1)).toInt()
      if (percent > lastProgress) {
        progress(percent, "Finding paragraphs and chapters")
        lastProgress = percent
      }
    }
    flushParagraph()
    flushChapter()
    if (chapters.isEmpty() || sentenceCount == 0) {
      throw PreparationFailure("BOOK_NO_TEXT", "This file has no readable text. Choose a different TXT book.")
    }
    check()
    return ParsedDocument(VERSION, chapters)
  }

  private fun limit(message: String): Nothing = throw PreparationFailure("BOOK_PARSER_LIMIT", message)
}
