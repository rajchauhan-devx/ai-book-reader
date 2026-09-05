package com.aireader

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.StatFs
import androidx.core.content.FileProvider
import androidx.work.WorkManager
import com.aireader.library.BookEntity
import com.aireader.library.LibraryDatabase
import com.aireader.library.ReadingPositionEntity
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.Executors
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream

class StorageBackupModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val executor = Executors.newSingleThreadExecutor()
  private val database by lazy { LibraryDatabase.get(reactApplicationContext) }

  override fun getName(): String = "StorageBackup"

  private fun getFolderSize(dir: File): Long {
    if (!dir.exists()) return 0L
    var size = 0L
    val files = dir.listFiles() ?: return 0L
    for (file in files) {
      size += if (file.isDirectory) getFolderSize(file) else file.length()
    }
    return size
  }

  @ReactMethod
  fun getStorageBreakdown(promise: Promise) {
    executor.execute {
      try {
        val filesDir = reactApplicationContext.filesDir
        val modelsDir = File(filesDir, "model-packs")
        val audioDir = File(filesDir, "audio")
        val booksDir = File(filesDir, "books")
        val dbFile = reactApplicationContext.getDatabasePath("ai-reader-library.db")
        val dbWal = reactApplicationContext.getDatabasePath("ai-reader-library.db-wal")
        val dbShm = reactApplicationContext.getDatabasePath("ai-reader-library.db-shm")

        val modelsBytes = getFolderSize(modelsDir)
        val audioBytes = getFolderSize(audioDir)
        val booksBytes = getFolderSize(booksDir)
        val databaseBytes = (if (dbFile.exists()) dbFile.length() else 0L) +
          (if (dbWal.exists()) dbWal.length() else 0L) +
          (if (dbShm.exists()) dbShm.length() else 0L)

        val freeBytes = filesDir.usableSpace
        val totalBytes = filesDir.totalSpace

        val dao = database.libraryDao()
        val books = dao.listBooks()
        val bookBreakdown = Arguments.createArray()

        for (b in books) {
          val bookSourceFile = File(filesDir, b.storedFilePath)
          val bookSourceSize = if (bookSourceFile.exists()) bookSourceFile.length() else b.sourceSizeBytes
          val bookAudioDir = File(audioDir, b.id)
          val bookAudioSize = getFolderSize(bookAudioDir)

          val bookMap = Arguments.createMap().apply {
            putString("id", b.id)
            putString("title", b.title)
            putString("author", b.author)
            putString("format", b.format)
            putDouble("sourceSizeBytes", bookSourceSize.toDouble())
            putDouble("audioSizeBytes", bookAudioSize.toDouble())
            putInt("progressPercent", b.progressPercent)
          }
          bookBreakdown.pushMap(bookMap)
        }

        val result = Arguments.createMap().apply {
          putDouble("modelsBytes", modelsBytes.toDouble())
          putDouble("audioBytes", audioBytes.toDouble())
          putDouble("booksBytes", booksBytes.toDouble())
          putDouble("databaseBytes", databaseBytes.toDouble())
          putDouble("freeBytes", freeBytes.toDouble())
          putDouble("totalBytes", totalBytes.toDouble())
          putArray("books", bookBreakdown)
        }

        promise.resolve(result)
      } catch (e: Exception) {
        promise.reject("STORAGE_INFO_FAILED", "Failed to retrieve storage breakdown.", e)
      }
    }
  }

  @ReactMethod
  fun deleteBookAudio(bookId: String, promise: Promise) {
    executor.execute {
      try {
        val audioDir = File(reactApplicationContext.filesDir, "audio/$bookId")
        val deleted = if (audioDir.exists()) audioDir.deleteRecursively() else true
        promise.resolve(deleted)
      } catch (e: Exception) {
        promise.reject("AUDIO_DELETE_FAILED", "Failed to delete audio for book $bookId.", e)
      }
    }
  }

  @ReactMethod
  fun exportBackup(
    includeAudio: Boolean,
    annotationsJson: String,
    preferencesJson: String,
    promise: Promise
  ) {
    executor.execute {
      try {
        val filesDir = reactApplicationContext.filesDir
        val backupDir = File(reactApplicationContext.cacheDir, "backups").apply { mkdirs() }
        val timestamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
        val backupFile = File(backupDir, "aireader_backup_$timestamp.aireader.zip")

        val dao = database.libraryDao()
        val books = dao.listBooks()
        val positions = mutableListOf<ReadingPositionEntity>()
        for (b in books) {
          dao.getReadingPosition(b.id)?.let { positions.add(it) }
        }

        // 1. Build database JSON dump
        val dbDump = JSONObject().apply {
          val booksArray = JSONArray()
          for (b in books) {
            val bookObj = JSONObject().apply {
              put("id", b.id)
              put("sourceSha256", b.sourceSha256)
              put("storedFilePath", b.storedFilePath)
              put("sourceFileName", b.sourceFileName)
              put("sourceSizeBytes", b.sourceSizeBytes)
              put("mimeType", b.mimeType)
              put("format", b.format)
              put("title", b.title)
              put("author", b.author)
              put("genre", b.genre)
              put("coverChoice", b.coverChoice)
              put("coverImagePath", b.coverImagePath)
              put("progressPercent", b.progressPercent)
              put("createdAt", b.createdAt)
              put("updatedAt", b.updatedAt)
            }
            booksArray.put(bookObj)
          }
          put("books", booksArray)

          val posArray = JSONArray()
          for (p in positions) {
            val posObj = JSONObject().apply {
              put("bookId", p.bookId)
              put("chapterId", p.chapterId)
              put("sentenceIndex", p.sentenceIndex)
              put("audioOffsetMs", p.audioOffsetMs)
              put("updatedAt", p.updatedAt)
            }
            posArray.put(posObj)
          }
          put("readingPositions", posArray)
        }

        // 2. Build Manifest
        val isoFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
          timeZone = TimeZone.getTimeZone("UTC")
        }
        val manifest = JSONObject().apply {
          put("version", 1)
          put("appVersion", "0.0.1")
          put("createdAt", isoFormat.format(Date()))
          put("bookCount", books.size)
          put("hasAudio", includeAudio)
        }

        // 3. Write Zip Archive
        ZipOutputStream(BufferedOutputStream(FileOutputStream(backupFile))).use { zos ->
          // Write manifest.json
          addZipEntry(zos, "manifest.json", manifest.toString(2).toByteArray(Charsets.UTF_8))
          // Write database_export.json
          addZipEntry(zos, "database_export.json", dbDump.toString(2).toByteArray(Charsets.UTF_8))
          // Write annotations.json
          addZipEntry(zos, "annotations.json", annotationsJson.toByteArray(Charsets.UTF_8))
          // Write preferences.json
          addZipEntry(zos, "preferences.json", preferencesJson.toByteArray(Charsets.UTF_8))

          // Add book source files & covers
          val booksDir = File(filesDir, "books")
          if (booksDir.exists()) {
            addFolderToZip(zos, booksDir, "books")
          }

          // Add audio if requested
          if (includeAudio) {
            val audioDir = File(filesDir, "audio")
            if (audioDir.exists()) {
              addFolderToZip(zos, audioDir, "audio")
            }
          }
        }

        // 4. Share via FileProvider & Intent
        val uri = FileProvider.getUriForFile(
          reactApplicationContext,
          "${reactApplicationContext.packageName}.fileprovider",
          backupFile
        )

        val sendIntent = Intent(Intent.ACTION_SEND).apply {
          type = "application/zip"
          putExtra(Intent.EXTRA_STREAM, uri)
          putExtra(Intent.EXTRA_SUBJECT, "AI Book Reader Backup - $timestamp")
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }

        val chooser = Intent.createChooser(sendIntent, "Save or Export Backup").apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        reactApplicationContext.startActivity(chooser)

        val res = Arguments.createMap().apply {
          putString("filePath", backupFile.absolutePath)
          putString("uri", uri.toString())
          putDouble("sizeBytes", backupFile.length().toDouble())
          putInt("bookCount", books.size)
        }
        promise.resolve(res)
      } catch (e: Exception) {
        promise.reject("BACKUP_EXPORT_FAILED", "Failed to export backup archive.", e)
      }
    }
  }

  @ReactMethod
  fun previewBackup(fileUriString: String, promise: Promise) {
    executor.execute {
      try {
        val inputStream = openInputStreamFromUri(fileUriString)
          ?: throw IllegalArgumentException("Cannot open backup file from URI: $fileUriString")

        var manifestJson: JSONObject? = null
        var totalSize = 0L
        val existingTitles = database.libraryDao().listBooks().map { it.title.lowercase(Locale.ROOT) }.toSet()
        val existingHashes = database.libraryDao().listBooks().map { it.sourceSha256 }.toSet()
        val conflicts = Arguments.createArray()

        ZipInputStream(BufferedInputStream(inputStream)).use { zis ->
          var entry: ZipEntry? = zis.nextEntry
          while (entry != null) {
            val entryName = entry.name
            if (entryName.contains("..") || entryName.startsWith("/") || entryName.startsWith("\\") || entryName.contains("\u0000")) {
              throw SecurityException("Unsafe entry path in backup archive: $entryName")
            }
            totalSize += entry.size.coerceAtLeast(0L)
            if (entryName == "manifest.json") {
              val content = zis.readBytes().toString(Charsets.UTF_8)
              manifestJson = JSONObject(content)
            } else if (entryName == "database_export.json") {
              val content = zis.readBytes().toString(Charsets.UTF_8)
              val dbDump = JSONObject(content)
              val books = dbDump.optJSONArray("books") ?: JSONArray()
              for (i in 0 until books.length()) {
                val b = books.getJSONObject(i)
                val title = b.optString("title")
                val hash = b.optString("sourceSha256")
                if (title.lowercase(Locale.ROOT) in existingTitles || hash in existingHashes) {
                  conflicts.pushString(title)
                }
              }
            }
            zis.closeEntry()
            entry = zis.nextEntry
          }
        }

        if (manifestJson == null) {
          throw IllegalArgumentException("Invalid backup: manifest.json not found.")
        }

        val result = Arguments.createMap().apply {
          putInt("version", manifestJson!!.optInt("version", 1))
          putString("appVersion", manifestJson!!.optString("appVersion", "0.0.1"))
          putString("createdAt", manifestJson!!.optString("createdAt", ""))
          putInt("bookCount", manifestJson!!.optInt("bookCount", 0))
          putBoolean("hasAudio", manifestJson!!.optBoolean("hasAudio", false))
          putDouble("totalSizeBytes", totalSize.toDouble())
          putArray("conflicts", conflicts)
        }
        promise.resolve(result)
      } catch (e: Exception) {
        promise.reject("BACKUP_PREVIEW_FAILED", e.message ?: "Failed to inspect backup file.", e)
      }
    }
  }

  @ReactMethod
  fun restoreBackup(fileUriString: String, conflictStrategy: String, promise: Promise) {
    executor.execute {
      try {
        val stagingDir = File(reactApplicationContext.cacheDir, "restore_staging").apply {
          if (exists()) deleteRecursively()
          mkdirs()
        }

        val inputStream = openInputStreamFromUri(fileUriString)
          ?: throw IllegalArgumentException("Cannot open backup file: $fileUriString")

        // 1. Unpack Zip with Zip Slip & Directory Traversal Protection
        val stagingCanonical = stagingDir.canonicalFile
        ZipInputStream(BufferedInputStream(inputStream)).use { zis ->
          var entry: ZipEntry? = zis.nextEntry
          while (entry != null) {
            val entryName = entry.name
            if (entryName.contains("..") || entryName.startsWith("/") || entryName.startsWith("\\") || entryName.contains("\u0000")) {
              throw SecurityException("Unsafe entry path in backup archive: $entryName")
            }
            val file = File(stagingDir, entryName).canonicalFile
            if (!file.path.startsWith(stagingCanonical.path + File.separator) && file != stagingCanonical) {
              throw SecurityException("Zip slip detected in entry: $entryName")
            }
            if (entry.isDirectory) {
              file.mkdirs()
            } else {
              file.parentFile?.mkdirs()
              FileOutputStream(file).use { fos ->
                zis.copyTo(fos)
              }
            }
            zis.closeEntry()
            entry = zis.nextEntry
          }
        }

        // 2. Validate manifest
        val manifestFile = File(stagingDir, "manifest.json")
        if (!manifestFile.exists()) {
          throw IllegalArgumentException("Corrupt backup: missing manifest.json")
        }

        // 3. Read Database Export
        val dbFile = File(stagingDir, "database_export.json")
        var restoredBookCount = 0
        if (dbFile.exists()) {
          val dbDump = JSONObject(dbFile.readText(Charsets.UTF_8))
          val booksArray = dbDump.optJSONArray("books") ?: JSONArray()
          val dao = database.libraryDao()

          database.runInTransaction {
            for (i in 0 until booksArray.length()) {
              val b = booksArray.getJSONObject(i)
              val id = b.getString("id")
              val existing = dao.getBook(id)

              if (existing != null && conflictStrategy != "replace") {
                // Keep existing book
                continue
              }

              val entity = BookEntity().apply {
                this.id = id
                this.sourceSha256 = b.optString("sourceSha256")
                this.storedFilePath = b.optString("storedFilePath")
                this.sourceFileName = b.optString("sourceFileName")
                this.sourceSizeBytes = b.optLong("sourceSizeBytes", 0L)
                this.mimeType = b.optString("mimeType", "application/epub+zip")
                this.format = b.optString("format", "epub")
                this.title = b.optString("title", "Untitled")
                this.author = b.optString("author", "Unknown author")
                this.genre = b.optString("genre", "Uncategorized")
                this.coverChoice = b.optInt("coverChoice", 0)
                this.coverImagePath = b.optString("coverImagePath").takeIf { it.isNotEmpty() }
                this.importState = "ready"
                this.preparationProgress = 100
                this.progressPercent = b.optInt("progressPercent", 0)
                this.createdAt = b.optLong("createdAt", System.currentTimeMillis())
                this.updatedAt = b.optLong("updatedAt", System.currentTimeMillis())
              }

              if (existing != null) {
                dao.deleteBook(id)
              }
              dao.insertBook(entity)
              restoredBookCount++
            }

            // Restore reading positions
            val posArray = dbDump.optJSONArray("readingPositions") ?: JSONArray()
            for (i in 0 until posArray.length()) {
              val p = posArray.getJSONObject(i)
              val posEntity = ReadingPositionEntity().apply {
                bookId = p.getString("bookId")
                chapterId = p.getString("chapterId")
                sentenceIndex = p.getInt("sentenceIndex")
                audioOffsetMs = p.optLong("audioOffsetMs", 0L)
                updatedAt = p.optLong("updatedAt", System.currentTimeMillis())
              }
              dao.saveReadingPosition(posEntity)
            }
          }
        }

        // 4. Copy Books to filesDir/books/
        val stagingBooks = File(stagingDir, "books")
        if (stagingBooks.exists()) {
          val targetBooks = File(reactApplicationContext.filesDir, "books")
          stagingBooks.copyRecursively(targetBooks, overwrite = true)
        }

        // 5. Copy Audio if present
        val stagingAudio = File(stagingDir, "audio")
        if (stagingAudio.exists()) {
          val targetAudio = File(reactApplicationContext.filesDir, "audio")
          stagingAudio.copyRecursively(targetAudio, overwrite = true)
        }

        // 6. Read annotations & preferences to return to JS
        val annotationsFile = File(stagingDir, "annotations.json")
        val annotationsJson = if (annotationsFile.exists()) annotationsFile.readText(Charsets.UTF_8) else ""

        val preferencesFile = File(stagingDir, "preferences.json")
        val preferencesJson = if (preferencesFile.exists()) preferencesFile.readText(Charsets.UTF_8) else ""

        // Cleanup staging
        stagingDir.deleteRecursively()

        val result = Arguments.createMap().apply {
          putInt("restoredBooks", restoredBookCount)
          putString("annotationsJson", annotationsJson)
          putString("preferencesJson", preferencesJson)
        }
        promise.resolve(result)
      } catch (e: Exception) {
        promise.reject("BACKUP_RESTORE_FAILED", e.message ?: "Failed to restore backup archive.", e)
      }
    }
  }

  @ReactMethod
  fun exportDiagnostics(sanitizedDataJson: String, promise: Promise) {
    executor.execute {
      try {
        val filesDir = reactApplicationContext.filesDir
        val cacheDir = reactApplicationContext.cacheDir
        val diagFile = File(cacheDir, "aireader_diagnostics.txt")

        val actManager = reactApplicationContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val memInfo = ActivityManager.MemoryInfo()
        actManager.getMemoryInfo(memInfo)

        val totalRamMb = memInfo.totalMem / (1024 * 1024)
        val availRamMb = memInfo.availMem / (1024 * 1024)

        val modelsDir = File(filesDir, "model-packs")
        val audioDir = File(filesDir, "audio")
        val booksDir = File(filesDir, "books")

        val timestamp = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(Date())

        val report = buildString {
          appendLine("=== AI BOOK READER DIAGNOSTICS REPORT ===")
          appendLine("Generated: $timestamp")
          appendLine("Privacy notice: This report strictly excludes book titles, book content, notes, and voice audio.")
          appendLine()
          appendLine("--- DEVICE SPECIFICATIONS ---")
          appendLine("Manufacturer: ${Build.MANUFACTURER}")
          appendLine("Brand / Model: ${Build.BRAND} ${Build.MODEL}")
          appendLine("Android OS: ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})")
          appendLine("Device Codename: ${Build.DEVICE}")
          appendLine("Total RAM: ${totalRamMb} MB")
          appendLine("Available RAM: ${availRamMb} MB")
          appendLine("Low Memory Warning: ${memInfo.lowMemory}")
          appendLine()
          appendLine("--- STORAGE METRICS ---")
          appendLine("Internal Storage Total: ${filesDir.totalSpace / (1024 * 1024)} MB")
          appendLine("Internal Storage Free: ${filesDir.usableSpace / (1024 * 1024)} MB")
          appendLine("Voice Models Installed: ${getFolderSize(modelsDir) / (1024 * 1024)} MB")
          appendLine("Generated Audio Cache: ${getFolderSize(audioDir) / (1024 * 1024)} MB")
          appendLine("Books & Covers Storage: ${getFolderSize(booksDir) / (1024 * 1024)} MB")
          appendLine()
          appendLine("--- APP RUNTIME METRICS (SANITIZED) ---")
          try {
            val json = JSONObject(sanitizedDataJson)
            val keys = json.keys()
            while (keys.hasNext()) {
              val key = keys.next()
              appendLine("$key: ${json.opt(key)}")
            }
          } catch (_: Exception) {
            appendLine("App Data: $sanitizedDataJson")
          }
          appendLine()
          appendLine("=== END OF REPORT ===")
        }

        diagFile.writeText(report, Charsets.UTF_8)

        val uri = FileProvider.getUriForFile(
          reactApplicationContext,
          "${reactApplicationContext.packageName}.fileprovider",
          diagFile
        )

        val sendIntent = Intent(Intent.ACTION_SEND).apply {
          type = "text/plain"
          putExtra(Intent.EXTRA_STREAM, uri)
          putExtra(Intent.EXTRA_SUBJECT, "AI Book Reader Diagnostics")
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }

        val chooser = Intent.createChooser(sendIntent, "Share Diagnostics Report").apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        reactApplicationContext.startActivity(chooser)

        promise.resolve(uri.toString())
      } catch (e: Exception) {
        promise.reject("DIAGNOSTICS_EXPORT_FAILED", "Failed to export diagnostics report.", e)
      }
    }
  }

  @ReactMethod
  fun deleteAllAppData(promise: Promise) {
    executor.execute {
      try {
        // 1. Cancel all background WorkManager jobs
        WorkManager.getInstance(reactApplicationContext).cancelAllWork()

        // 2. Clear database
        database.clearAllTables()

        // 3. Delete files
        val filesDir = reactApplicationContext.filesDir
        File(filesDir, "books").deleteRecursively()
        File(filesDir, "audio").deleteRecursively()
        File(filesDir, "model-packs").deleteRecursively()

        // 4. Delete cache
        reactApplicationContext.cacheDir.deleteRecursively()

        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("DELETE_ALL_FAILED", "Failed to completely delete application data.", e)
      }
    }
  }

  private fun openInputStreamFromUri(uriString: String): InputStream? {
    return try {
      if (uriString.startsWith("content://") || uriString.startsWith("file://")) {
        reactApplicationContext.contentResolver.openInputStream(Uri.parse(uriString))
      } else {
        FileInputStream(File(uriString))
      }
    } catch (_: Exception) {
      null
    }
  }

  private fun addZipEntry(zos: ZipOutputStream, name: String, bytes: ByteArray) {
    val entry = ZipEntry(name).apply {
      time = System.currentTimeMillis()
      size = bytes.size.toLong()
    }
    zos.putNextEntry(entry)
    zos.write(bytes)
    zos.closeEntry()
  }

  private fun addFolderToZip(zos: ZipOutputStream, folder: File, baseName: String) {
    val files = folder.listFiles() ?: return
    for (file in files) {
      val entryName = "$baseName/${file.name}"
      if (file.isDirectory) {
        addFolderToZip(zos, file, entryName)
      } else {
        val entry = ZipEntry(entryName).apply {
          time = file.lastModified()
          size = file.length()
        }
        zos.putNextEntry(entry)
        FileInputStream(file).use { fis ->
          fis.copyTo(zos)
        }
        zos.closeEntry()
      }
    }
  }
}
