package com.aireader.library

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class PdfBookParserTest {
  @Test
  fun testCleanAndReconstructPdfParagraphsUnwrapsLinesAndDehyphenates() {
    val raw = """
      12
      The quick brown fox jumped over
      the lazy dog. This was an in-
      formation leak.

      Page 12
      A second paragraph with an af-
      fair that had of fice drama.
      - 13 -
    """.trimIndent()

    val paragraphs = PdfBookParser.cleanAndReconstructPdfParagraphs(raw)

    assertEquals(2, paragraphs.size)
    assertEquals(
      "The quick brown fox jumped over the lazy dog. This was an information leak.",
      paragraphs[0]
    )
    assertEquals(
      "A second paragraph with an affair that had office drama.",
      paragraphs[1]
    )
  }

  @Test
  fun testStripsPageNumberHeaderFooters() {
    val raw = """
      Chapter One
      This is the start of the book.
      42
    """.trimIndent()

    val paragraphs = PdfBookParser.cleanAndReconstructPdfParagraphs(raw)
    assertEquals(1, paragraphs.size)
    assertFalse(paragraphs[0].contains("42"))
  }

  @Test
  fun testWeldsSentencesSplitAcrossDoubleNewlines() {
    val raw = """
      his beady eyes. He had a wispy goatee and a

      sour face, like he'd eaten something moldy. His
      buff arms and chest pushed against a bright
      orange polo shirt. His nylon workout pants and
      Nikes were

      spotless white. A whistle hung from his neck, and
      a megaphone was clipped to his belt. He would've
      looked pretty scary if he hadn't been five feet

      zero.
    """.trimIndent()

    val paragraphs = PdfBookParser.cleanAndReconstructPdfParagraphs(raw)
    assertEquals(1, paragraphs.size)
    assertEquals(
      "his beady eyes. He had a wispy goatee and a sour face, like he'd eaten something moldy. His buff arms and chest pushed against a bright orange polo shirt. His nylon workout pants and Nikes were spotless white. A whistle hung from his neck, and a megaphone was clipped to his belt. He would've looked pretty scary if he hadn't been five feet zero.",
      paragraphs[0]
    )
  }
}
