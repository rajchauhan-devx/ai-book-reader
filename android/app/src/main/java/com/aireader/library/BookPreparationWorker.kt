package com.aireader.library

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.io.File
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit

class BookPreparationWorker(context: Context, parameters: WorkerParameters) : Worker(context, parameters) {
  companion object {
    private val parserSlot = Semaphore(1)
    private const val RESERVE_BYTES = 64L * 1024 * 1024
  }

  override fun doWork(): Result {
    val bookId = inputData.getString("bookId") ?: return Result.failure()
    val token = id.toString()
    val database = LibraryDatabase.get(applicationContext)
    val dao = database.libraryDao()
    var acquired = false
    var scratch: File? = null
    var newCover: File? = null
    var committed = false
    var deadline = Long.MAX_VALUE
    var lastCheck = 0L
    fun check() {
      if (isStopped || Thread.currentThread().isInterrupted) throw PreparationFailure("BOOK_PREPARATION_CANCELLED", "Text preparation stopped.")
      if (System.nanoTime() > deadline) throw PreparationFailure("BOOK_PARSER_LIMIT", "Preparation exceeded the four-minute safety limit. Try a smaller book.")
      val now = System.nanoTime()
      if (now - lastCheck > TimeUnit.MILLISECONDS.toNanos(200)) {
        val current = dao.getBook(bookId)
        if (current == null || current.preparationId != token || current.importState == "deleting") {
          throw PreparationFailure("BOOK_PREPARATION_CANCELLED", "Text preparation stopped.")
        }
        if (applicationContext.filesDir.usableSpace < RESERVE_BYTES) {
          throw PreparationFailure("BOOK_STORAGE_LOW", "Free some phone storage, then retry preparation.")
        }
        lastCheck = now
      }
    }
    try {
      while (!acquired) { check(); acquired = parserSlot.tryAcquire(200, TimeUnit.MILLISECONDS) }
      deadline = System.nanoTime() + TimeUnit.MINUTES.toNanos(4)
      check()
      val book = dao.getBook(bookId) ?: return Result.failure()
      if (book.preparationId != token || book.importState == "deleting") return Result.failure()
      if (book.format !in setOf("txt", "epub", "pdf")) throw PreparationFailure("BOOK_PARSER_UNAVAILABLE", "This file format is not supported.")
      val root = File(applicationContext.filesDir, "books/$bookId").canonicalFile
      require(root.parentFile == File(applicationContext.filesDir, "books").canonicalFile && java.util.UUID.fromString(bookId).toString() == bookId)
      val source = File(applicationContext.filesDir, book.storedFilePath).canonicalFile
      if (source.parentFile != root || source.name != "source.${book.format}" || !source.isFile) {
        throw PreparationFailure("BOOK_SOURCE_MISSING", "The private source is missing. Remove this entry and import the original again.")
      }
      dao.updatePreparation(bookId, token, 1, "Reading your private book copy")
      val report: (Int, String) -> Unit = { percent, message ->
        if (dao.updatePreparation(bookId, token, percent, message) != 1) {
          throw PreparationFailure("BOOK_PREPARATION_CANCELLED", "Text preparation stopped.")
        }
      }
      scratch = File(root, ".parser-$token")
      var document = when (book.format) {
        "txt" -> TxtBookParser.parse(source, book.sourceSha256, ::check, report)
        "epub" -> EpubBookParser.parse(source, book.sourceSha256, ::check, report)
        else -> PdfBookParser.parse(applicationContext, source, scratch, book.sourceSha256, ::check, report)
      }
      check()
      // Budget for source/normalized text, IDs, indexes and the transactional journal.
      val textBytes = document.chapters.sumOf { chapter -> chapter.blocks.sumOf { it.text.length.toLong() } } * 2
      val requiredBytes = RESERVE_BYTES + textBytes * 12L
      if (applicationContext.filesDir.usableSpace < requiredBytes) {
        throw PreparationFailure("BOOK_STORAGE_LOW", "There is not enough free space to save the prepared text. Free storage and retry.")
      }
      dao.updatePreparation(bookId, token, 90, "Saving chapters and sentences")
      newCover = document.cover?.let { BookCoverStore.save(it, root, token) }
      if (document.cover != null && newCover == null) document = document.copy(warnings = document.warnings + "The embedded cover could not be decoded; a generated cover is shown instead.")
      val coverPath = newCover?.let { "books/$bookId/${it.name}" }
      PreparedBookStore.commit(database, bookId, token, document, coverPath, ::check)
      committed = true
      if (newCover != null) book.coverImagePath?.let { old ->
        val oldFile = File(applicationContext.filesDir, old).canonicalFile
        if (oldFile.parentFile == root && oldFile.name.startsWith("cover-") && oldFile != newCover) oldFile.delete()
      }
      return Result.success()
    } catch (error: PreparationFailure) {
      if (isStopped) return Result.retry() // WorkManager owns rescheduling after an OS stop.
      dao.stopPreparation(bookId, token,
        if (error.code == "BOOK_PREPARATION_CANCELLED") "pending_parse" else "failed", error.code, error.message)
      return Result.failure()
    } catch (_: InterruptedException) {
      return Result.retry()
    } catch (_: Exception) {
      if (isStopped) return Result.retry()
      dao.stopPreparation(bookId, token, "failed", "BOOK_PREPARATION_FAILED", "This book could not be prepared. Your private source is safe; please retry.")
      return Result.failure()
    } finally {
      scratch?.deleteRecursively()
      if (!committed) newCover?.delete()
      if (acquired) parserSlot.release()
    }
  }
}
