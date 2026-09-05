package com.aireader.library

import android.content.Context
import androidx.room.Room
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.UUID

@RunWith(AndroidJUnit4::class)
class LibraryMigrationTest {
  private lateinit var context: Context
  private lateinit var database: LibraryDatabase
  private lateinit var name: String
  private val bookId = "migration-book"

  @Before fun createVersionOneDatabase() = createLegacyDatabase(1)

  private fun createLegacyDatabase(version: Int) {
    val instrumentation = InstrumentationRegistry.getInstrumentation()
    context = instrumentation.targetContext
    name = "reader-test-${UUID.randomUUID()}.db"
    val schema = instrumentation.context.assets.open("com.aireader.library.LibraryDatabase/$version.json").bufferedReader().use {
      JSONObject(it.readText()).getJSONObject("database")
    }
    context.openOrCreateDatabase(name, Context.MODE_PRIVATE, null).use { old ->
      val entities = schema.getJSONArray("entities")
      for (index in 0 until entities.length()) {
        val entity = entities.getJSONObject(index)
        val table = entity.getString("tableName")
        old.execSQL(entity.getString("createSql").replace("\${TABLE_NAME}", table))
        val indices = entity.getJSONArray("indices")
        for (item in 0 until indices.length()) old.execSQL(indices.getJSONObject(item).getString("createSql").replace("\${TABLE_NAME}", table))
      }
      val setup = schema.getJSONArray("setupQueries")
      for (index in 0 until setup.length()) old.execSQL(setup.getString(index))
      old.execSQL("INSERT INTO books (id,sourceSha256,sourceFileName,storedFilePath,mimeType,format,sourceSizeBytes,title,author,importState,progressPercent,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        arrayOf(bookId, "source-hash", "legacy.txt", "books/legacy/source.txt", "text/plain", "txt", 42, "My retained book", "Author", "pending_parse", 17, 1, 2))
      old.version = version
    }
    database = Room.databaseBuilder(context, LibraryDatabase::class.java, name)
      .addMigrations(LibraryDatabase.MIGRATION_1_2, LibraryDatabase.MIGRATION_2_3, LibraryDatabase.MIGRATION_3_4).build()
  }

  @After fun cleanup() { database.close(); context.deleteDatabase(name) }

  private fun document(): ParsedDocument {
    val fixture = File.createTempFile("reader-parser-test-", ".txt", context.cacheDir)
    try {
      fixture.writeText("Chapter 1\n\nHello   world.\n\nChapter 2\n\nनमस्ते, café.")
      return TxtBookParser.parse(fixture, "source-hash")
    } finally { fixture.delete() }
  }

  @Test fun migrationPreservesExistingBookAndValidatesSchema() {
    val book = database.libraryDao().getBook(bookId)!!
    assertEquals("My retained book", book.title)
    assertEquals("books/legacy/source.txt", book.storedFilePath)
    assertEquals(17, book.progressPercent)
    assertEquals(42L, book.sourceSizeBytes)
    assertNull(book.parserVersion)
    assertNull(book.preparationId)
    assertEquals(0, book.preparationProgress)
    assertEquals(4, database.openHelper.readableDatabase.version)
    assertEquals("Uncategorized", book.genre)
    assertEquals(-1, book.coverChoice)
    assertFalse(book.metadataEdited)
    assertEquals(0, book.previewBlockOffset)
  }

  @Test fun migratesVersionTwoLibraryWithoutReset() {
    database.close(); context.deleteDatabase(name)
    createLegacyDatabase(2)
    assertEquals("My retained book", database.libraryDao().getBook(bookId)!!.title)
    assertEquals(4, database.openHelper.readableDatabase.version)
    assertEquals("Uncategorized", database.libraryDao().getBook(bookId)!!.genre)
    assertEquals(-1, database.libraryDao().getBook(bookId)!!.coverChoice)
  }

  @Test fun migratesVersionThreeLibraryWithoutReset() {
    database.close(); context.deleteDatabase(name)
    createLegacyDatabase(3)
    assertEquals("My retained book", database.libraryDao().getBook(bookId)!!.title)
    assertEquals(4, database.openHelper.readableDatabase.version)
    assertEquals("Uncategorized", database.libraryDao().getBook(bookId)!!.genre)
  }

  @Test fun metadataPreviewAndMatchingReprocessingSurviveReopen() {
    val dao = database.libraryDao()
    val token = UUID.randomUUID().toString()
    dao.queuePreparation(bookId, token)
    PreparedBookStore.commit(database, bookId, token, document()) {}
    val chapter = dao.listChapters(bookId)[1]
    LibraryActions.edit(database, bookId, "My edited title", "My author", 2)
    LibraryActions.savePreview(database, bookId, chapter.id, 1)
    val saved = dao.getBook(bookId)!!
    assertTrue(saved.progressPercent > 0)
    assertNotNull(saved.lastOpenedAt)
    dao.saveReadingPosition(ReadingPositionEntity().apply {this.bookId = this@LibraryMigrationTest.bookId; chapterId=chapter.id; sentenceIndex=1})
    val next = UUID.randomUUID().toString()
    dao.queueReprocessing(bookId, next)
    PreparedBookStore.commit(database, bookId, next, document().copy(title="Extracted title",author="Extracted author")) {}
    database.close()
    database = Room.databaseBuilder(context, LibraryDatabase::class.java, name).build()
    val updated=database.libraryDao().getBook(bookId)!!
    assertEquals("My edited title",updated.title);assertEquals("My author",updated.author);assertEquals(2,updated.coverChoice)
    assertEquals(chapter.id,updated.previewChapterId);assertEquals(1,updated.previewBlockOffset)
    assertEquals(saved.progressPercent,updated.progressPercent)
    assertNotNull(database.libraryDao().getReadingPosition(bookId))
  }

  @Test fun changedTextResetsUnmatchedPositionsWithWarning() {
    val dao=database.libraryDao();val token=UUID.randomUUID().toString()
    dao.queuePreparation(bookId,token);PreparedBookStore.commit(database,bookId,token,document()) {}
    val chapter=dao.listChapters(bookId)[1]
    LibraryActions.savePreview(database,bookId,chapter.id,1)
    dao.saveReadingPosition(ReadingPositionEntity().apply {this.bookId=this@LibraryMigrationTest.bookId;chapterId=chapter.id})
    val next=UUID.randomUUID().toString();dao.queueReprocessing(bookId,next)
    val builder=DocumentBuilder("changed") {};builder.chapter("Replacement","changed");builder.block("Different words.","changed:0")
    PreparedBookStore.commit(database,bookId,next,builder.finish("txt-2")) {}
    val updated=dao.getBook(bookId)!!
    assertNull(updated.previewChapterId);assertEquals(0,updated.previewBlockOffset);assertEquals(0,updated.progressPercent)
    assertTrue(updated.parsingWarnings!!.contains("reset"));assertNull(dao.getReadingPosition(bookId))
  }

  @Test fun interruptedReprocessingRetainsOldText() {
    val dao=database.libraryDao();val token=UUID.randomUUID().toString()
    dao.queuePreparation(bookId,token);PreparedBookStore.commit(database,bookId,token,document()) {}
    val oldIds=dao.listChapters(bookId).map {it.id}
    val next=UUID.randomUUID().toString();dao.queueReprocessing(bookId,next)
    var checks=0
    try { PreparedBookStore.commit(database,bookId,next,document()) {if(++checks==5) throw PreparationFailure("STOP","Stopped")};fail("Expected rollback") } catch(_:PreparationFailure) {}
    dao.stopPreparation(bookId,next,"failed","STOP","Stopped")
    assertEquals("ready",dao.getBook(bookId)!!.importState)
    assertEquals(oldIds,dao.listChapters(bookId).map {it.id})
  }

  @Test fun rejectsInvalidMetadataAndForeignPreviewLocation() {
    try {LibraryActions.edit(database,bookId,"  ","Author",0);fail("Empty title accepted")} catch(_:PreparationFailure) {}
    try {LibraryActions.savePreview(database,bookId,"foreign-chapter",0);fail("Foreign location accepted")} catch(_:PreparationFailure) {}
    assertEquals("My retained book",database.libraryDao().getBook(bookId)!!.title)
  }

  @Test fun savesCompleteDocumentAndCascadesRemoval() {
    val dao = database.libraryDao()
    val token = UUID.randomUUID().toString()
    dao.queuePreparation(bookId, token)
    PreparedBookStore.commit(database, bookId, token, document()) {}
    assertEquals("ready", dao.getBook(bookId)!!.importState)
    assertEquals(TxtBookParser.VERSION, dao.getBook(bookId)!!.parserVersion)
    assertNull(dao.getBook(bookId)!!.preparationId)
    assertEquals(2, dao.listChapters(bookId).size)
    database.openHelper.readableDatabase.query("SELECT text, normalizedText, sourceAnchor FROM sentences WHERE text LIKE 'Hello%'").use { cursor ->
      assertTrue(cursor.moveToFirst())
      assertEquals("Hello   world.", cursor.getString(0))
      assertEquals("Hello world.", cursor.getString(1))
      assertTrue(cursor.getString(2).startsWith("txt:utf16:"))
    }
    dao.deleteBook(bookId)
    for (table in listOf("chapters", "content_blocks", "sentences")) {
      database.openHelper.readableDatabase.query("SELECT COUNT(*) FROM $table").use { cursor -> cursor.moveToFirst(); assertEquals(0, cursor.getInt(0)) }
    }
  }

  @Test fun cancellationRollsBackAllDerivedRows() {
    val dao = database.libraryDao()
    val token = UUID.randomUUID().toString()
    dao.queuePreparation(bookId, token)
    var checks = 0
    try {
      PreparedBookStore.commit(database, bookId, token, document()) {
        if (++checks == 5) throw PreparationFailure("TEST_CANCEL", "Stopped")
      }
      fail("Expected rollback")
    } catch (_: PreparationFailure) { }
    assertTrue(dao.listChapters(bookId).isEmpty())
    assertEquals("queued", dao.getBook(bookId)!!.importState)
    assertNull(dao.getBook(bookId)!!.parserVersion)
    PreparedBookStore.commit(database, bookId, token, document()) {}
    assertEquals(2, dao.listChapters(bookId).size)
  }

  @Test fun staleJobCannotOverwriteRetryOrDeletion() {
    val dao = database.libraryDao()
    val oldToken = UUID.randomUUID().toString()
    val newToken = UUID.randomUUID().toString()
    dao.queuePreparation(bookId, oldToken)
    dao.stopPreparation(bookId, oldToken, "pending_parse", "CANCEL", "Stopped")
    dao.queuePreparation(bookId, newToken)
    try { PreparedBookStore.commit(database, bookId, oldToken, document()) {}; fail("Stale job committed") } catch (_: PreparationFailure) { }
    assertEquals(newToken, dao.getBook(bookId)!!.preparationId)
    assertTrue(dao.listChapters(bookId).isEmpty())
    dao.markBookDeleting(bookId)
    try { PreparedBookStore.commit(database, bookId, newToken, document()) {}; fail("Deleted book committed") } catch (_: PreparationFailure) { }
    assertEquals("deleting", dao.getBook(bookId)!!.importState)
    assertTrue(dao.listChapters(bookId).isEmpty())
  }
}
