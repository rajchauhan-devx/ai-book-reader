package com.aireader.library

internal object LibraryActions {
  fun edit(database: LibraryDatabase, id: String, title: String, author: String, genre: String, cover: Int): BookEntity {
    val cleanTitle = title.replace(Regex("[\\p{Cntrl}]"), " ").trim()
    val cleanAuthor = author.replace(Regex("[\\p{Cntrl}]"), " ").trim().ifEmpty { "Unknown author" }
    val cleanGenre = genre.replace(Regex("[\\p{Cntrl}]"), " ").trim().ifEmpty { "Uncategorized" }
    if (cleanTitle.isEmpty() || cleanTitle.length > 160 || cleanAuthor.length > 120 || cleanGenre.length > 60 || cover !in -1..4) {
      throw PreparationFailure("BOOK_METADATA_INVALID", "Use a title up to 160 characters, an author up to 120 characters, and a genre up to 60 characters.")
    }
    val dao = database.libraryDao()
    if (dao.editMetadata(id, cleanTitle, cleanAuthor, cleanGenre, cover, System.currentTimeMillis()) != 1) missing()
    return dao.getBook(id) ?: missing()
  }

  fun edit(database: LibraryDatabase, id: String, title: String, author: String, cover: Int): BookEntity {
    val existingGenre = database.libraryDao().getBook(id)?.genre ?: "Uncategorized"
    return edit(database, id, title, author, existingGenre, cover)
  }

  fun savePreview(database: LibraryDatabase, id: String, chapterId: String, offset: Int): BookEntity {
    val dao = database.libraryDao()
    database.runInTransaction {
      val book = dao.getBook(id) ?: missing()
      if (book.parserVersion == null || book.importState == "deleting") missing()
      val chapter = dao.getChapter(id, chapterId) ?: missing()
      val count = dao.countBlocks(chapterId)
      if (offset !in 0 until count) throw PreparationFailure("BOOK_POSITION_INVALID", "That text location is no longer available.")
      val total = dao.countBookBlocks(id).coerceAtLeast(1)
      val progress = if (book.progressPercent == 100) 100 else ((dao.countBlocksBefore(id, chapter.ordinal) + offset).toLong() * 100 / total).toInt().coerceIn(0, 99)
      dao.savePreview(id, chapterId, offset, progress, System.currentTimeMillis())
    }
    return dao.getBook(id) ?: missing()
  }

  fun saveReadingPosition(
    database: LibraryDatabase,
    id: String,
    chapterId: String,
    sentenceIndex: Int,
    audioOffsetMs: Long,
  ): ReadingPositionEntity {
    val dao = database.libraryDao()
    lateinit var position: ReadingPositionEntity
    database.runInTransaction {
      val book = dao.getBook(id) ?: missing()
      if (book.parserVersion == null || book.importState == "deleting") missing()
      val chapter = dao.getChapter(id, chapterId) ?: missing()
      val chapterSentences = dao.countChapterSentences(chapterId)
      if (sentenceIndex !in 0 until chapterSentences) {
        throw PreparationFailure("BOOK_POSITION_INVALID", "That sentence is no longer available.")
      }
      val blockOrdinal = dao.blockOrdinalForSentence(chapterId, sentenceIndex)
        ?: throw PreparationFailure("BOOK_POSITION_INVALID", "That sentence is no longer available.")
      val now = System.currentTimeMillis()
      position = ReadingPositionEntity().apply {
        bookId = id
        this.chapterId = chapterId
        this.sentenceIndex = sentenceIndex
        this.audioOffsetMs = audioOffsetMs.coerceAtLeast(0L)
        updatedAt = now
      }
      dao.saveReadingPosition(position)
      val total = dao.countBookSentences(id).coerceAtLeast(1)
      val completed = dao.countSentencesBeforeChapter(id, chapter.ordinal) + sentenceIndex
      val progress = if (book.progressPercent == 100) 100
        else (completed.toLong() * 100 / total).toInt().coerceIn(0, 99)
      dao.savePreview(id, chapterId, (blockOrdinal / 24) * 24, progress, now)
    }
    return position
  }
  private fun missing(): Nothing = throw PreparationFailure("BOOK_NOT_FOUND", "This book or its prepared text is no longer available.")
}
