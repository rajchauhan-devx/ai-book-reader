package com.aireader

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import com.aireader.library.BookEntity
import com.aireader.library.BookPreparation
import com.aireader.library.LibraryActions
import com.aireader.library.PreparationFailure
import com.aireader.library.LibraryDatabase
import com.aireader.library.ReadingPositionEntity
import com.aireader.player.NarrationPlaybackService
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.Locale
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class BookLibraryModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  companion object {
    private const val PICK_BOOK_REQUEST = 4_173
    private const val EVENT_NAME = "BookImportProgress"
    private const val MAX_SOURCE_BYTES = 250L * 1024L * 1024L
    private const val STORAGE_RESERVE_BYTES = 64L * 1024L * 1024L
    // A bridge reload must not race cleanup against the old instance's import.
    private val libraryExecutor = Executors.newSingleThreadExecutor()
  }

  private data class DocumentMetadata(
    val name: String,
    val size: Long,
    val mimeType: String,
  )

  private val executor = libraryExecutor
  private val database by lazy { LibraryDatabase.get(reactApplicationContext) }
  private val cancelled = AtomicBoolean(false)
  private val importing = AtomicBoolean(false)
  private var pickerPromise: Promise? = null
  private var listenerCount = 0

  private val pickerListener: ActivityEventListener = object : BaseActivityEventListener() {
    override fun onActivityResult(
      activity: Activity,
      requestCode: Int,
      resultCode: Int,
      data: Intent?,
    ) {
      if (requestCode != PICK_BOOK_REQUEST) return
      val promise = synchronized(this@BookLibraryModule) {
        pickerPromise.also { pickerPromise = null }
      } ?: return

      val uri = data?.data
      if (resultCode != Activity.RESULT_OK || uri == null) {
        promise.resolve(null)
        return
      }

      executor.execute {
        try {
          val metadata = documentMetadata(uri)
          validateDeclaredSize(metadata.size)
          requireSupportedFormat(metadata)
          promise.resolve(selectionMap(uri, metadata))
        } catch (error: ImportFailure) {
          promise.reject(error.errorCode, error.message, error)
        } catch (error: Exception) {
          promise.reject("BOOK_PICK_FAILED", "That file could not be opened.", error)
        }
      }
    }
  }

  init {
    reactApplicationContext.addActivityEventListener(pickerListener)
  }

  override fun getName(): String = "BookLibrary"

  @ReactMethod
  fun addListener(eventName: String) {
    listenerCount += 1
  }

  @ReactMethod
  fun removeListeners(count: Double) {
    listenerCount = (listenerCount - count.toInt()).coerceAtLeast(0)
  }

  @ReactMethod
  fun chooseBook(promise: Promise) {
    val activity = reactApplicationContext.currentActivity
    if (activity == null) {
      promise.reject("BOOK_PICK_UNAVAILABLE", "The file picker is not available right now.")
      return
    }
    synchronized(this) {
      if (pickerPromise != null) {
        promise.reject("BOOK_PICK_BUSY", "The file picker is already open.")
        return
      }
      pickerPromise = promise
    }
    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      type = "*/*"
      putExtra(
        Intent.EXTRA_MIME_TYPES,
        arrayOf("application/epub+zip", "application/pdf", "text/plain"),
      )
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    try {
      reactApplicationContext.runOnUiQueueThread {
        try {
          activity.startActivityForResult(intent, PICK_BOOK_REQUEST)
        } catch (error: Exception) {
          synchronized(this) { pickerPromise = null }
          promise.reject("BOOK_PICK_UNAVAILABLE", "No file picker could be opened.", error)
        }
      }
    } catch (error: Exception) {
      synchronized(this) { pickerPromise = null }
      promise.reject("BOOK_PICK_UNAVAILABLE", "No file picker could be opened.", error)
    }
  }

  @ReactMethod
  fun importBook(uriValue: String, promise: Promise) {
    if (!importing.compareAndSet(false, true)) {
      promise.reject("BOOK_IMPORT_BUSY", "Another book is already being imported.")
      return
    }
    cancelled.set(false)
    executor.execute {
      var stagingFile: File? = null
      var uncommittedBookId: String? = null
      try {
        recoverInterruptedImports()
        val uri = Uri.parse(uriValue)
        if (uri.scheme != "content" && uri.scheme != "file") {
          throw ImportFailure("BOOK_URI_UNSUPPORTED", "Please choose the book again from Android Files.")
        }
        val metadata = documentMetadata(uri)
        val format = requireSupportedFormat(metadata)
        validateDeclaredSize(metadata.size)
        ensureStorage(metadata.size)

        val stagingRoot = File(reactApplicationContext.filesDir, "books/.staging")
        if (!stagingRoot.mkdirs() && !stagingRoot.isDirectory) {
          throw ImportFailure("BOOK_STORAGE_FAILED", "Private book storage could not be prepared.")
        }
        stagingFile = File(stagingRoot, "${UUID.randomUUID()}.part")
        emitProgress("copying", 0.0, 0L, metadata.size, "Copying into private storage")
        val sha256 = copyAndHash(uri, stagingFile, metadata.size)
        emitProgress("checking", 0.98, stagingFile.length(), metadata.size, "Checking the book")
        BookFileValidator.validate(stagingFile, format, cancelled::get)
        checkCancelled()

        val duplicate = database.libraryDao().findBookBySha256(sha256)
        if (duplicate != null) {
          stagingFile.delete()
          emitProgress("complete", 1.0, duplicate.sourceSizeBytes, duplicate.sourceSizeBytes, "Already in your library")
          promise.resolve(bookMap(duplicate, true))
          return@execute
        }

        val bookId = UUID.randomUUID().toString()
        uncommittedBookId = bookId
        val bookRoot = File(reactApplicationContext.filesDir, "books/$bookId")
        if (!bookRoot.mkdirs() && !bookRoot.isDirectory) {
          throw ImportFailure("BOOK_STORAGE_FAILED", "Private book storage could not be created.")
        }
        val storedFile = File(bookRoot, "source.$format")
        moveIntoLibrary(stagingFile, storedFile)
        stagingFile = null

        val now = System.currentTimeMillis()
        val book = BookEntity().apply {
          id = bookId
          sourceSha256 = sha256
          sourceFileName = metadata.name
          storedFilePath = "books/$bookId/source.$format"
          mimeType = metadata.mimeType
          this.format = format
          sourceSizeBytes = storedFile.length()
          title = titleFromFileName(metadata.name)
          author = "Unknown author"
          importState = "queued"
          preparationId = UUID.randomUUID().toString()
          preparationMessage = "Waiting to prepare text"
          progressPercent = 0
          createdAt = now
          updatedAt = now
        }
        try {
          checkCancelled()
          database.libraryDao().insertBook(book)
          uncommittedBookId = null
        } catch (error: Exception) {
          storedFile.delete()
          bookRoot.delete()
          throw error
        }
        emitProgress("complete", 1.0, book.sourceSizeBytes, book.sourceSizeBytes, "Added to your library")
        // The persisted queue token lets recovery close a process-death gap here.
        runCatching { BookPreparation.prepare(reactApplicationContext, bookId) }
        promise.resolve(bookMap(database.libraryDao().getBook(bookId) ?: book, false))
      } catch (error: ImportFailure) {
        emitProgress(
          if (error.errorCode == "BOOK_IMPORT_CANCELLED") "cancelled" else "failed",
          0.0, 0L, 0L, error.message,
        )
        promise.reject(error.errorCode, error.message, error)
      } catch (error: Exception) {
        val message = if (cancelled.get()) "Book import stopped." else "The book could not be imported."
        val code = if (cancelled.get()) "BOOK_IMPORT_CANCELLED" else "BOOK_IMPORT_FAILED"
        emitProgress(if (cancelled.get()) "cancelled" else "failed", 0.0, 0L, 0L, message)
        promise.reject(code, message, error)
      } finally {
        stagingFile?.delete()
        uncommittedBookId?.let { runCatching { removePrivateBookDirectory(it) } }
        importing.set(false)
        cancelled.set(false)
      }
    }
  }

  @ReactMethod
  fun cancelImport(promise: Promise) {
    cancelled.set(true)
    promise.resolve(importing.get())
  }

  @ReactMethod
  fun listBooks(promise: Promise) {
    executor.execute {
      try {
        recoverInterruptedImports()
        BookPreparation.recover(reactApplicationContext)
        val result = Arguments.createArray()
        database.libraryDao().listBooks().forEach { result.pushMap(bookMap(it, false)) }
        promise.resolve(result)
      } catch (error: Exception) {
        promise.reject("LIBRARY_READ_FAILED", "Your library could not be opened.", error)
      }
    }
  }

  @ReactMethod
  fun getBook(bookId: String, promise: Promise) {
    executor.execute {
      try {
        val book = database.libraryDao().getBook(bookId)
        promise.resolve(book?.let { bookMap(it, false) })
      } catch (error: Exception) {
        promise.reject("LIBRARY_READ_FAILED", "That book could not be opened.", error)
      }
    }
  }

  @ReactMethod
  fun removeBook(bookId: String, promise: Promise) {
    executor.execute {
      try {
        val book = database.libraryDao().getBook(bookId)
        if (book == null) {
          promise.resolve(false)
          return@execute
        }
        BookPreparation.cancelWork(reactApplicationContext, book)
        database.libraryDao().markBookDeleting(bookId)
        removePrivateBookDirectory(bookId)
        database.libraryDao().deleteBook(bookId)
        promise.resolve(true)
      } catch (error: Exception) {
        promise.reject("BOOK_REMOVE_FAILED", "The book could not be removed.", error)
      }
    }
  }

  @ReactMethod
  fun getReadingPosition(bookId: String, promise: Promise) {
    executor.execute {
      try {
        val position = database.libraryDao().getReadingPosition(bookId)
        promise.resolve(position?.let(::readingPositionMap))
      } catch (error: Exception) {
        promise.reject("POSITION_READ_FAILED", "The reading position could not be loaded.", error)
      }
    }
  }

  @ReactMethod
  fun prepareBook(bookId: String, promise: Promise) {
    executor.execute {
      try {
        promise.resolve(bookMap(BookPreparation.prepare(reactApplicationContext, bookId), false))
      } catch (error: PreparationFailure) {
        promise.reject(error.code, error.message, error)
      } catch (error: Exception) {
        promise.reject("BOOK_PREPARATION_FAILED", "Text preparation could not be started.", error)
      }
    }
  }

  @ReactMethod
  fun cancelPreparation(bookId: String, promise: Promise) {
    executor.execute {
      try {
        BookPreparation.cancel(reactApplicationContext, bookId)
        promise.resolve(database.libraryDao().getBook(bookId)?.let { bookMap(it, false) })
      } catch (error: Exception) {
        promise.reject("BOOK_PREPARATION_FAILED", "Text preparation could not be stopped.", error)
      }
    }
  }

  @ReactMethod
  fun listChapters(bookId: String, promise: Promise) {
    executor.execute {
      try {
        requirePreparedBook(bookId)
        val result = Arguments.createArray()
        database.libraryDao().listChapters(bookId).forEach { chapter ->
          result.pushMap(Arguments.createMap().apply {
            putString("id", chapter.id); putString("title", chapter.title)
            putInt("ordinal", chapter.ordinal); putString("sourceAnchor", chapter.sourceAnchor)
          })
        }
        promise.resolve(result)
      } catch (error: Exception) {
        promise.reject("BOOK_TEXT_UNAVAILABLE", "Prepare this book's text before opening chapters.", error)
      }
    }
  }

  @ReactMethod
  fun getChapterPage(bookId: String, chapterId: String, offset: Double, promise: Promise) {
    executor.execute {
      try {
        requirePreparedBook(bookId)
        require(offset.isFinite() && offset >= 0 && offset <= Int.MAX_VALUE && offset % 1.0 == 0.0)
        val dao = database.libraryDao()
        val chapter = dao.getChapter(bookId, chapterId) ?: throw IllegalArgumentException("Chapter not found")
        val total = dao.countBlocks(chapterId)
        val start = offset.toInt().coerceAtMost(total)
        val blocks = dao.getBlocks(chapterId, start, 24)
        val result = Arguments.createArray()
        blocks.forEach { block -> result.pushMap(Arguments.createMap().apply {
          putString("id", block.id); putString("text", block.text)
          putString("kind", block.kind); putString("sourceAnchor", block.sourceAnchor)
          putInt("ordinal", block.ordinal)
          val sentenceStart = dao.countSentencesBeforeBlock(chapterId, block.ordinal)
          putInt("sentenceStartIndex", sentenceStart)
          putArray("sentences", Arguments.createArray().apply {
            dao.blockSentences(block.id).forEach { sentence ->
              pushMap(Arguments.createMap().apply {
                putString("id", sentence.id)
                putString("text", sentence.text)
                putString("normalizedText", sentence.normalizedText)
                putString("sourceAnchor", sentence.sourceAnchor)
                putInt("ordinal", sentence.ordinal)
                putInt("index", sentenceStart + sentence.ordinal)
              })
            }
          })
        }) }
        promise.resolve(Arguments.createMap().apply {
          putString("chapterId", chapter.id); putString("chapterTitle", chapter.title)
          putInt("offset", start); putInt("totalBlocks", total); putArray("blocks", result)
          putInt("totalSentences", dao.countChapterSentences(chapterId))
          if (start + blocks.size < total) putInt("nextOffset", start + blocks.size) else putNull("nextOffset")
        })
      } catch (error: Exception) {
        promise.reject("BOOK_TEXT_UNAVAILABLE", "This text could not be loaded. Return to the book and try again.", error)
      }
    }
  }

  private fun requirePreparedBook(bookId: String) {
    val book = database.libraryDao().getBook(bookId)
    require(book != null && book.importState != "deleting" && book.parserVersion != null)
  }

  private fun mutateBook(bookId: String, promise: Promise, action: () -> Unit) {
    executor.execute {
      try {
        action()
        val book = database.libraryDao().getBook(bookId) ?: throw IllegalArgumentException("Book no longer exists")
        promise.resolve(bookMap(book, false))
      } catch (error: Exception) {
        promise.reject("BOOK_UPDATE_FAILED", error.message ?: "The book could not be updated.", error)
      }
    }
  }

  @ReactMethod
  fun reprocessBook(bookId: String, promise: Promise) = mutateBook(bookId, promise) {
    BookPreparation.prepare(reactApplicationContext, bookId, true)
  }

  @ReactMethod
  fun updateBookMetadata(bookId: String, title: String, author: String, genre: String, coverChoice: Double, promise: Promise) = mutateBook(bookId, promise) {
    require(coverChoice.isFinite() && coverChoice % 1.0 == 0.0)
    LibraryActions.edit(database, bookId, title, author, genre, coverChoice.toInt())
  }

  @ReactMethod
  fun savePreviewPosition(bookId: String, chapterId: String, offset: Double, promise: Promise) = mutateBook(bookId, promise) {
    require(offset.isFinite() && offset >= 0 && offset < Int.MAX_VALUE && offset % 1.0 == 0.0)
    LibraryActions.savePreview(database, bookId, chapterId, offset.toInt())
  }

  @ReactMethod
  fun markBookFinished(bookId: String, finished: Boolean, promise: Promise) = mutateBook(bookId, promise) {
    require(database.libraryDao().markProgress(bookId, if (finished) 100 else 0, System.currentTimeMillis()) == 1)
  }

  @ReactMethod
  fun updateSentencesBatch(updates: ReadableArray, promise: Promise) {
    executor.execute {
      try {
        val dao = database.libraryDao()
        for (i in 0 until updates.size()) {
          val map = updates.getMap(i) ?: continue
          val id = map.getString("id") ?: continue
          val normalizedText = map.getString("normalizedText") ?: continue
          dao.updateSentenceNormalizedText(id, normalizedText)
        }
        NarrationPlaybackService.sentenceCacheInvalidated = true
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("UPDATE_SENTENCES_FAILED", e.message ?: "Failed to update sentences", e)
      }
    }
  }

  @ReactMethod
  fun saveReadingPosition(value: ReadableMap, promise: Promise) {
    executor.execute {
      try {
        val bookId = value.getString("bookId") ?: throw IllegalArgumentException("bookId is required")
        val chapterId = value.getString("chapterId") ?: throw IllegalArgumentException("chapterId is required")
        val sentenceIndex = value.getInt("sentenceIndex")
        val audioOffsetMs = value.getDouble("audioOffsetMs").toLong()
        val position = LibraryActions.saveReadingPosition(
          database,
          bookId,
          chapterId,
          sentenceIndex,
          audioOffsetMs,
        )
        promise.resolve(readingPositionMap(position))
      } catch (error: PreparationFailure) {
        promise.reject(error.code, error.message, error)
      } catch (error: Exception) {
        promise.reject("POSITION_SAVE_FAILED", "The reading position could not be saved.", error)
      }
    }
  }

  private fun documentMetadata(uri: Uri): DocumentMetadata {
    if (uri.scheme == "file") {
      val file = File(uri.path ?: "")
      val safeName = sanitizeFileName(file.name.ifBlank { "Untitled book" })
      val size = if (file.exists()) file.length() else -1L
      val mime = when (file.extension.lowercase(Locale.ROOT)) {
        "epub" -> "application/epub+zip"
        "pdf" -> "application/pdf"
        "txt" -> "text/plain"
        else -> "application/octet-stream"
      }
      return DocumentMetadata(safeName, size, mime)
    }

    var name: String? = null
    var size = -1L
    reactApplicationContext.contentResolver.query(
      uri,
      arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE),
      null,
      null,
      null,
    )?.use { cursor ->
      if (cursor.moveToFirst()) {
        val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
        if (nameIndex >= 0 && !cursor.isNull(nameIndex)) name = cursor.getString(nameIndex)
        if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) size = cursor.getLong(sizeIndex)
      }
    }
    val safeName = sanitizeFileName(name ?: uri.lastPathSegment ?: "Untitled book")
    val mime = reactApplicationContext.contentResolver.getType(uri)?.lowercase(Locale.ROOT)
      ?: "application/octet-stream"
    return DocumentMetadata(safeName, size, mime)
  }

  private fun requireSupportedFormat(metadata: DocumentMetadata): String {
    val extension = metadata.name.substringAfterLast('.', "").lowercase(Locale.ROOT)
    return when {
      extension == "epub" || metadata.mimeType == "application/epub+zip" -> "epub"
      extension == "pdf" || metadata.mimeType == "application/pdf" -> "pdf"
      extension == "txt" || metadata.mimeType == "text/plain" -> "txt"
      else -> throw ImportFailure(
        "BOOK_FORMAT_UNSUPPORTED",
        "Choose an EPUB, text-based PDF, or TXT book.",
      )
    }
  }

  private fun validateDeclaredSize(size: Long) {
    if (size > MAX_SOURCE_BYTES) {
      throw ImportFailure("BOOK_TOO_LARGE", "Books must be 250 MB or smaller.")
    }
  }

  private fun ensureStorage(size: Long) {
    val required = (if (size > 0L) size else 0L) + STORAGE_RESERVE_BYTES
    if (reactApplicationContext.filesDir.usableSpace < required) {
      throw ImportFailure("BOOK_STORAGE_LOW", "Free some phone storage before importing this book.")
    }
  }

  private fun copyAndHash(uri: Uri, destination: File, declaredSize: Long): String {
    val digest = MessageDigest.getInstance("SHA-256")
    var copied = 0L
    var lastEmission = 0L
    val input = if (uri.scheme == "file") {
      val f = File(uri.path ?: "")
      if (!f.exists()) throw ImportFailure("BOOK_OPEN_FAILED", "The selected file could not be read.")
      java.io.FileInputStream(f)
    } else {
      reactApplicationContext.contentResolver.openInputStream(uri)
        ?: throw ImportFailure("BOOK_OPEN_FAILED", "The selected file could not be read.")
    }
    input.use { source ->
      FileOutputStream(destination).use { output ->
        val buffer = ByteArray(64 * 1024)
        while (true) {
          checkCancelled()
          val read = source.read(buffer)
          if (read < 0) break
          if (read == 0) continue
          copied += read
          if (copied > MAX_SOURCE_BYTES) {
            throw ImportFailure("BOOK_TOO_LARGE", "Books must be 250 MB or smaller.")
          }
          output.write(buffer, 0, read)
          digest.update(buffer, 0, read)
          val now = System.currentTimeMillis()
          if (now - lastEmission >= 180L) {
            ensureStorage(0)
            val denominator = if (declaredSize > 0L) declaredSize else MAX_SOURCE_BYTES
            emitProgress(
              "copying",
              (copied.toDouble() / denominator).coerceIn(0.0, 0.95),
              copied,
              declaredSize,
              "Copying into private storage",
            )
            lastEmission = now
          }
        }
        output.fd.sync()
      }
    }
    if (copied == 0L) throw ImportFailure("BOOK_EMPTY", "That file is empty.")
    return digest.digest().joinToString("") { "%02x".format(it) }
  }


  private fun moveIntoLibrary(source: File, destination: File) {
    checkCancelled()
    if (!source.renameTo(destination)) {
      throw ImportFailure("BOOK_STORAGE_FAILED", "The book could not be saved to private storage.")
    }
  }

  private fun readUpTo(input: java.io.InputStream, limit: Int): ByteArray {
    val output = ByteArrayOutputStream(limit)
    val buffer = ByteArray(minOf(4 * 1024, limit))
    while (output.size() < limit) {
      val read = input.read(buffer, 0, minOf(buffer.size, limit - output.size()))
      if (read < 0) break
      if (read > 0) output.write(buffer, 0, read)
    }
    return output.toByteArray()
  }

  private fun removePrivateBookDirectory(bookId: String) {
    val booksRoot = File(reactApplicationContext.filesDir, "books").canonicalFile
    val bookRoot = File(booksRoot, bookId).canonicalFile
    require(bookRoot.parentFile == booksRoot && isBookDirectoryName(bookId))
    if (bookRoot.exists() && !bookRoot.deleteRecursively()) {
      throw ImportFailure("BOOK_REMOVE_FAILED", "The private book copy could not be removed. Please retry.")
    }
  }

  private fun checkCancelled() {
    if (cancelled.get()) throw ImportFailure("BOOK_IMPORT_CANCELLED", "Book import stopped.")
  }

  private fun isBookDirectoryName(value: String): Boolean =
    runCatching { UUID.fromString(value).toString() == value }.getOrDefault(false)

  private fun recoverInterruptedImports() {
    val dao = database.libraryDao()
    dao.listDeletingBooks().forEach { book ->
      BookPreparation.cancelWork(reactApplicationContext, book)
      removePrivateBookDirectory(book.id)
      dao.deleteBook(book.id)
    }
    val knownIds = dao.listBooks().map { it.id }.toSet()
    val root = File(reactApplicationContext.filesDir, "books").canonicalFile
    root.listFiles()?.forEach { child ->
      if (child.canonicalFile.parentFile != root) return@forEach
      if (child.name == ".staging") {
        child.listFiles()?.filter { it.name.endsWith(".part") && it.isFile }?.forEach { it.delete() }
      } else if (isBookDirectoryName(child.name) && child.name !in knownIds) {
        removePrivateBookDirectory(child.name)
      }
    }
  }

  private fun sanitizeFileName(value: String): String = value
    .replace(Regex("[\\p{Cntrl}/\\\\]"), " ")
    .replace(Regex("\\s+"), " ")
    .trim()
    .take(180)
    .ifEmpty { "Untitled book" }

  private fun titleFromFileName(value: String): String = value
    .replace(Regex("(?i)\\.(epub|pdf|txt)$"), "")
    .replace(Regex("[_-]+"), " ")
    .replace(Regex("\\s+"), " ")
    .trim()
    .take(120)
    .ifEmpty { "Untitled book" }

  private fun selectionMap(uri: Uri, metadata: DocumentMetadata): WritableMap =
    Arguments.createMap().apply {
      putString("uri", uri.toString())
      putString("name", metadata.name)
      putDouble("size", metadata.size.coerceAtLeast(0L).toDouble())
      putString("mimeType", metadata.mimeType)
    }

  private fun bookMap(book: BookEntity, duplicate: Boolean): WritableMap =
    Arguments.createMap().apply {
      putString("id", book.id)
      putString("title", book.title)
      putString("author", book.author)
      putString("genre", book.genre)
      putString("format", book.format)
      putString("mimeType", book.mimeType)
      putString("sourceFileName", book.sourceFileName)
      putDouble("sourceSizeBytes", book.sourceSizeBytes.toDouble())
      putString("importState", book.importState)
      putString("parserVersion", book.parserVersion)
      putInt("preparationProgress", book.preparationProgress)
      putString("preparationMessage", book.preparationMessage)
      putInt("coverChoice", book.coverChoice)
      val cover = book.coverImagePath?.let { File(reactApplicationContext.filesDir, it).canonicalFile }
      val ownRoot = File(reactApplicationContext.filesDir, "books/${book.id}").canonicalFile
      putString("coverImageUri", cover?.takeIf { it.parentFile == ownRoot && it.isFile }?.let { Uri.fromFile(it).toString() })
      putString("previewChapterId", book.previewChapterId)
      putInt("previewBlockOffset", book.previewBlockOffset)
      putArray("warnings", Arguments.createArray().apply { book.parsingWarnings?.split('\n')?.filter { it.isNotBlank() }?.forEach { pushString(it) } })
      putInt("progressPercent", book.progressPercent)
      putString("failureCode", book.failureCode)
      putString("failureMessage", book.failureMessage)
      putDouble("createdAt", book.createdAt.toDouble())
      putDouble("updatedAt", book.updatedAt.toDouble())
      book.lastOpenedAt?.let { putDouble("lastOpenedAt", it.toDouble()) } ?: putNull("lastOpenedAt")
      putBoolean("duplicate", duplicate)
    }

  private fun readingPositionMap(position: ReadingPositionEntity): WritableMap =
    Arguments.createMap().apply {
      putString("bookId", position.bookId)
      putString("chapterId", position.chapterId)
      putInt("sentenceIndex", position.sentenceIndex)
      putDouble("audioOffsetMs", position.audioOffsetMs.toDouble())
      putDouble("updatedAt", position.updatedAt.toDouble())
    }

  private fun emitProgress(
    phase: String,
    progress: Double,
    copiedBytes: Long,
    totalBytes: Long,
    message: String,
  ) {
    if (listenerCount <= 0 || !reactApplicationContext.hasActiveReactInstance()) return
    val value = Arguments.createMap().apply {
      putString("phase", phase)
      putDouble("progress", progress.coerceIn(0.0, 1.0))
      putDouble("copiedBytes", copiedBytes.coerceAtLeast(0L).toDouble())
      putDouble("totalBytes", totalBytes.coerceAtLeast(0L).toDouble())
      putString("message", message)
    }
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(EVENT_NAME, value)
  }

  override fun invalidate() {
    synchronized(this) {
      pickerPromise?.resolve(null)
      pickerPromise = null
    }
    cancelled.set(true)
    reactApplicationContext.removeActivityEventListener(pickerListener)
    super.invalidate()
  }
}
