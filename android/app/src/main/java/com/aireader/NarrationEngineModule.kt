package com.aireader

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import androidx.lifecycle.Observer
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkInfo
import androidx.work.WorkManager
import com.aireader.library.LibraryDatabase
import com.aireader.narration.AudioCacheStore
import com.aireader.narration.ChapterNarrationWorker
import com.aireader.narration.TextNormalizer
import com.aireader.narration.VoiceCatalog
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class NarrationEngineModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  companion object {
    private const val EVENT_NAME = "NarrationEngineProgress"
    private const val EVENT_CHAPTER_PREP = "ChapterNarrationProgress"
    private const val PREFS = "narration-engine"
    private const val PREF_MODE = "performance-mode"
    private const val SAMPLE_TEXT = "Every great story begins with a single page, and a voice that makes the words feel alive."
  }

  private val executor = Executors.newSingleThreadExecutor()
  private val store = ModelPackStore(reactContext)
  private val systemTts = SystemTtsEngine(reactContext)
  private val cacheStore = AudioCacheStore(reactContext)
  private val workManager = WorkManager.getInstance(reactContext)
  private val mainHandler = Handler(Looper.getMainLooper())
  private val cancelled = AtomicBoolean(false)
  private val running = AtomicBoolean(false)
  private var engine: ChatterboxOnnxEngine? = null
  private var player: MediaPlayer? = null
  private var listenerCount = 0
  @Volatile private var state = "idle"
  @Volatile private var message = "Ready to test voice"

  override fun getName(): String = "NarrationEngine"

  @ReactMethod
  fun addListener(eventName: String) {
    listenerCount += 1
  }

  @ReactMethod
  fun removeListeners(count: Double) {
    listenerCount = (listenerCount - count.toInt()).coerceAtLeast(0)
  }

  @ReactMethod
  fun getStatus(promise: Promise) {
    promise.resolve(statusMap())
  }

  @ReactMethod
  fun setPerformanceMode(value: String, promise: Promise) {
    val mode = PerformanceMode.from(value)
    reactApplicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit().putString(PREF_MODE, mode.name.lowercase()).apply()
    promise.resolve(mode.name.lowercase())
  }

  @ReactMethod
  fun testVoice(text: String?, preferNatural: Boolean, promise: Promise) {
    if (!running.compareAndSet(false, true)) {
      promise.reject("VOICE_BUSY", "A voice test is already running.")
      return
    }
    stopPlayback()
    systemTts.stop()
    cancelled.set(false)
    val sample = text?.trim()?.takeIf { it.isNotEmpty() }?.take(360) ?: SAMPLE_TEXT
    executor.execute {
      var playbackStarted = false
      try {
        if (!preferNatural || !store.isInstalled()) {
          playbackStarted = speakWithPhoneVoice(sample, if (store.isInstalled()) null else "Natural voice is not installed")
          promise.resolve(resultMap("system", null, 0, 0, null, "Using the offline phone voice"))
          return@execute
        }

        val deviceReason = naturalVoiceBlockReason()
        if (deviceReason != null) {
          playbackStarted = speakWithPhoneVoice(sample, deviceReason)
          promise.resolve(resultMap("system", null, 0, 0, deviceReason, "Using the offline phone voice"))
          return@execute
        }

        emit("preparing", 0.02, "Preparing a private narrator reference", "natural")
        val referenceFile = File(reactApplicationContext.filesDir, "voice/neutral-reference.wav")
        val reference = WavAudio.readMono(systemTts.synthesizeReference(referenceFile))
        if (cancelled.get()) throw InterruptedException("Voice test stopped")
        val performanceMode = currentMode()
        val naturalEngine = engine ?: ChatterboxOnnxEngine(store).also { engine = it }
        val generated = naturalEngine.generate(
          sample,
          reference,
          performanceMode,
          cancelled::get,
        ) { progress, progressMessage -> emit("generating", progress, progressMessage, "natural") }
        if (cancelled.get()) throw InterruptedException("Voice test stopped")
        val output = File(reactApplicationContext.cacheDir, "generated/test-${UUID.randomUUID()}.wav")
        WavAudio.writeMonoPcm16(output, generated.samples)
        val durationMs = generated.samples.size * 1_000L / 24_000L
        val realtimeFactor = if (durationMs > 0) generated.generationMillis.toDouble() / durationMs else 0.0
        startPlayback(output) { emit("ready", 1.0, "Natural voice test finished", "natural") }
        playbackStarted = true
        emit("playing", 1.0, "Playing the natural voice sample", "natural")
        promise.resolve(
          resultMap(
            "natural",
            output.absolutePath,
            durationMs,
            generated.generationMillis,
            null,
            "Generated ${generated.generatedTokens} voice tokens on this phone",
            realtimeFactor,
          ),
        )
      } catch (_: InterruptedException) {
        emit("idle", 0.0, "Voice test stopped", "natural")
        promise.reject("VOICE_CANCELLED", "Voice test stopped")
      } catch (error: Exception) {
        if (cancelled.get()) {
          emit("idle", 0.0, "Voice test stopped", "natural")
          promise.reject("VOICE_CANCELLED", "Voice test stopped")
        } else {
          try {
            playbackStarted = speakWithPhoneVoice(sample, error.message ?: "Natural voice could not start")
            promise.resolve(
              resultMap(
                "system",
                null,
                0,
                0,
                error.message ?: "Natural voice could not start",
                "Natural voice needs attention; using the offline phone voice",
              ),
            )
          } catch (fallbackError: Exception) {
            emit("failed", 0.0, fallbackError.message ?: "No voice could be played", "none")
            promise.reject("VOICE_TEST_FAILED", fallbackError.message, fallbackError)
          }
        }
      } finally {
        if (!playbackStarted) running.set(false)
      }
    }
  }

  @ReactMethod
  fun getCuratedVoices(promise: Promise) {
    val voicesArray = Arguments.createArray()
    for (v in VoiceCatalog.VOICES) {
      val m = Arguments.createMap().apply {
        putString("id", v.id)
        putString("name", v.name)
        putString("descriptor", v.descriptor)
        putString("engine", v.engine)
        putBoolean("isDefault", v.isDefault)
      }
      voicesArray.pushMap(m)
    }

    val expressionsArray = Arguments.createArray()
    for (e in VoiceCatalog.EXPRESSIONS) {
      val m = Arguments.createMap().apply {
        putString("id", e.id)
        putString("name", e.name)
        putString("descriptor", e.descriptor)
      }
      expressionsArray.pushMap(m)
    }

    val result = Arguments.createMap().apply {
      putArray("voices", voicesArray)
      putArray("expressions", expressionsArray)
    }
    promise.resolve(result)
  }

  @ReactMethod
  fun getChapterAudioStatus(
    bookId: String,
    chapterId: String,
    voiceId: String?,
    promise: Promise,
  ) {
    executor.execute {
      try {
        val selectedVoice = VoiceCatalog.findVoice(voiceId)
        val db = LibraryDatabase.get(reactApplicationContext)
        val count = db.libraryDao().countChapterSentences(chapterId)
        val status = cacheStore.getChapterAudioStatus(bookId, selectedVoice.id, chapterId, count)
        val map = Arguments.createMap().apply {
          putInt("readySegments", status.readySegments)
          putInt("totalSegments", status.totalSegments)
          putDouble("durationMs", status.durationMs.toDouble())
          putDouble("totalBytes", status.totalBytes.toDouble())
          putBoolean("isComplete", status.isComplete)
        }
        promise.resolve(map)
      } catch (error: Exception) {
        promise.reject("STATUS_QUERY_FAILED", error.message, error)
      }
    }
  }

  @ReactMethod
  fun generateSentenceAudio(
    bookId: String,
    chapterId: String,
    sentenceIndex: Double,
    voiceId: String?,
    expression: String?,
    promise: Promise,
  ) {
    stopPlayback()
    systemTts.stop()
    executor.execute {
      try {
        val selectedVoice = VoiceCatalog.findVoice(voiceId)
        val selectedExpr = VoiceCatalog.findExpression(expression)
        val sIndex = sentenceIndex.toInt()

        val db = LibraryDatabase.get(reactApplicationContext)
        val sentences = db.libraryDao().chapterSentences(chapterId)
        if (sIndex < 0 || sIndex >= sentences.size) {
          promise.reject("INVALID_SENTENCE", "Sentence index $sIndex is out of bounds for chapter $chapterId")
          return@execute
        }

        val sentence = sentences[sIndex]
        val normalized = if (sentence.normalizedText.isNotBlank()) {
          TextNormalizer.normalize(sentence.normalizedText)
        } else {
          TextNormalizer.normalize(sentence.text)
        }

        val cacheKey = cacheStore.computeCacheKey(
          normalizedText = normalized,
          modelPackId = "chatterbox-nano",
          modelVersion = ModelPackCatalog.PACK_VERSION,
          voiceId = selectedVoice.id,
          expression = selectedExpr.id,
        )

        val cachedFile = cacheStore.segmentFile(bookId, selectedVoice.id, chapterId, sIndex, cacheKey)
        if (cacheStore.isValidWav(cachedFile)) {
          val durationMs = cacheStore.wavDurationMs(cachedFile)
          startPlayback(cachedFile) { }
          val map = Arguments.createMap().apply {
            putString("audioPath", cachedFile.absolutePath)
            putDouble("durationMs", durationMs.toDouble())
            putBoolean("isCached", true)
            putString("engine", selectedVoice.engine)
          }
          promise.resolve(map)
          return@execute
        }

        val useNatural = selectedVoice.engine == "natural" && store.isInstalled() && naturalVoiceBlockReason() == null
        val targetFile = cachedFile
        targetFile.parentFile?.mkdirs()

        if (useNatural) {
          val refFile = File(reactApplicationContext.filesDir, selectedVoice.referenceAsset ?: "voice/neutral-reference.wav")
          if (!refFile.exists() || refFile.length() < 44) {
            systemTts.synthesizeReference(refFile)
          }
          val reference = WavAudio.readMono(refFile)
          val naturalEngine = engine ?: ChatterboxOnnxEngine(store).also { engine = it }
          val generated = naturalEngine.generate(
            text = normalized,
            reference = reference,
            performanceMode = currentMode(),
            isCancelled = cancelled::get,
            onProgress = { _, _ -> },
          )
          WavAudio.writeMonoPcm16(targetFile, generated.samples)
        } else {
          systemTts.synthesizeTextToFile(normalized, targetFile)
        }

        val durationMs = cacheStore.wavDurationMs(targetFile)
        startPlayback(targetFile) { }
        val map = Arguments.createMap().apply {
          putString("audioPath", targetFile.absolutePath)
          putDouble("durationMs", durationMs.toDouble())
          putBoolean("isCached", false)
          putString("engine", if (useNatural) "natural" else "system")
        }
        promise.resolve(map)
      } catch (error: Exception) {
        promise.reject("AUDIO_GEN_FAILED", error.message, error)
      }
    }
  }

  @ReactMethod
  fun prepareChapterAudio(
    bookId: String,
    chapterId: String,
    voiceId: String?,
    expression: String?,
    promise: Promise,
  ) {
    try {
      val tag = "prepare-chapter-$bookId-$chapterId"
      val inputData = Data.Builder()
        .putString("bookId", bookId)
        .putString("chapterId", chapterId)
        .putString("voiceId", voiceId ?: "warm")
        .putString("expression", expression ?: "natural")
        .build()

      val workRequest = OneTimeWorkRequestBuilder<ChapterNarrationWorker>()
        .setInputData(inputData)
        .addTag(tag)
        .build()

      workManager.enqueueUniqueWork(
        tag,
        ExistingWorkPolicy.REPLACE,
        workRequest,
      )

      mainHandler.post {
        val liveData = workManager.getWorkInfosByTagLiveData(tag)
        val observer = object : Observer<List<WorkInfo>> {
          override fun onChanged(workInfos: List<WorkInfo>) {
            val info = workInfos.firstOrNull() ?: return
            emitChapterProgress(info.progress)
            if (info.state.isFinished) {
              liveData.removeObserver(this)
            }
          }
        }
        liveData.observeForever(observer)
      }

      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("CHAPTER_PREP_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun cancelChapterPreparation(bookId: String, chapterId: String, promise: Promise) {
    try {
      val tag = "prepare-chapter-$bookId-$chapterId"
      workManager.cancelUniqueWork(tag)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("CANCEL_PREP_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun removeBookAudio(bookId: String, promise: Promise) {
    executor.execute {
      try {
        val removed = cacheStore.removeBookAudio(bookId)
        promise.resolve(removed)
      } catch (error: Exception) {
        promise.reject("REMOVE_BOOK_AUDIO_FAILED", error.message, error)
      }
    }
  }

  @ReactMethod
  fun cancel(promise: Promise) {
    cancelled.set(true)
    engine?.cancel()
    systemTts.stop()
    stopPlayback()
    running.set(false)
    emit("idle", 0.0, "Voice test stopped", "none")
    promise.resolve(true)
  }

  @ReactMethod
  fun unload(promise: Promise) {
    cancelled.set(true)
    engine?.cancel()
    systemTts.stop()
    stopPlayback()
    executor.execute {
      engine?.close()
      engine = null
      running.set(false)
      emit("idle", 0.0, "Voice engine unloaded", "none")
      promise.resolve(true)
    }
  }

  @ReactMethod
  fun getGeneratedAudioBytes(promise: Promise) {
    val total = cacheStore.getTotalAudioBytes() +
      generatedDirectory().walkTopDown().filter { it.isFile }.sumOf { it.length() }
    promise.resolve(total.toDouble())
  }

  @ReactMethod
  fun removeGeneratedAudio(promise: Promise) {
    try {
      stopPlayback()
      cacheStore.removeAllAudio()
      val directory = generatedDirectory()
      if (directory.exists() && !directory.deleteRecursively()) {
        throw IllegalStateException("Some generated audio could not be removed.")
      }
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("AUDIO_REMOVE_FAILED", error.message, error)
    }
  }

  private fun speakWithPhoneVoice(text: String, fallbackReason: String?): Boolean {
    emit("preparing", 0.2, "Preparing the offline phone voice", "system")
    systemTts.speak(text) { success ->
      running.set(false)
      emit(if (success) "ready" else "failed", 1.0, if (success) "Phone voice test finished" else "Phone voice playback failed", "system")
    }
    emit("playing", 1.0, fallbackReason ?: "Playing the offline phone voice", "system")
    return true
  }

  private fun startPlayback(file: File, onComplete: () -> Unit) {
    stopPlayback()
    val mediaPlayer = MediaPlayer()
    player = mediaPlayer
    mediaPlayer.setAudioAttributes(
      AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build(),
    )
    mediaPlayer.setDataSource(file.absolutePath)
    mediaPlayer.setOnCompletionListener {
      it.release()
      if (player === it) player = null
      running.set(false)
      onComplete()
    }
    mediaPlayer.setOnErrorListener { failedPlayer, _, _ ->
      failedPlayer.release()
      if (player === failedPlayer) player = null
      running.set(false)
      emit("failed", 1.0, "The generated sample could not be played", "natural")
      true
    }
    mediaPlayer.prepare()
    mediaPlayer.start()
  }

  private fun stopPlayback() {
    val current = player ?: return
    player = null
    try { current.stop() } catch (_: Exception) { }
    current.release()
  }

  private fun naturalVoiceBlockReason(): String? {
    val activityManager = reactApplicationContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    val memory = ActivityManager.MemoryInfo().also(activityManager::getMemoryInfo)
    if (memory.availMem < 1_000L * 1024L * 1024L) return "Not enough free memory for natural voice right now"
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val power = reactApplicationContext.getSystemService(Context.POWER_SERVICE) as PowerManager
      if (power.currentThermalStatus >= PowerManager.THERMAL_STATUS_SEVERE) {
        return "The phone is too warm for natural voice right now"
      }
    }
    return null
  }

  private fun currentMode(): PerformanceMode {
    val value = reactApplicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .getString(PREF_MODE, "balanced") ?: "balanced"
    return PerformanceMode.from(value)
  }

  private fun statusMap(): WritableMap {
    val batteryIntent = reactApplicationContext.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
    val level = batteryIntent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
    val scale = batteryIntent?.getIntExtra(BatteryManager.EXTRA_SCALE, 100) ?: 100
    val batteryPercent = if (level >= 0) level * 100 / scale.coerceAtLeast(1) else -1
    val thermal = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      (reactApplicationContext.getSystemService(Context.POWER_SERVICE) as PowerManager).currentThermalStatus
    } else 0
    return Arguments.createMap().apply {
      putString("state", state)
      putString("message", message)
      putString("performanceMode", currentMode().name.lowercase())
      putBoolean("modelInstalled", store.isInstalled())
      putBoolean("running", running.get())
      putInt("batteryPercent", batteryPercent)
      putInt("thermalStatus", thermal)
    }
  }

  private fun resultMap(
    usedEngine: String,
    audioPath: String?,
    durationMs: Long,
    generationMs: Long,
    fallbackReason: String?,
    resultMessage: String,
    realtimeFactor: Double = 0.0,
  ): WritableMap = Arguments.createMap().apply {
    putString("engine", usedEngine)
    if (audioPath != null) putString("audioPath", audioPath) else putNull("audioPath")
    putDouble("durationMs", durationMs.toDouble())
    putDouble("generationMs", generationMs.toDouble())
    putDouble("realtimeFactor", realtimeFactor)
    if (fallbackReason != null) putString("fallbackReason", fallbackReason) else putNull("fallbackReason")
    putString("message", resultMessage)
  }

  private fun emit(newState: String, progress: Double, newMessage: String, usedEngine: String) {
    state = newState
    message = newMessage
    if (listenerCount <= 0 || !reactApplicationContext.hasActiveReactInstance()) return
    val event = statusMap().apply {
      putDouble("progress", progress.coerceIn(0.0, 1.0))
      putString("engine", usedEngine)
    }
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(EVENT_NAME, event)
  }

  private fun emitChapterProgress(data: Data) {
    if (listenerCount <= 0 || !reactApplicationContext.hasActiveReactInstance()) return
    val state = data.getString("state") ?: return
    val map = Arguments.createMap().apply {
      putString("state", state)
      putString("bookId", data.getString("bookId") ?: "")
      putString("chapterId", data.getString("chapterId") ?: "")
      putString("voiceId", data.getString("voiceId") ?: "warm")
      putInt("readySegments", data.getInt("readySegments", 0))
      putInt("totalSegments", data.getInt("totalSegments", 0))
      putDouble("progress", data.getDouble("progress", 0.0))
      putString("currentText", data.getString("currentText") ?: "")
      putString("message", data.getString("message") ?: "")
    }
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(EVENT_CHAPTER_PREP, map)
  }

  private fun generatedDirectory() = File(reactApplicationContext.cacheDir, "generated")

  override fun invalidate() {
    cancelled.set(true)
    engine?.cancel()
    systemTts.stop()
    stopPlayback()
    executor.shutdownNow()
    if (executor.awaitTermination(3, TimeUnit.SECONDS)) engine?.close()
    super.invalidate()
  }
}
