package com.aireader.narration

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import androidx.work.Data
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.aireader.ChatterboxOnnxEngine
import com.aireader.ModelPackCatalog
import com.aireader.ModelPackStore
import com.aireader.PerformanceMode
import com.aireader.SystemTtsEngine
import com.aireader.WavAudio
import com.aireader.library.LibraryDatabase
import java.io.File
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit

class ChapterNarrationWorker(context: Context, parameters: WorkerParameters) : Worker(context, parameters) {

  companion object {
    private val inferenceSlot = Semaphore(1)
    private const val MIN_STORAGE_RESERVE = 64L * 1024L * 1024L // 64 MB
    private const val MIN_FREE_MEMORY = 1_000L * 1024L * 1024L // 1 GB
  }

  private val cacheStore = AudioCacheStore(applicationContext)
  private val store = ModelPackStore(applicationContext)
  private val systemTts = SystemTtsEngine(applicationContext)

  override fun doWork(): Result {
    val bookId = inputData.getString("bookId") ?: return Result.failure()
    val chapterId = inputData.getString("chapterId") ?: return Result.failure()
    val voiceId = inputData.getString("voiceId") ?: "warm"
    val expression = inputData.getString("expression") ?: "natural"

    val database = LibraryDatabase.get(applicationContext)
    val dao = database.libraryDao()
    val sentences = dao.chapterSentences(chapterId)
    val totalSentences = sentences.size

    if (totalSentences == 0) {
      reportProgress("ready", bookId, chapterId, voiceId, 0, 0, 1.0, "", "No sentences to prepare")
      return Result.success()
    }

    var acquired = false
    var engine: ChatterboxOnnxEngine? = null

    try {
      while (!acquired) {
        checkCancellation()
        acquired = inferenceSlot.tryAcquire(200, TimeUnit.MILLISECONDS)
      }

      checkCancellation()
      checkDeviceHealth()

      val voiceProfile = VoiceCatalog.findVoice(voiceId)
      val expressionPreset = VoiceCatalog.findExpression(expression)
      val useNatural = voiceProfile.engine == "natural" && store.isInstalled() && hasEnoughMemory()

      val referenceAudio = if (useNatural) {
        val refFile = File(applicationContext.filesDir, voiceProfile.referenceAsset ?: "voice/neutral-reference.wav")
        if (!refFile.exists() || refFile.length() < 44) {
          systemTts.synthesizeReference(refFile)
        }
        WavAudio.readMono(refFile)
      } else null

      val performanceMode = PerformanceMode.BALANCED

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
          modelPackId = "chatterbox-nano",
          modelVersion = ModelPackCatalog.PACK_VERSION,
          voiceId = voiceId,
          expression = expressionPreset.id,
        )

        val targetFile = cacheStore.segmentFile(bookId, voiceId, chapterId, index, cacheKey)

        if (cacheStore.isValidWav(targetFile)) {
          readyCount++
          val progressFraction = readyCount.toDouble() / totalSentences.toDouble()
          reportProgress(
            "generating",
            bookId,
            chapterId,
            voiceId,
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
          voiceId,
          readyCount,
          totalSentences,
          progressFraction,
          sentence.text,
          "Generating sentence ${index + 1} of $totalSentences",
        )

        val tempOutput = File(applicationContext.cacheDir, "narration-working/temp_${System.currentTimeMillis()}.wav")
        tempOutput.parentFile?.mkdirs()

        if (useNatural && referenceAudio != null) {
          if (engine == null) {
            engine = ChatterboxOnnxEngine(store)
          }
          val generated = engine.generate(
            text = normalized,
            reference = referenceAudio,
            performanceMode = performanceMode,
            isCancelled = { isStopped || Thread.currentThread().isInterrupted },
            onProgress = { _, _ -> },
          )
          WavAudio.writeMonoPcm16(tempOutput, generated.samples)
        } else {
          // Fallback to SystemTts
          systemTts.synthesizeReference(tempOutput)
        }

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
        voiceId,
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
    // 1. Storage check
    if (applicationContext.filesDir.usableSpace < MIN_STORAGE_RESERVE) {
      throw IllegalStateException("Low device storage. Free space to continue generating audio.")
    }

    // 2. Battery check
    val batteryIntent = applicationContext.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
    val level = batteryIntent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
    val scale = batteryIntent?.getIntExtra(BatteryManager.EXTRA_SCALE, 100) ?: 100
    val status = batteryIntent?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
    val isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL
    val batteryPct = if (level >= 0) level * 100 / scale.coerceAtLeast(1) else 100

    if (batteryPct < 15 && !isCharging) {
      throw IllegalStateException("Battery below 15%. Plug in your phone to continue background narration.")
    }

    // 3. Thermal check
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val power = applicationContext.getSystemService(Context.POWER_SERVICE) as PowerManager
      if (power.currentThermalStatus >= PowerManager.THERMAL_STATUS_SEVERE) {
        throw IllegalStateException("Phone is too warm for sustained audio generation right now.")
      }
    }
  }

  private fun hasEnoughMemory(): Boolean {
    val am = applicationContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    val mi = ActivityManager.MemoryInfo().also(am::getMemoryInfo)
    return mi.availMem >= MIN_FREE_MEMORY
  }

  private fun reportProgress(
    state: String,
    bookId: String,
    chapterId: String,
    voiceId: String,
    readyCount: Int,
    totalCount: Int,
    progress: Double,
    currentText: String,
    message: String,
  ) {
    val data = Data.Builder()
      .putString("state", state)
      .putString("bookId", bookId)
      .putString("chapterId", chapterId)
      .putString("voiceId", voiceId)
      .putInt("readySegments", readyCount)
      .putInt("totalSegments", totalCount)
      .putDouble("progress", progress)
      .putString("currentText", currentText)
      .putString("message", message)
      .build()
    setProgressAsync(data)
  }
}
