package com.aireader

import java.io.ByteArrayOutputStream
import java.io.File
import java.io.InputStream
import java.io.InputStreamReader
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction
import java.nio.charset.StandardCharsets
import java.util.zip.ZipFile

internal class ImportFailure(
  val errorCode: String,
  override val message: String,
) : Exception(message)

/** Checks file identity and bounded structure; it does not extract or execute book content. */
internal object BookFileValidator {
  fun validate(file: File, format: String, cancelled: () -> Boolean = { false }) {
    checkCancelled(cancelled)
    if (file.length() == 0L) throw ImportFailure("BOOK_EMPTY", "That file is empty.")
    when (format) {
      "pdf" -> file.inputStream().use { input ->
        if (!readUpTo(input, 5).contentEquals("%PDF-".toByteArray(StandardCharsets.US_ASCII))) {
          throw ImportFailure("BOOK_INVALID_PDF", "This does not appear to be a valid PDF.")
        }
      }
      "txt" -> validateText(file, cancelled)
      "epub" -> validateEpub(file, cancelled)
      else -> throw ImportFailure("BOOK_FORMAT_UNSUPPORTED", "Choose an EPUB, PDF, or TXT book.")
    }
    checkCancelled(cancelled)
  }

  private fun validateText(file: File, cancelled: () -> Boolean) {
    val decoder = StandardCharsets.UTF_8.newDecoder()
      .onMalformedInput(CodingErrorAction.REPORT)
      .onUnmappableCharacter(CodingErrorAction.REPORT)
    try {
      InputStreamReader(file.inputStream(), decoder).use { reader ->
        val characters = CharArray(8 * 1024)
        while (true) {
          checkCancelled(cancelled)
          val read = reader.read(characters)
          if (read < 0) break
          for (index in 0 until read) {
            if (characters[index] == '\u0000') {
              throw ImportFailure("BOOK_INVALID_TEXT", "This TXT file appears to contain binary data.")
            }
          }
        }
      }
    } catch (_: CharacterCodingException) {
      throw ImportFailure("BOOK_TEXT_ENCODING", "TXT books currently need UTF-8 text encoding.")
    }
  }

  private fun validateEpub(file: File, cancelled: () -> Boolean) {
    try {
      ZipFile(file).use { zip ->
        val mimetype = zip.getEntry("mimetype")
          ?: throw ImportFailure("BOOK_INVALID_EPUB", "This EPUB is missing its format marker.")
        val marker = zip.getInputStream(mimetype).use { readUpTo(it, 64) }
        if (!marker.contentEquals("application/epub+zip".toByteArray(StandardCharsets.US_ASCII))) {
          throw ImportFailure("BOOK_INVALID_EPUB", "This does not appear to be a valid EPUB.")
        }
        var count = 0
        var expanded = 0L
        val entries = zip.entries()
        while (entries.hasMoreElements()) {
          checkCancelled(cancelled)
          val entry = entries.nextElement()
          if (++count > 10_000) {
            throw ImportFailure("BOOK_EPUB_UNSAFE", "This EPUB contains too many internal files.")
          }
          val path = entry.name.replace('\\', '/')
          if (path.startsWith('/') || Regex("^[A-Za-z]:").containsMatchIn(path) ||
            path.split('/').any { it == ".." } || path.contains('\u0000')) {
            throw ImportFailure("BOOK_EPUB_UNSAFE", "This EPUB contains an unsafe file path.")
          }
          // Check before addition so hostile ZIP sizes cannot overflow.
          if (entry.size > 1024L * 1024L * 1024L - expanded) {
            throw ImportFailure("BOOK_EPUB_UNSAFE", "This EPUB expands beyond the safe import limit.")
          }
          if (entry.size > 0L) expanded += entry.size
        }
      }
    } catch (error: ImportFailure) {
      throw error
    } catch (_: Exception) {
      throw ImportFailure("BOOK_INVALID_EPUB", "This EPUB could not be checked.")
    }
  }

  private fun checkCancelled(cancelled: () -> Boolean) {
    if (cancelled()) throw ImportFailure("BOOK_IMPORT_CANCELLED", "Book import stopped.")
  }

  private fun readUpTo(input: InputStream, limit: Int): ByteArray {
    val output = ByteArrayOutputStream(limit)
    val buffer = ByteArray(limit)
    while (output.size() < limit) {
      val read = input.read(buffer, 0, limit - output.size())
      if (read < 0) break
      if (read > 0) output.write(buffer, 0, read)
    }
    return output.toByteArray()
  }
}
