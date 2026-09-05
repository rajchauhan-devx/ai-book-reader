package com.aireader

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

class BookFileValidatorTest {
  @get:Rule val temporary = TemporaryFolder()

  private fun file(bytes: ByteArray): File =
    temporary.newFile().apply { writeBytes(bytes) }

  private fun failureCode(source: File, format: String): String =
    assertThrows(ImportFailure::class.java) {
      BookFileValidator.validate(source, format)
    }.errorCode

  private fun epub(vararg paths: String): File {
    val source = temporary.newFile()
    ZipOutputStream(source.outputStream()).use { zip ->
      zip.putNextEntry(ZipEntry("mimetype"))
      zip.write("application/epub+zip".toByteArray())
      zip.closeEntry()
      paths.forEach { path ->
        zip.putNextEntry(ZipEntry(path))
        zip.write("<p>A local book.</p>".toByteArray())
        zip.closeEntry()
      }
    }
    return source
  }

  @Test fun acceptsMultibyteTextAcrossTheOldSampleBoundary() {
    val source = file(("a".repeat(8191) + "€ हिन्दी 😀 end").toByteArray(Charsets.UTF_8))
    BookFileValidator.validate(source, "txt")
  }

  @Test fun rejectsMalformedUtf8PastTheFirstEightKilobytes() {
    val source = file("a".repeat(9000).toByteArray() + byteArrayOf(0xC3.toByte()))
    assertEquals("BOOK_TEXT_ENCODING", failureCode(source, "txt"))
  }

  @Test fun rejectsBinaryNullPastTheFirstEightKilobytes() {
    val source = file(("a".repeat(9000) + "\u0000end").toByteArray())
    assertEquals("BOOK_INVALID_TEXT", failureCode(source, "txt"))
  }

  @Test fun rejectsAnEmptyFile() {
    assertEquals("BOOK_EMPTY", failureCode(file(byteArrayOf()), "txt"))
  }

  @Test fun checksPdfIdentityWithoutPretendingToParseIt() {
    BookFileValidator.validate(file("%PDF-1.7\n".toByteArray()), "pdf")
    assertEquals("BOOK_INVALID_PDF", failureCode(file("not a PDF".toByteArray()), "pdf"))
  }

  @Test fun acceptsBoundedEpubContainer() {
    BookFileValidator.validate(epub("META-INF/container.xml", "OEBPS/chapter.xhtml"), "epub")
  }

  @Test fun rejectsTraversalPathsInEpub() {
    assertEquals("BOOK_EPUB_UNSAFE", failureCode(epub("../outside.xhtml"), "epub"))
    assertEquals("BOOK_EPUB_UNSAFE", failureCode(epub("C:/outside.xhtml"), "epub"))
    assertEquals("BOOK_EPUB_UNSAFE", failureCode(epub("OEBPS\\..\\outside.xhtml"), "epub"))
  }

  @Test fun rejectsNonZipFilesAndHonorsCancellation() {
    assertEquals("BOOK_INVALID_EPUB", failureCode(file("invalid".toByteArray()), "epub"))
    val error = assertThrows(ImportFailure::class.java) {
      BookFileValidator.validate(file("A story".toByteArray()), "txt") { true }
    }
    assertEquals("BOOK_IMPORT_CANCELLED", error.errorCode)
  }
}
