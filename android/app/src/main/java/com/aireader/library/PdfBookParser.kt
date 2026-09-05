package com.aireader.library

import android.content.Context
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
          val text = output.value.toString().trim()
          if (text.isBlank()) blankPages++ else {
            builder.chapter("Page $number", "pdf:page:$number")
            var ordinal = 0
            text.split(Regex("\n\\s*\n")).forEach { paragraph ->
              if (paragraph.isNotBlank()) builder.block(paragraph, "pdf:page:$number:block:${ordinal++}")
            }
          }
          progress(10 + number * 70 / pages, "Extracting PDF page $number of $pages")
        }
        if (blankPages == pages) throw PreparationFailure("BOOK_SCANNED_PDF", "This PDF has no selectable text. Scanned pages need OCR, which is not included yet. Choose a text-based edition.")
        val warnings = mutableListOf("PDF text is arranged by page and position. Check columns, tables and footnotes before listening; their reading order may differ from the printed page.")
        if (blankPages > 0) warnings.add("$blankPages page(s) had no selectable text and were omitted. Images and scanned pages are not transcribed.")
        return builder.finish(VERSION, pdf.documentInformation.title, pdf.documentInformation.author, warnings)
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
