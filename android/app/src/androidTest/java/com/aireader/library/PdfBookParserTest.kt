package com.aireader.library

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.PDPageContentStream
import com.tom_roush.pdfbox.pdmodel.font.PDType1Font
import com.tom_roush.pdfbox.pdmodel.encryption.AccessPermission
import com.tom_roush.pdfbox.pdmodel.encryption.StandardProtectionPolicy
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.UUID

@RunWith(AndroidJUnit4::class)
class PdfBookParserTest {
  private val context = InstrumentationRegistry.getInstrumentation().targetContext
  private fun pdf(text: Boolean = true, protect: Boolean = false, blank: Boolean = false): File {
    PDFBoxResourceLoader.init(context)
    val file = File.createTempFile("reader-pdf-test-", ".pdf",context.cacheDir)
    PDDocument().use { doc ->
      doc.documentInformation.title="A PDF Story";doc.documentInformation.author="Test Author"
      val page = PDPage();doc.addPage(page)
      if(text) PDPageContentStream(doc,page).use { stream ->
        stream.beginText();stream.setFont(PDType1Font.HELVETICA,14f);stream.newLineAtOffset(50f,700f)
        stream.showText("A quiet morning. A readable PDF.");stream.endText()
      }
      if(blank) doc.addPage(PDPage())
      if(protect) doc.protect(StandardProtectionPolicy("owner-secret","reader-secret",AccessPermission()))
      doc.save(file)
    }
    return file
  }
  private fun parse(file:File):ParsedDocument {
    val scratch=File(context.cacheDir,"reader-pdf-scratch-"+UUID.randomUUID())
    try {return PdfBookParser.parse(context,file,scratch,"pdf-hash")} finally {file.delete();scratch.deleteRecursively()}
  }
  private fun rejects(file:File,code:String) {try {parse(file);fail("Expected $code")} catch(e:PreparationFailure) {assertEquals(code,e.code)}}
  @Test fun extractsTextMetadataPagesAndLayoutWarning() {
    val doc=parse(pdf(blank=true))
    assertEquals("A PDF Story",doc.title);assertEquals("Test Author",doc.author)
    assertEquals("Page 1",doc.chapters.single().title)
    assertTrue(doc.chapters.single().blocks.joinToString {it.text}.contains("A quiet morning."))
    assertEquals(2,doc.warnings.size)
  }
  @Test fun rejectsScannedOrBlankPdf() = rejects(pdf(text=false),"BOOK_SCANNED_PDF")
  @Test fun rejectsPasswordProtectedPdf() = rejects(pdf(protect=true),"BOOK_PROTECTED")
  @Test fun rejectsDamagedPdf() {
    val file=File.createTempFile("reader-pdf-bad-",".pdf",context.cacheDir)
    file.writeText("%PDF-1.7\nNot a real PDF.")
    rejects(file,"BOOK_INVALID_PDF")
  }
  @Test fun stableIdsOnRepeatedExtraction() {
    val first=parse(pdf());val second=parse(pdf())
    assertEquals(first,second)
  }
}
