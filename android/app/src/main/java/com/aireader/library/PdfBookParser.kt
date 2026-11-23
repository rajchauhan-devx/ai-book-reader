package com.aireader.library

import android.content.Context
import com.aireader.narration.TextNormalizer
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.contentstream.operator.Operator
import com.tom_roush.pdfbox.cos.COSBase
import com.tom_roush.pdfbox.io.MemoryUsageSetting
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.encryption.InvalidPasswordException
import com.tom_roush.pdfbox.text.PDFTextStripper
import com.tom_roush.pdfbox.text.TextPosition
import java.io.File
import java.io.Writer

internal object PdfBookParser {
  const val VERSION = "pdf-1"

  internal fun cleanAndReconstructPdfParagraphs(rawPageText: String, docTitle: String? = null, docAuthor: String? = null): List<String> {
    if (rawPageText.isBlank()) return emptyList()

    val rawLines = rawPageText.lines().map { it.trim() }
    if (rawLines.isEmpty()) return emptyList()

    val cleanLines = rawLines.toMutableList()

    fun isHeaderOrFooter(line: String): Boolean {
      if (line.isBlank()) return false
      // Standalone page numbers: e.g. "1", "42", "Page 42", "- 42 -", Roman numerals "xii"
      if (line.matches(Regex("^(?:page\\s+)?(?:\\d+|[ivxlcdm]+)(?:\\s*[/|-]\\s*\\d+)?$", RegexOption.IGNORE_CASE))) return true
      if (line.matches(Regex("^[-—~•]\\s*\\d+\\s*[-—~•]$"))) return true
      // Book title or author repeated as running header (case insensitive)
      if (!docTitle.isNullOrBlank() && line.equals(docTitle.trim(), ignoreCase = true)) return true
      if (!docAuthor.isNullOrBlank() && line.equals(docAuthor.trim(), ignoreCase = true)) return true
      return false
    }

    // Filter top/bottom running headers, footers, and page markers
    for (i in cleanLines.indices) {
      val line = cleanLines[i]
      if (line.isBlank()) continue
      val isTopOrBottom = (i <= 1) || (i >= cleanLines.size - 2)
      if (isTopOrBottom && isHeaderOrFooter(line)) {
        cleanLines[i] = ""
      } else if (line.matches(Regex("^(?:page\\s+)(?:\\d+|[ivxlcdm]+)(?:\\s*[/|-]\\s*\\d+)?$", RegexOption.IGNORE_CASE)) ||
                 line.matches(Regex("^[-—~•\\[(]\\s*(?:page\\s+)?(?:\\d+|[ivxlcdm]+)\\s*[-—~•\\])]$", RegexOption.IGNORE_CASE)) ||
                 (!docTitle.isNullOrBlank() && line.equals(docTitle.trim(), ignoreCase = true)) ||
                 (!docAuthor.isNullOrBlank() && line.equals(docAuthor.trim(), ignoreCase = true))) {
        cleanLines[i] = ""
      }
    }

    val pageContent = cleanLines.joinToString("\n")
    if (pageContent.isBlank()) return emptyList()

    // 1. De-hyphenate words split at line wraps: "expe-\n riment" or "in-\nformation" -> "experiment"
    var dehyphenated = pageContent.replace(Regex("(\\b[A-Za-z]{2,})[-\u2010\u00AD][ \\t]*\\r?\\n[ \\t]*([a-z]{2,}\\b)")) { match ->
      val p1 = match.groupValues[1]
      val p2 = match.groupValues[2]
      if (p1.equals("self", ignoreCase = true) ||
          p1.equals("well", ignoreCase = true) ||
          p1.equals("half", ignoreCase = true) ||
          p1.equals("all", ignoreCase = true) ||
          p1.equals("ex", ignoreCase = true) ||
          p1.equals("non", ignoreCase = true) ||
          p1.equals("anti", ignoreCase = true)) {
        "$p1-$p2"
      } else {
        "$p1$p2"
      }
    }

    // 2. Remove soft hyphens and invisible zero-width chars
    dehyphenated = dehyphenated
      .replace("\u00AD", "")
      .replace("\u200B", "")
      .replace("\uFEFF", "")
      .replace("\u00A0", " ")

    // 3. Fix ligature dropouts using TextNormalizer
    dehyphenated = TextNormalizer.fixLigatureSplits(dehyphenated)

    // 4. Reconstruct flowing paragraphs by joining single \n line wraps with space,
    // while splitting on double-newlines (\n\s*\n)
    val rawParagraphs = dehyphenated.split(Regex("\\n\\s*\\n+"))
    val paragraphs = mutableListOf<String>()

    for (rawPara in rawParagraphs) {
      val trimmedPara = rawPara.trim()
      if (trimmedPara.isEmpty()) continue

      // Replace single \n inside a paragraph with a single space
      val unwrapped = trimmedPara.lines()
        .map { it.trim() }
        .filter { it.isNotEmpty() }
        .joinToString(" ")
        .replace(Regex("[ \\t]+"), " ")
        .trim()

      if (unwrapped.isNotEmpty()) {
        paragraphs.add(unwrapped)
      }
    }

    if (paragraphs.isEmpty()) return emptyList()

    // 5. Intelligent paragraph welding: reconnect sentences accidentally split across double-newlines
    val weldedParagraphs = mutableListOf<String>()

    fun shouldMergeWithPrevious(prev: String, curr: String): Boolean {
      if (prev.isBlank() || curr.isBlank()) return false
      val p = prev.trim()
      val c = curr.trim()
      if (p.isEmpty() || c.isEmpty()) return false

      if (p.endsWith("-") || p.endsWith("—") || p.endsWith("\u00AD")) return true

      val firstChar = c.first()
      if (firstChar.isLowerCase()) return true
      if (firstChar in setOf(',', ';', ':', ')', ']', '}', '»')) return true

      val endsWithTerm = (p.endsWith(".") || p.endsWith("!") || p.endsWith("?") ||
                         p.endsWith("\"") || p.endsWith("”") || p.endsWith("’") || p.endsWith("»")) &&
                         !TextNormalizer.isAbbreviationOrInitial(p)
      if (!endsWithTerm) {
        val isDialogStart = firstChar in setOf('"', '“', '‘', '\'')
        if (!isDialogStart) {
          val lastWord = p.substringAfterLast(' ').trim().lowercase()
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
          if (p.last().isLetterOrDigit() || TextNormalizer.isAbbreviationOrInitial(p)) {
            return true
          }
        }
      }
      return false
    }

    for (para in paragraphs) {
      if (weldedParagraphs.isEmpty()) {
        weldedParagraphs.add(para)
      } else {
        val lastIdx = weldedParagraphs.lastIndex
        val prev = weldedParagraphs[lastIdx]
        if (shouldMergeWithPrevious(prev, para)) {
          val joined = if (prev.endsWith("-")) {
            val prefix = prev.dropLast(1)
            val firstWord = para.substringBefore(' ')
            val rest = para.substringAfter(' ', "")
            if (prefix.endsWith("self", ignoreCase = true) ||
                prefix.endsWith("well", ignoreCase = true) ||
                prefix.endsWith("half", ignoreCase = true) ||
                prefix.endsWith("all", ignoreCase = true) ||
                prefix.endsWith("ex", ignoreCase = true) ||
                prefix.endsWith("non", ignoreCase = true) ||
                prefix.endsWith("anti", ignoreCase = true)) {
              if (rest.isEmpty()) "$prev$firstWord" else "$prev$firstWord $rest"
            } else {
              if (rest.isEmpty()) "$prefix$firstWord" else "$prefix$firstWord $rest"
            }
          } else {
            "$prev $para"
          }
          weldedParagraphs[lastIdx] = joined.replace(Regex("[ \\t]+"), " ").trim()
        } else {
          weldedParagraphs.add(para)
        }
      }
    }

    return weldedParagraphs
  }

  fun parse(context: Context, file: File, scratch: File, identity: String, check: () -> Unit = {}, progress: (Int, String) -> Unit = { _, _ -> }): ParsedDocument {
    if (file.length() > 64L * 1024 * 1024) throw PreparationFailure("BOOK_PARSER_LIMIT", "PDF preparation currently supports files up to 64 MiB.")
    PDFBoxResourceLoader.init(context.applicationContext)
    scratch.mkdirs()
    try {
      check()
      val memory = MemoryUsageSetting.setupMixed(16L * 1024 * 1024, 128L * 1024 * 1024).setTempDir(scratch)
      PDDocument.load(file, memory).use { pdf ->
        check()
        if (pdf.isEncrypted || !pdf.currentAccessPermission.canExtractContent()) protectedBook()
        val pages = pdf.numberOfPages
        if (pages !in 1..1000) throw PreparationFailure("BOOK_PARSER_LIMIT", "PDFs must contain between 1 and 1,000 pages.")
        val docTitle = pdf.documentInformation.title
        val docAuthor = pdf.documentInformation.author
        val builder = DocumentBuilder(identity, check)
        var blankPages = 0
        var characters = 0
        var operations = 0
        val stripper = object : PDFTextStripper() {
          override fun processOperator(operator: Operator, operands: MutableList<COSBase>) {
            check()
            if (++operations > 2_000_000) throw PreparationFailure("BOOK_PARSER_LIMIT", "This PDF is too complex for safe text extraction.")
            super.processOperator(operator, operands)
          }
          override fun processTextPosition(text: TextPosition) {
            check()
            if (++characters > 4_000_000) throw PreparationFailure("BOOK_PARSER_LIMIT", "This PDF exceeds the text safety limit.")
            super.processTextPosition(text)
          }
        }.apply { sortByPosition = true; lineSeparator = "\n"; paragraphEnd = "\n\n"; pageEnd = "" }
        for (number in 1..pages) {
          check()
          val output = BoundedTextWriter()
          stripper.startPage = number; stripper.endPage = number
          stripper.writeText(pdf, output)
          val rawText = output.value.toString()
          val paragraphs = cleanAndReconstructPdfParagraphs(rawText, docTitle, docAuthor)
          if (paragraphs.isEmpty()) blankPages++ else {
            builder.chapter("Page $number", "pdf:page:$number")
            var ordinal = 0
            paragraphs.forEach { paragraph ->
              builder.block(paragraph, "pdf:page:$number:block:${ordinal++}")
            }
          }
          progress(10 + number * 70 / pages, "Extracting PDF page $number of $pages")
        }
        if (blankPages == pages) throw PreparationFailure("BOOK_SCANNED_PDF", "This PDF has no selectable text. Scanned pages need OCR, which is not included yet. Choose a text-based edition.")
        val warnings = mutableListOf("PDF text is arranged by page and position. Check columns, tables and footnotes before listening; their reading order may differ from the printed page.")
        if (blankPages > 0) warnings.add("$blankPages page(s) had no selectable text and were omitted. Images and scanned pages are not transcribed.")
        return builder.finish(VERSION, docTitle, docAuthor, warnings)
      }
    } catch (error: PreparationFailure) { throw error }
    catch (_: InvalidPasswordException) { protectedBook() }
    catch (_: Exception) { throw PreparationFailure("BOOK_INVALID_PDF", "This PDF could not be read. It may be damaged or use unsupported fonts or content. Try another text-based edition.") }
  }
  private fun protectedBook(): Nothing = throw PreparationFailure("BOOK_PROTECTED", "This PDF is encrypted or restricts text extraction. Choose an unprotected copy you are allowed to read.")
  private class BoundedTextWriter : Writer() {
    val value = StringBuilder()
    override fun write(buffer: CharArray, offset: Int, length: Int) {
      if (value.length + length > 250_000) throw PreparationFailure("BOOK_PARSER_LIMIT", "A PDF page exceeds the text safety limit.")
      value.append(buffer, offset, length)
    }
    override fun flush() = Unit
    override fun close() = Unit
  }
}
