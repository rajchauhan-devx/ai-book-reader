package com.aireader.library;

import androidx.annotation.Nullable;
import androidx.room.Dao;
import androidx.room.Insert;
import androidx.room.OnConflictStrategy;
import androidx.room.Query;
import java.util.List;

@Dao
public interface LibraryDao {
  @Query("SELECT * FROM books WHERE importState != 'deleting' ORDER BY COALESCE(lastOpenedAt, updatedAt) DESC")
  List<BookEntity> listBooks();

  @Query("SELECT * FROM books WHERE importState = 'deleting'")
  List<BookEntity> listDeletingBooks();

  @Query("UPDATE books SET importState = 'deleting' WHERE id = :bookId")
  void markBookDeleting(String bookId);

  @Nullable
  @Query("SELECT * FROM books WHERE id = :bookId LIMIT 1")
  BookEntity getBook(String bookId);

  @Nullable
  @Query("SELECT * FROM books WHERE sourceSha256 = :sha256 AND importState != 'deleting' LIMIT 1")
  BookEntity findBookBySha256(String sha256);

  @Insert(onConflict = OnConflictStrategy.ABORT)
  void insertBook(BookEntity book);

  @Query("DELETE FROM books WHERE id = :bookId")
  int deleteBook(String bookId);

  @Nullable
  @Query("SELECT * FROM reading_positions WHERE bookId = :bookId LIMIT 1")
  ReadingPositionEntity getReadingPosition(String bookId);

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  void saveReadingPosition(ReadingPositionEntity position);

  @Query("UPDATE books SET preparationId = :token, importState = 'queued', preparationProgress = 0, preparationMessage = 'Waiting to prepare text', failureCode = NULL, failureMessage = NULL WHERE id = :bookId AND importState NOT IN ('ready', 'deleting')")
  int queuePreparation(String bookId, String token);

  @Query("UPDATE books SET importState = 'parsing', preparationProgress = :progress, preparationMessage = :message WHERE id = :bookId AND preparationId = :token AND importState != 'deleting'")
  int updatePreparation(String bookId, String token, int progress, String message);

  @Query("UPDATE books SET preparationId = NULL, importState = CASE WHEN parserVersion IS NOT NULL THEN 'ready' ELSE :state END, preparationProgress = 0, preparationMessage = NULL, failureCode = :code, failureMessage = :message WHERE id = :bookId AND preparationId = :token AND importState != 'deleting'")
  int stopPreparation(String bookId, String token, String state, String code, String message);

  @Query("UPDATE books SET preparationId = NULL, importState = 'ready', parserVersion = :version, preparationProgress = 100, preparationMessage = 'Text is ready', failureCode = NULL, failureMessage = NULL, updatedAt = :now WHERE id = :bookId AND preparationId = :token AND importState != 'deleting'")
  int completePreparation(String bookId, String token, String version, long now);

  @Query("DELETE FROM chapters WHERE bookId = :bookId")
  void deleteChapters(String bookId);

  @Insert void insertChapters(List<ChapterEntity> chapters);
  @Insert void insertBlocks(List<ContentBlockEntity> blocks);
  @Insert void insertSentences(List<SentenceEntity> sentences);

  @Query("SELECT * FROM chapters WHERE bookId = :bookId ORDER BY ordinal")
  List<ChapterEntity> listChapters(String bookId);

  @Nullable
  @Query("SELECT * FROM chapters WHERE bookId = :bookId AND id = :chapterId LIMIT 1")
  ChapterEntity getChapter(String bookId, String chapterId);

  @Query("SELECT * FROM content_blocks WHERE chapterId = :chapterId ORDER BY ordinal LIMIT :limit OFFSET :offset")
  List<ContentBlockEntity> getBlocks(String chapterId, int offset, int limit);

  @Query("SELECT COUNT(*) FROM content_blocks WHERE chapterId = :chapterId")
  int countBlocks(String chapterId);

  @Query("UPDATE books SET preparationId = :token, importState = 'queued', preparationProgress = 0, preparationMessage = 'Waiting to prepare again', failureCode = NULL, failureMessage = NULL WHERE id = :bookId AND importState = 'ready'")
  int queueReprocessing(String bookId, String token);

  @Query("UPDATE books SET title = :title, author = :author, genre = :genre, metadataEdited = 1, coverChoice = :coverChoice, updatedAt = :now WHERE id = :bookId AND importState != 'deleting'")
  int editMetadata(String bookId, String title, String author, String genre, int coverChoice, long now);

  @Query("SELECT DISTINCT genre FROM books WHERE importState != 'deleting' AND genre IS NOT NULL AND genre != '' ORDER BY genre ASC")
  List<String> listGenres();

  @Query("SELECT * FROM books WHERE importState != 'deleting' AND genre = :genre ORDER BY COALESCE(lastOpenedAt, updatedAt) DESC")
  List<BookEntity> listBooksByGenre(String genre);

  @Query("UPDATE books SET title = CASE WHEN metadataEdited = 0 THEN COALESCE(:title, title) ELSE title END, author = CASE WHEN metadataEdited = 0 THEN COALESCE(:author, author) ELSE author END, coverImagePath = COALESCE(:coverPath, coverImagePath), parsingWarnings = :warnings, previewChapterId = :chapterId, previewBlockOffset = :offset, progressPercent = :progress WHERE id = :bookId")
  void applyDocumentInfo(String bookId, String title, String author, String coverPath, String warnings, String chapterId, int offset, int progress);

  @Query("UPDATE books SET previewChapterId = :chapterId, previewBlockOffset = :offset, progressPercent = :progress, lastOpenedAt = :now WHERE id = :bookId AND parserVersion IS NOT NULL AND importState != 'deleting'")
  int savePreview(String bookId, String chapterId, int offset, int progress, long now);

  @Query("SELECT COUNT(*) FROM content_blocks b INNER JOIN chapters c ON c.id = b.chapterId WHERE c.bookId = :bookId AND c.ordinal < :chapterOrdinal")
  int countBlocksBefore(String bookId, int chapterOrdinal);

  @Query("SELECT COUNT(*) FROM content_blocks b INNER JOIN chapters c ON c.id = b.chapterId WHERE c.bookId = :bookId")
  int countBookBlocks(String bookId);

  @Query("SELECT s.* FROM sentences s INNER JOIN content_blocks b ON b.id = s.blockId WHERE b.chapterId = :chapterId ORDER BY b.ordinal, s.ordinal")
  List<SentenceEntity> chapterSentences(String chapterId);

  @Query("SELECT * FROM sentences WHERE blockId = :blockId ORDER BY ordinal")
  List<SentenceEntity> blockSentences(String blockId);

  @Query("SELECT COUNT(*) FROM sentences s INNER JOIN content_blocks b ON b.id = s.blockId WHERE b.chapterId = :chapterId AND b.ordinal < :blockOrdinal")
  int countSentencesBeforeBlock(String chapterId, int blockOrdinal);

  @Query("SELECT COUNT(*) FROM sentences s INNER JOIN content_blocks b ON b.id = s.blockId WHERE b.chapterId = :chapterId")
  int countChapterSentences(String chapterId);

  @Nullable
  @Query("SELECT b.ordinal FROM sentences s INNER JOIN content_blocks b ON b.id = s.blockId WHERE b.chapterId = :chapterId ORDER BY b.ordinal, s.ordinal LIMIT 1 OFFSET :sentenceIndex")
  Integer blockOrdinalForSentence(String chapterId, int sentenceIndex);

  @Query("SELECT COUNT(*) FROM sentences s INNER JOIN content_blocks b ON b.id = s.blockId INNER JOIN chapters c ON c.id = b.chapterId WHERE c.bookId = :bookId AND c.ordinal < :chapterOrdinal")
  int countSentencesBeforeChapter(String bookId, int chapterOrdinal);

  @Query("SELECT COUNT(*) FROM sentences s INNER JOIN content_blocks b ON b.id = s.blockId INNER JOIN chapters c ON c.id = b.chapterId WHERE c.bookId = :bookId")
  int countBookSentences(String bookId);

  @Query("DELETE FROM reading_positions WHERE bookId = :bookId")
  void clearReadingPosition(String bookId);

  @Query("UPDATE sentences SET normalizedText = :normalizedText WHERE id = :sentenceId")
  void updateSentenceNormalizedText(String sentenceId, String normalizedText);

  @Query("UPDATE books SET progressPercent = :progress, updatedAt = :now WHERE id = :bookId AND parserVersion IS NOT NULL AND importState != 'deleting'")
  int markProgress(String bookId, int progress, long now);
}
