package com.aireader.library

import android.content.Context
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequest
import androidx.work.WorkManager
import java.util.UUID

/** Called on the library's serial executor. The DB token closes the enqueue/process-death gap. */
internal object BookPreparation {
  fun prepare(context: Context, bookId: String, reprocess: Boolean = false): BookEntity {
    val dao = LibraryDatabase.get(context).libraryDao()
    val book = dao.getBook(bookId) ?: throw PreparationFailure("BOOK_NOT_FOUND", "This book is no longer in your library.")
    if (book.importState == "deleting") throw PreparationFailure("BOOK_NOT_FOUND", "This book is being removed.")
    if (book.format !in setOf("txt", "epub", "pdf")) throw PreparationFailure("BOOK_PARSER_UNAVAILABLE", "This file format is not supported.")
    if (book.importState == "ready" && !reprocess) return book
    val token = book.preparationId ?: UUID.randomUUID().toString().also {
      if (book.importState == "ready") dao.queueReprocessing(bookId, it) else dao.queuePreparation(bookId, it)
    }
    try {
      ensureScheduled(context, bookId, token)
    } catch (error: Exception) {
      dao.stopPreparation(bookId, token, "failed", "BOOK_PREPARATION_SCHEDULE", "Text preparation could not be queued. Please retry.")
      throw PreparationFailure("BOOK_PREPARATION_SCHEDULE", "Text preparation could not be queued. Please retry.")
    }
    return dao.getBook(bookId) ?: throw PreparationFailure("BOOK_NOT_FOUND", "This book was removed.")
  }

  fun cancel(context: Context, bookId: String) {
    val dao = LibraryDatabase.get(context).libraryDao()
    val token = dao.getBook(bookId)?.preparationId ?: return
    // Signal the worker before waiting for the DB lock, including during its save transaction.
    // Persistently invalidating the token prevents a stopped/old worker from committing over a retry.
    WorkManager.getInstance(context).cancelWorkById(UUID.fromString(token))
    dao.stopPreparation(bookId, token, "pending_parse", "BOOK_PREPARATION_CANCELLED", "Preparation stopped. Your original copy is safe; you can retry anytime.")
  }

  fun cancelWork(context: Context, book: BookEntity) {
    book.preparationId?.let { WorkManager.getInstance(context).cancelWorkById(UUID.fromString(it)) }
  }

  fun recover(context: Context) {
    val dao = LibraryDatabase.get(context).libraryDao()
    dao.listBooks().filter { it.preparationId != null }.forEach { book ->
      val token = book.preparationId ?: return@forEach
      try {
        ensureScheduled(context, book.id, token)
      } catch (_: Exception) {
        dao.stopPreparation(book.id, token, "failed", "BOOK_PREPARATION_INTERRUPTED", "Preparation was interrupted. Tap Retry preparation to try again.")
      }
    }
  }

  private fun ensureScheduled(context: Context, bookId: String, token: String) {
    val work = WorkManager.getInstance(context)
    val requestId = UUID.fromString(token)
    val existing = work.getWorkInfoById(requestId).get()
    if (existing != null) {
      if (existing.state.isFinished) {
        // A successful commit clears the token. Conditional update is harmless if it just completed.
        LibraryDatabase.get(context).libraryDao().stopPreparation(bookId, token, "failed",
          "BOOK_PREPARATION_INTERRUPTED", "Preparation was interrupted. Tap Retry preparation to try again.")
      }
      return
    }
    val request = OneTimeWorkRequest.Builder(BookPreparationWorker::class.java)
      .setId(requestId)
      .setInputData(Data.Builder().putString("bookId", bookId).build())
      .addTag("book-preparation")
      .build()
    work.enqueueUniqueWork("prepare-$bookId-$token", ExistingWorkPolicy.KEEP, request).result.get()
  }
}
