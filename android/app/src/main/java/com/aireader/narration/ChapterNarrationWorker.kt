package com.aireader.narration

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import androidx.work.Data
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.aireader.KokoroOnnxEngine
import com.aireader.ModelPackCatalog
import com.aireader.ModelPackStore
import com.aireader.WavAudio
import com.aireader.library.LibraryDatabase
import java.io.File
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit

class ChapterNarrationWorker(context: Context, parameters: WorkerParameters) : Worker(context, parameters) {

  companion object {
    private val inferenceSlot = Semaphore(1)
    private const val MIN_STORAGE_RESERVE = 64L * 1024L * 1024L // 64 MB
  }

  private val cacheStore = AudioCacheStore(applicationContext)
  private val store = ModelPackStore(applicationContext)

  override fun doWork(): Result {
    val bookId = inputData.getString("bookId") ?: return Result.failure()
    val chapterId = inputData.getString("chapterId") ?: return Result.failure()
    val voiceId = inputData.getString("voiceId") ?: "af_heart"
    val expression = inputData.getString("expression") ?: "natural"

    val database = LibraryDatabase.get(applicationContext)
    val dao = database.libraryDao()
    val sentences = dao.chapterSentences(chapterId)
    val totalSentences = sentences.size

    if (totalSentences == 0) {
      reportProgress("ready", bookId, chapterId, voiceId, 0, 0, 1.0, "", "No sentences to prepare")
      return Result.success()
    }

    if (!store.isInstalled()) {
      reportProgress("failed", bookId, chapterId, voiceId, 0, totalSentences, 0.0, "", "Kokoro voice model is not installed. Please download it in Model Setup.")
      return Result.failure()
    }

    var acquired = false
    var engine: KokoroOnnxEngine? = null

    try {
      while (!acquired) {
        checkCancellation()
        acquired = inferenceSlot.tryAcquire(200, TimeUnit.MILLISECONDS)
      }

      checkCancellation()
      checkDeviceHealth()

      val voiceProfile = VoiceCatalog.findVoice(voiceId)
      val expressionPreset = VoiceCatalog.findExpression(expression)

      var readyCount = 0

      for ((index, sentence) in sentences.withIndex()) {
        checkCancellation()
        checkDeviceHealth()

        val normalized = if (sentence.normalizedText.isNotBlank()) {
          TextNormalizer.normalize(sentence.normalizedText)
        } else {
          TextNormalizer.normalize(sentence.text)
        }

        if (normalized.isBlank()) {
          readyCount++
          continue
        }

        val cacheKey = cacheStore.computeCacheKey(
          normalizedText = normalized,
          modelPackId = "kokoro-82m",
          modelVersion = ModelPackCatalog.PACK_VERSION,
          voiceId = voiceProfile.id,
          expression = expressionPreset.id,
        )

        val targetFile = cacheStore.segmentFile(bookId, voiceProfile.id, chapterId, index, cacheKey)

        if (cacheStore.isValidWav(targetFile)) {
          readyCount++
          val progressFraction = readyCount.toDouble() / totalSentences.toDouble()
          reportProgress(
            "generating",
            bookId,
            chapterId,
            voiceProfile.id,
            readyCount,
            totalSentences,
            progressFraction,
            sentence.text,
            "Already cached ($readyCount / $totalSentences)",
          )
          continue
        }

        val progressFraction = readyCount.toDouble() / totalSentences.toDouble()
        reportProgress(
          "generating",
          bookId,
          chapterId,
          voiceProfile.id,
          readyCount,
          totalSentences,
          progressFraction,
          sentence.text,
          "Generating sentence ${index + 1} of $totalSentences",
        )

        val tempOutput = File(applicationContext.cacheDir, "narration-working/temp_${System.currentTimeMillis()}.wav")
        tempOutput.parentFile?.mkdirs()

        if (engine == null) {
          engine = KokoroOnnxEngine(store)
        }
        val generated = engine.generate(
          text = normalized,
          voiceId = voiceProfile.id,
          speed = 1.0f,
          isCancelled = { isStopped || Thread.currentThread().isInterrupted },
          onProgress = { _, _ -> },
        )
        WavAudio.writeMonoPcm16(tempOutput, generated.samples)

        if (cacheStore.isValidWav(tempOutput)) {
          targetFile.parentFile?.mkdirs()
          tempOutput.renameTo(targetFile)
          readyCount++
        } else {
          tempOutput.delete()
        }
      }

      reportProgress(
        "ready",
        bookId,
        chapterId,
        voiceProfile.id,
        readyCount,
        totalSentences,
        1.0,
        "",
        "Chapter narration ready ($readyCount / $totalSentences sentences)",
      )
      return Result.success()

    } catch (e: InterruptedException) {
      reportProgress("cancelled", bookId, chapterId, voiceId, 0, totalSentences, 0.0, "", "Narration stopped")
      return Result.failure()
    } catch (e: Exception) {
      if (isStopped) {
        reportProgress("cancelled", bookId, chapterId, voiceId, 0, totalSentences, 0.0, "", "Narration stopped")
      } else {
        reportProgress("failed", bookId, chapterId, voiceId, 0, totalSentences, 0.0, "", e.message ?: "Narration generation failed")
      }
      return Result.failure()
    } finally {
      engine?.close()
      if (acquired) inferenceSlot.release()
    }
  }

  private fun checkCancellation() {
    if (isStopped || Thread.currentThread().isInterrupted) {
      throw InterruptedException("Narration preparation was stopped.")
    }
  }

  private fun checkDeviceHealth() {
    val stat = android.os.StatFs(applicationContext.cacheDir.absolutePath)
    val available = stat.availableBytes
    if (available < MIN_STORAGE_RESERVE) {
      throw IllegalStateException("Low device storage for narration synthesis.")
    }

    val batteryFilter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
    val batteryStatus = applicationContext.registerReceiver(null, batteryFilter)
    val level = batteryStatus?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
    val scale = batteryStatus?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
    val isCharging = batteryStatus?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) == BatteryManager.BATTERY_STATUS_CHARGING
    val batteryPct = if (level >= 0 && scale > 0) (level * 100 / scale) else 100

    if (batteryPct < 10 && !isCharging) {
      throw IllegalStateException("Battery below 10% and not charging.")
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val powerManager = applicationContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
      val thermal = powerManager?.currentThermalStatus ?: PowerManager.THERMAL_STATUS_NONE
      if (thermal >= PowerManager.THERMAL_STATUS_SEVERE) {
        throw IllegalStateException("Device thermal throttling engaged.")
      }
    }
  }

  private fun reportProgress(
    state: String,
    bookId: String,
    chapterId: String,
    voiceId: String,
    readySegments: Int,
    totalSegments: Int,
    progress: Double,
    currentText: String,
    message: String,
  ) {
    val data = Data.Builder()
      .putString("state", state)
      .putString("bookId", bookId)
      .putString("chapterId", chapterId)
      .putString("voiceId", voiceId)
      .putInt("readySegments", readySegments)
      .putInt("totalSegments", totalSegments)
      .putDouble("progress", progress)
      .putString("currentText", currentText)
      .putString("message", message)
      .build()
    setProgressAsync(data)
  }
}
