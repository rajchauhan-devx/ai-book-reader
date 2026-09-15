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

  private var pendingText: String? = null
  private var pendingAnchor: String = ""
  private var pendingKind: String = "paragraph"

  fun chapter(title: String, anchor: String) {
    flushPendingBlock()
    flushChapter()
    chapterTitle = title.trim().take(180).ifEmpty { "Untitled chapter" }
    chapterAnchor = anchor
  }

  fun block(text: String, anchor: String, kind: String = "paragraph") {
    check()
    val raw = text.replace(Regex("[\\u00AD\\u200B\\uFEFF]"), "").trim()
    if (raw.isEmpty()) return

    val currentPending = pendingText
    if (currentPending != null) {
      if (shouldMerge(currentPending, pendingKind, raw, kind) && (currentPending.length + raw.length <= 16_384)) {
        pendingText = mergeBlockText(currentPending, raw)
        return
      } else {
        flushPendingBlock()
      }
    }

    pendingText = raw
    pendingAnchor = anchor
    pendingKind = kind
  }

  private fun flushPendingBlock() {
    val raw = pendingText ?: return
    pendingText = null
    commitBlock(raw, pendingAnchor, pendingKind)
  }

  private fun commitBlock(raw: String, anchor: String, kind: String) {
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
      val nfc = Normalizer.normalize(original, Normalizer.Form.NFC).replace(whitespace, " ").trim()
      val normalized = com.aireader.narration.TextNormalizer.fixLigatureSplits(nfc)
      if (normalized.isNotEmpty()) {
        if (++sentenceCount > 100_000) throw PreparationFailure("BOOK_PARSER_LIMIT", "This book has more than 100,000 sentences.")
        val location = "$anchor:utf16:$start-$end"
        sentences.add(ParsedSentence(contentId(identity, "sentence", location, original), original, normalized, location, textHash(normalized)))
      }
      start = end; end = iterator.next()
    }
    blocks.add(ParsedBlock(contentId(identity, kind, anchor, raw), kind, raw, anchor, textHash(raw), sentences))
  }

  private fun shouldMerge(prev: String, prevKind: String, curr: String, currKind: String): Boolean {
    if (prevKind != "paragraph" || currKind != "paragraph") return false
    val p = prev.trim()
    val c = curr.trim()
    if (p.isEmpty() || c.isEmpty()) return false

    if (p.endsWith("-") || p.endsWith("—") || p.endsWith("\u00AD")) return true

    val firstChar = c.first()
    if (firstChar.isLowerCase()) return true
    if (firstChar in setOf(',', ';', ':', ')', ']', '}', '»')) return true

    val endsWithTerm = p.endsWith(".") || p.endsWith("!") || p.endsWith("?") ||
                       p.endsWith("\"") || p.endsWith("”") || p.endsWith("’") || p.endsWith("»")
    if (!endsWithTerm) {
      val isDialogStart = firstChar in setOf('"', '“', '‘', '\'')
      if (!isDialogStart) {
        val lastWord = p.substringAfterLast(' ').trim().lowercase(Locale.ROOT)
        val danglingWords = setOf(
          "and", "or", "but", "a", "an", "the", "of", "to", "in", "on", "at", "with",
          "for", "from", "as", "by", "were", "was", "is", "are", "had", "have", "has",
          "would", "could", "should", "been", "that", "which", "who", "whose", "what",
          "where", "when", "if", "than", "into", "onto", "upon", "so", "nor", "yet",
          "my", "his", "her", "their", "our", "your", "its", "like", "not", "too"
        )
        if (lastWord in danglingWords || p.endsWith(",") || p.endsWith(";") || p.endsWith(":")) {
          return true
        }
        if (p.last().isLetterOrDigit()) {
          return true
        }
      }
    }
    return false
  }

  private fun mergeBlockText(prev: String, curr: String): String {
    val p = prev.trim()
    val c = curr.trim()
    return if (p.endsWith("-")) {
      val prefix = p.dropLast(1)
      val firstWord = c.substringBefore(' ')
      val rest = c.substringAfter(' ', "")
      if (prefix.endsWith("self", ignoreCase = true) ||
          prefix.endsWith("well", ignoreCase = true) ||
          prefix.endsWith("half", ignoreCase = true) ||
          prefix.endsWith("all", ignoreCase = true) ||
          prefix.endsWith("ex", ignoreCase = true) ||
          prefix.endsWith("non", ignoreCase = true) ||
          prefix.endsWith("anti", ignoreCase = true)) {
        if (rest.isEmpty()) "$p$firstWord" else "$p$firstWord $rest"
      } else {
        if (rest.isEmpty()) "$prefix$firstWord" else "$prefix$firstWord $rest"
      }
    } else {
      "$p $c"
    }
  }

  private fun flushChapter() {
    flushPendingBlock()
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
