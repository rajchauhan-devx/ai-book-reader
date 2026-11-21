package com.aireader

import android.app.Activity
import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.OpenableColumns
import androidx.lifecycle.Observer
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkInfo
import androidx.work.WorkManager
import com.aireader.library.LibraryDatabase
import com.aireader.narration.AudioCacheStore
import com.aireader.narration.AudioDecoder
import com.aireader.narration.ChapterNarrationWorker
import com.aireader.narration.TextNormalizer
import com.aireader.narration.VoiceCatalog
import com.aireader.narration.VoiceProfile
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
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

enum class PerformanceMode {
  BALANCED,
  QUALITY,
  SPEED;

  companion object {
    fun from(value: String?): PerformanceMode {
      return entries.firstOrNull { it.name.equals(value, ignoreCase = true) } ?: BALANCED
    }
  }
}

class NarrationEngineModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  companion object {
    private const val EVENT_NAME = "NarrationEngineProgress"
    private const val EVENT_CHAPTER_PREP = "ChapterNarrationProgress"
    private const val PREFS = "narration-engine"
    private const val PREF_MODE = "performance-mode"
    private const val SAMPLE_TEXT = "Look, every great story begins with a single page, and a voice that makes the characters feel truly alive."
    private const val PICK_AUDIO_REQUEST = 4102
  }

  private val executor = Executors.newSingleThreadExecutor()
  private val store = ModelPackStore(reactContext)
  private val cacheStore = AudioCacheStore(reactContext)
  private val workManager = WorkManager.getInstance(reactContext)
  private val mainHandler = Handler(Looper.getMainLooper())
  private val cancelled = AtomicBoolean(false)
  private val running = AtomicBoolean(false)
  private var engine: KokoroOnnxEngine? = null
  private var player: MediaPlayer? = null
  private var listenerCount = 0
  private var audioPickerPromise: Promise? = null
  @Volatile private var state = "idle"
  @Volatile private var message = "Ready to test voice"

  private val audioPickerListener: ActivityEventListener = object : BaseActivityEventListener() {
    override fun onActivityResult(
      activity: Activity,
      requestCode: Int,
      resultCode: Int,
      data: Intent?,
    ) {
      if (requestCode != PICK_AUDIO_REQUEST) return
      val promise = synchronized(this@NarrationEngineModule) {
        audioPickerPromise.also { audioPickerPromise = null }
      } ?: return

      val uri = data?.data
      if (resultCode != Activity.RESULT_OK || uri == null) {
        promise.resolve(null)
        return
      }

      executor.execute {
        try {
          var name = "reference_audio.mp3"
          var size = 0L
          val cursor = reactApplicationContext.contentResolver.query(
            uri,
            arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE),
            null, null, null
          )
          cursor?.use {
            if (it.moveToFirst()) {
              val nameIdx = it.getColumnIndex(OpenableColumns.DISPLAY_NAME)
              if (nameIdx >= 0) name = it.getString(nameIdx) ?: name
              val sizeIdx = it.getColumnIndex(OpenableColumns.SIZE)
              if (sizeIdx >= 0) size = it.getLong(sizeIdx)
            }
          }

          val map = Arguments.createMap().apply {
            putString("uri", uri.toString())
            putString("name", name)
            putDouble("size", size.toDouble())
          }
          promise.resolve(map)
        } catch (error: Exception) {
          promise.reject("AUDIO_PICK_FAILED", error.message, error)
        }
      }
    }
  }

  init {
    reactApplicationContext.addActivityEventListener(audioPickerListener)
  }

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
  fun testVoice(text: String?, preferNatural: Boolean, voiceId: String?, promise: Promise) {
    if (!running.compareAndSet(false, true)) {
      promise.reject("VOICE_BUSY", "A voice test is already running.")
      return
    }
    stopPlayback()
    cancelled.set(false)
    val sample = text?.trim()?.takeIf { it.isNotEmpty() }?.take(360) ?: SAMPLE_TEXT
    val requestedVoice = VoiceCatalog.findVoice(voiceId)

    executor.execute {
      var playbackStarted = false
      try {
        if (!store.isInstalled()) {
          running.set(false)
          emit("failed", 0.0, "Kokoro voice model is not installed. Please download it in Model Setup.", "none")
          promise.reject(
            "MODEL_NOT_INSTALLED",
            "Kokoro neural voice model is not installed yet. Please download it in Model Setup.",
          )
          return@execute
        }

        val deviceReason = naturalVoiceBlockReason()
        if (deviceReason != null) {
          running.set(false)
          emit("failed", 0.0, deviceReason, "none")
          promise.reject("DEVICE_BUSY", deviceReason)
          return@execute
        }

        emit("preparing", 0.02, "Preparing Kokoro neural voice (${requestedVoice.name})", "kokoro")
        if (cancelled.get()) throw InterruptedException("Voice test stopped")
        val kokoroEngine = engine ?: KokoroOnnxEngine(store).also { engine = it }
        val generated = kokoroEngine.generate(
          text = sample,
          voiceId = requestedVoice.id,
          speed = 1.0f,
          isCancelled = cancelled::get,
        ) { progress, progressMessage -> emit("generating", progress, progressMessage, "kokoro") }
        if (cancelled.get()) throw InterruptedException("Voice test stopped")
        val output = File(reactApplicationContext.cacheDir, "generated/test-${UUID.randomUUID()}.wav")
        WavAudio.writeMonoPcm16(output, generated.samples)
        val durationMs = generated.samples.size * 1_000L / 24_000L
        val realtimeFactor = if (durationMs > 0L) generated.generationMillis.toDouble() / durationMs else 0.0
        startPlayback(output) { emit("ready", 1.0, "Kokoro voice test finished", "kokoro") }
        playbackStarted = true
        emit("playing", 1.0, "Playing Kokoro voice (${requestedVoice.name})", "kokoro")
        promise.resolve(
          resultMap(
            "kokoro",
            output.absolutePath,
            durationMs,
            generated.generationMillis,
            null,
            "Synthesized with Kokoro-82M on-device (${requestedVoice.name})",
            realtimeFactor,
          ),
        )
      } catch (_: InterruptedException) {
        emit("idle", 0.0, "Voice test stopped", "kokoro")
        promise.reject("VOICE_CANCELLED", "Voice test stopped")
      } catch (error: Exception) {
        emit("failed", 0.0, error.message ?: "Kokoro voice test failed", "none")
        promise.reject("VOICE_TEST_FAILED", error.message, error)
      } finally {
        if (!playbackStarted) running.set(false)
      }
    }
  }

  @ReactMethod
  fun getCuratedVoices(promise: Promise) {
    val allVoices = VoiceCatalog.allVoices(reactApplicationContext)
    val voicesArray = Arguments.createArray()
    for (v in allVoices) {
      val m = Arguments.createMap().apply {
        putString("id", v.id)
        putString("name", v.name)
        putString("descriptor", v.descriptor)
        putString("engine", v.engine)
        putBoolean("isDefault", v.isDefault)
        putBoolean("isCustom", v.isCustom)
        putDouble("sampleDurationSec", v.sampleDurationSec)
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
  fun pickReferenceAudio(promise: Promise) {
    val activity = reactApplicationContext.currentActivity
    if (activity == null) {
      promise.reject("AUDIO_PICK_UNAVAILABLE", "The file picker is not available right now.")
      return
    }
    synchronized(this) {
      if (audioPickerPromise != null) {
        promise.reject("AUDIO_PICK_BUSY", "The audio picker is already open.")
        return
      }
      audioPickerPromise = promise
    }

    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      type = "audio/*"
      putExtra(
        Intent.EXTRA_MIME_TYPES,
        arrayOf("audio/*", "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/m4a", "audio/mp4", "audio/aac", "audio/ogg", "audio/flac")
      )
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }

    try {
      reactApplicationContext.runOnUiQueueThread {
        try {
          activity.startActivityForResult(intent, PICK_AUDIO_REQUEST)
        } catch (error: Exception) {
          synchronized(this) { audioPickerPromise = null }
          promise.reject("AUDIO_PICK_UNAVAILABLE", "No audio picker could be opened.", error)
        }
      }
    } catch (error: Exception) {
      synchronized(this) { audioPickerPromise = null }
      promise.reject("AUDIO_PICK_UNAVAILABLE", "No audio picker could be opened.", error)
    }
  }

  @ReactMethod
  fun importCustomVoice(uriValue: String, voiceName: String, promise: Promise) {
    executor.execute {
      try {
        val uri = Uri.parse(uriValue)
        val cleanName = voiceName.trim().take(60).ifEmpty { "Custom Narrator" }
        val voiceId = "custom_" + System.currentTimeMillis()

        val customDir = File(reactApplicationContext.filesDir, "custom_voices")
        customDir.mkdirs()
        val targetWav = File(customDir, "$voiceId.wav")

        val durationSec = AudioDecoder.decodeTo24kHzMonoWav(
          context = reactApplicationContext,
          uri = uri,
          targetFile = targetWav,
          maxSeconds = 12,
          targetSampleRate = 24_000,
        )

        val profile = VoiceProfile(
          id = voiceId,
          name = cleanName,
          descriptor = "Custom voice · ${"%.1f".format(durationSec)}s sample",
          engine = "kokoro",
          referenceAsset = "custom_voices/$voiceId.wav",
          isDefault = false,
          isCustom = true,
          sampleDurationSec = durationSec,
        )

        VoiceCatalog.addCustomVoice(reactApplicationContext, profile)

        val result = Arguments.createMap().apply {
          putString("id", profile.id)
          putString("name", profile.name)
          putString("descriptor", profile.descriptor)
          putString("engine", profile.engine)
          putBoolean("isDefault", profile.isDefault)
          putBoolean("isCustom", profile.isCustom)
          putDouble("sampleDurationSec", profile.sampleDurationSec)
        }
        promise.resolve(result)
      } catch (error: Exception) {
        promise.reject("CUSTOM_VOICE_IMPORT_FAILED", error.message, error)
      }
    }
  }

  @ReactMethod
  fun deleteCustomVoice(voiceId: String, promise: Promise) {
    executor.execute {
      try {
        val removed = VoiceCatalog.removeCustomVoice(reactApplicationContext, voiceId)
        if (removed) {
          cacheStore.removeVoiceAudio(voiceId)
        }
        promise.resolve(removed)
      } catch (error: Exception) {
        promise.reject("CUSTOM_VOICE_DELETE_FAILED", error.message, error)
      }
    }
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
    executor.execute {
      try {
        if (!store.isInstalled()) {
          promise.reject("MODEL_NOT_INSTALLED", "Kokoro-82M voice model is not installed. Please download it in Model Setup.")
          return@execute
        }

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
          modelPackId = "kokoro-82m",
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

        val targetFile = cachedFile
        targetFile.parentFile?.mkdirs()

        val kokoroEngine = engine ?: KokoroOnnxEngine(store).also { engine = it }
        val generated = kokoroEngine.generate(
          text = normalized,
          voiceId = selectedVoice.id,
          speed = 1.0f,
          isCancelled = cancelled::get,
          onProgress = { _, _ -> },
        )
        WavAudio.writeMonoPcm16(targetFile, generated.samples)

        val durationMs = cacheStore.wavDurationMs(targetFile)
        startPlayback(targetFile) { }
        val map = Arguments.createMap().apply {
          putString("audioPath", targetFile.absolutePath)
          putDouble("durationMs", durationMs.toDouble())
          putBoolean("isCached", false)
          putString("engine", "kokoro")
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
        .putString("voiceId", voiceId ?: "af_heart")
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
    stopPlayback()
    running.set(false)
    emit("idle", 0.0, "Voice test stopped", "none")
    promise.resolve(true)
  }

  @ReactMethod
  fun unload(promise: Promise) {
    cancelled.set(true)
    engine?.cancel()
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
      emit("failed", 1.0, "The generated sample could not be played", "kokoro")
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
    if (memory.availMem < 300L * 1024L * 1024L) return "Not enough free memory for neural voice right now"
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val power = reactApplicationContext.getSystemService(Context.POWER_SERVICE) as PowerManager
      if (power.currentThermalStatus >= PowerManager.THERMAL_STATUS_SEVERE) {
        return "The phone is too warm for neural voice right now"
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
      putString("engine", if (store.isInstalled()) "kokoro" else "none")
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
      putString("voiceId", data.getString("voiceId") ?: "af_heart")
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
    stopPlayback()
    executor.shutdownNow()
    if (executor.awaitTermination(3, TimeUnit.SECONDS)) engine?.close()
    super.invalidate()
  }
}
