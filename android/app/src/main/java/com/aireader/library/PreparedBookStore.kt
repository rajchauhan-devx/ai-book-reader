package com.aireader.library

/** One transaction exposes either the complete document or none of it. */
internal object PreparedBookStore {
  fun commit(database: LibraryDatabase, bookId: String, token: String, document: ParsedDocument, coverPath: String? = null, check: () -> Unit) {
    val dao = database.libraryDao()
    database.runInTransaction {
      check()
      val current = dao.getBook(bookId)
      if (current == null || current.preparationId != token || current.importState == "deleting") {
        throw PreparationFailure("BOOK_PREPARATION_CANCELLED", "Text preparation stopped.")
      }
      val oldBlock = current.previewChapterId?.let { dao.getBlocks(it, current.previewBlockOffset, 1).firstOrNull() }
      val oldPosition = dao.getReadingPosition(bookId)
      val oldSentenceIds = oldPosition?.let { dao.chapterSentences(it.chapterId).map { sentence -> sentence.id } }
      val warnings = document.warnings.toMutableList()
      val matched = document.chapters.firstNotNullOfOrNull { chapter ->
        chapter.blocks.indexOfFirst { it.id == oldBlock?.id }.takeIf { it >= 0 }?.let { chapter to it }
      }
      if (current.previewChapterId != null && matched == null) warnings.add("The text layout changed during preparation. Your reading location was reset to the beginning.")
      val newReadingChapter = oldPosition?.let { position -> document.chapters.find { it.id == position.chapterId } }
      if (oldPosition != null && (newReadingChapter == null || newReadingChapter.blocks.flatMap { it.sentences }.map { it.id } != oldSentenceIds)) {
        dao.clearReadingPosition(bookId)
        warnings.add("The saved sentence location no longer matches this extraction and was cleared.")
      }
      dao.deleteChapters(bookId)
      document.chapters.forEachIndexed { chapterIndex, chapter ->
        check()
        dao.insertChapters(listOf(ChapterEntity().apply {
          id = chapter.id; this.bookId = bookId; ordinal = chapterIndex
          title = chapter.title; sourceAnchor = chapter.sourceAnchor
        }))
        chapter.blocks.forEachIndexed { blockIndex, block ->
          check()
          dao.insertBlocks(listOf(ContentBlockEntity().apply {
            id = block.id; chapterId = chapter.id; ordinal = blockIndex
            kind = block.kind; text = block.text; sourceAnchor = block.sourceAnchor; checksum = block.checksum
          }))
          block.sentences.mapIndexed { index, sentence ->
            SentenceEntity().apply {
              id = sentence.id; blockId = block.id; ordinal = index; text = sentence.text
              normalizedText = sentence.normalizedText; sourceAnchor = sentence.sourceAnchor
              normalizedChecksum = sentence.normalizedChecksum
            }
          }.chunked(200).forEach { batch -> check(); dao.insertSentences(batch) }
        }
      }
      check()
      dao.applyDocumentInfo(bookId, document.title, document.author, coverPath, warnings.distinct().joinToString("\n"),
        matched?.first?.id, matched?.second ?: 0,
        if (current.parserVersion == null || matched != null || current.previewChapterId == null) current.progressPercent else 0)
      if (dao.completePreparation(bookId, token, document.parserVersion, System.currentTimeMillis()) != 1) {
        throw PreparationFailure("BOOK_PREPARATION_CANCELLED", "Text preparation stopped.")
      }
    }
  }
}
