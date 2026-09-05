package com.aireader.library

import java.text.BreakIterator
import java.text.Normalizer
import java.util.Locale

/** Shared, bounded construction for EPUB/PDF. Anchors describe extracted source locations. */
internal class DocumentBuilder(private val identity: String, private val check: () -> Unit) {
  private val chapters = mutableListOf<ParsedChapter>()
  private var blocks = mutableListOf<ParsedBlock>()
  private var chapterTitle = "Opening"
  private var chapterAnchor = "opening"
  private var characters = 0
  private var blockCount = 0
  private var sentenceCount = 0
  private val whitespace = Regex("[\\s\\p{Z}]+")
  private val iterator = BreakIterator.getSentenceInstance(Locale.ROOT)

  fun chapter(title: String, anchor: String) {
    flushChapter()
    chapterTitle = title.trim().take(180).ifEmpty { "Untitled chapter" }
    chapterAnchor = anchor
  }

  fun block(text: String, anchor: String, kind: String = "paragraph") {
    check()
    val raw = text.trim()
    if (raw.isEmpty()) return
    characters += raw.length
    if (characters > 4_000_000 || ++blockCount > 20_000 || raw.length > 16_384) {
      throw PreparationFailure("BOOK_PARSER_LIMIT", "This book exceeds the text safety limit. Try a smaller or simpler edition.")
    }
    iterator.setText(raw)
    val sentences = mutableListOf<ParsedSentence>()
    var start = iterator.first()
    var end = iterator.next()
    while (end != BreakIterator.DONE) {
      check()
      val original = raw.substring(start, end)
      val normalized = Normalizer.normalize(original, Normalizer.Form.NFC).replace(whitespace, " ").trim()
      if (normalized.isNotEmpty()) {
        if (++sentenceCount > 100_000) throw PreparationFailure("BOOK_PARSER_LIMIT", "This book has more than 100,000 sentences.")
        val location = "$anchor:utf16:$start-$end"
        sentences.add(ParsedSentence(contentId(identity, "sentence", location, original), original, normalized, location, textHash(normalized)))
      }
      start = end; end = iterator.next()
    }
    blocks.add(ParsedBlock(contentId(identity, kind, anchor, raw), kind, raw, anchor, textHash(raw), sentences))
  }

  private fun flushChapter() {
    if (blocks.isEmpty()) return
    if (chapters.size >= 1_000) throw PreparationFailure("BOOK_PARSER_LIMIT", "This book has more than 1,000 chapters or pages.")
    chapters.add(ParsedChapter(contentId(identity, "chapter", chapterAnchor, chapterTitle), chapterTitle, chapterAnchor, blocks))
    blocks = mutableListOf()
  }

  fun finish(version: String, title: String? = null, author: String? = null, warnings: List<String> = emptyList(), cover: ByteArray? = null): ParsedDocument {
    flushChapter()
    if (chapters.isEmpty()) throw PreparationFailure("BOOK_NO_TEXT", "No readable text was found in this book.")
    check()
    return ParsedDocument(version, chapters, title?.trim()?.take(160)?.ifBlank { null }, author?.trim()?.take(120)?.ifBlank { null }, warnings.distinct(), cover)
  }
}
