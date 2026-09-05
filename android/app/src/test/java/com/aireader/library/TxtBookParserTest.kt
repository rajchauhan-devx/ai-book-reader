package com.aireader.library

import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.RandomAccessFile

class TxtBookParserTest {
  @get:Rule val folder = TemporaryFolder()
  private fun parse(text: String): ParsedDocument {
    val file = folder.newFile()
    file.writeText(text, Charsets.UTF_8)
    return TxtBookParser.parse(file, textHash(text))
  }
  private fun failure(expected: String, action: () -> Unit) {
    try { action(); fail("Expected $expected") } catch (error: PreparationFailure) { assertEquals(expected, error.code) }
  }

  @Test fun detectsOrderedChaptersAndRetainsOpeningText() {
    val doc = parse("A book title\n\nChapter One: Dawn\n\nFirst paragraph. Second sentence!\n\nChapter II\n\nLast paragraph.")
    assertEquals(listOf("Opening", "Chapter One: Dawn", "Chapter II"), doc.chapters.map { it.title })
    assertEquals("heading", doc.chapters[1].blocks[0].kind)
    assertEquals(2, doc.chapters[1].blocks[1].sentences.size)
    assertEquals("A book title", doc.chapters[0].blocks.single().text)
  }

  @Test fun ordinaryProseIsNotAChapterHeading() {
    val doc = parse("Chapter titles can vary.\nThis is ordinary prose.\n\nA new paragraph.")
    assertEquals(1, doc.chapters.size)
    assertEquals(2, doc.chapters.single().blocks.size)
  }

  @Test fun preservesMultilingualTextAndOriginalOffsetsAcrossBomAndCrLf() {
    val original = "\uFEFFChapter 1\r\n\r\n  नमस्ते, café 🌟.\r\nAnother line.  \r\n"
    val doc = parse(original)
    for (block in doc.chapters.single().blocks) {
      val span = block.sourceAnchor.removePrefix("txt:utf16:").split('-').map(String::toInt)
      assertEquals(original.substring(span[0], span[1]), block.text)
      block.sentences.forEach { sentence ->
        val sentenceSpan = sentence.sourceAnchor.removePrefix("txt:utf16:").split('-').map(String::toInt)
        assertEquals(original.substring(sentenceSpan[0], sentenceSpan[1]), sentence.text)
      }
    }
    assertTrue(doc.chapters.single().blocks.last().text.contains("नमस्ते, café 🌟."))
    assertFalse(doc.chapters.single().blocks.first().text.contains('\uFEFF'))
  }

  @Test fun narrationNormalizationDoesNotOverwriteSourceText() {
    val raw = "Cafe\u0301   is here."
    val sentence = parse(raw).chapters.single().blocks.single().sentences.single()
    assertEquals(raw, sentence.text)
    assertEquals("Café is here.", sentence.normalizedText)
    assertEquals(textHash(sentence.normalizedText), sentence.normalizedChecksum)
  }

  @Test fun idsAreDeterministicAndDistinguishRepeatedParagraphs() {
    val text = "Same words.\n\nSame words."
    val first = parse(text)
    assertEquals(first, parse(text))
    val blocks = first.chapters.single().blocks
    assertNotEquals(blocks[0].id, blocks[1].id)
    assertNotEquals(blocks[0].sentences[0].id, blocks[1].sentences[0].id)
    assertNotEquals(first.chapters.first().id, parse("Changed words.").chapters.first().id)
  }

  @Test fun recognizesPrologueEpilogueAndConsecutiveHeadings() {
    val doc = parse("Prologue\n\nChapter 1\n\nWords here.\n\nEpilogue\n\nGoodbye.")
    assertEquals(listOf("Prologue", "Chapter 1", "Epilogue"), doc.chapters.map { it.title })
  }

  @Test fun handlesCrOnlyAndFinalLineWithoutNewline() {
    val blocks = parse("First line.\r\rSecond line.").chapters.single().blocks
    assertEquals(listOf("First line.", "Second line."), blocks.map { it.text })
  }

  @Test fun rejectsBlankText() { failure("BOOK_NO_TEXT") { parse("\uFEFF  \r\n\t") } }
  @Test fun rejectsBinaryText() { failure("BOOK_INVALID_TEXT") { parse("Hello\u0000world") } }
  @Test fun rejectsMalformedUtf8() {
    val file = folder.newFile()
    file.writeBytes(byteArrayOf(0xC3.toByte(), 0x28))
    failure("BOOK_TEXT_ENCODING") { TxtBookParser.parse(file, "test") }
  }
  @Test fun rejectsOversizedSourceBeforeReading() {
    val file = folder.newFile()
    RandomAccessFile(file, "rw").use { it.setLength(TxtBookParser.MAX_SOURCE_BYTES + 1) }
    failure("BOOK_PARSER_LIMIT") { TxtBookParser.parse(file, "test") }
  }
  @Test fun rejectsOversizedDecodedText() {
    failure("BOOK_PARSER_LIMIT") { parse("a".repeat(TxtBookParser.MAX_CHARACTERS + 1)) }
  }
  @Test fun rejectsUnboundedParagraphs() {
    failure("BOOK_PARSER_LIMIT") { parse("a".repeat(TxtBookParser.MAX_BLOCK_CHARACTERS + 1)) }
  }
  @Test fun rejectsTooManyChapters() {
    failure("BOOK_PARSER_LIMIT") { parse((1..1001).joinToString("\n\n") { "Chapter $it" }) }
  }
  @Test fun cancellationCanInterruptSegmentation() {
    val file = folder.newFile()
    file.writeText("One paragraph.\n\nAnother paragraph.")
    var cancelled = false
    failure("CANCEL_TEST") {
      TxtBookParser.parse(file, "test", { if (cancelled) throw PreparationFailure("CANCEL_TEST", "Cancelled") }) { _, _ -> cancelled = true }
    }
  }
  @Test fun progressIsMonotonicAndStopsBeforeDatabaseCommit() {
    val file = folder.newFile()
    file.writeText((1..200).joinToString("\n\n") { "Paragraph $it." })
    val values = mutableListOf<Int>()
    TxtBookParser.parse(file, "test", {}, { value, _ -> values.add(value) })
    assertTrue(values.zipWithNext().all { (a, b) -> b >= a })
    assertEquals(80, values.last())
  }
}
