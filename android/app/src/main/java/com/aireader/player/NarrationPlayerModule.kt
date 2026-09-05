package com.aireader.player

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

class NarrationPlayerModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

  companion object {
    const val EVENT_STATE_CHANGED = "NarrationPlayerStateChanged"
  }

  private var listenerCount = 0

  init {
    NarrationPlaybackService.stateListener = { snapshot ->
      emitState(snapshot)
    }
  }

  override fun getName(): String = "NarrationPlayer"

  @ReactMethod
  fun addListener(eventName: String) {
    listenerCount++
  }

  @ReactMethod
  fun removeListeners(count: Double) {
    listenerCount = (listenerCount - count.toInt()).coerceAtLeast(0)
  }

  @ReactMethod
  fun getPlayerState(promise: Promise) {
    try {
      promise.resolve(snapshotToMap(NarrationPlaybackService.currentSnapshot))
    } catch (e: Exception) {
      promise.reject("PLAYER_STATE_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun setEngineConfig(
    engineMode: String,
    apiKey: String?,
    edgeVoice: String?,
    promise: Promise,
  ) {
    try {
      NarrationPlaybackService.activeEngineMode = engineMode
      NarrationPlaybackService.activeEdgeVoice = edgeVoice ?: "en-US-JennyNeural"

      if (NarrationPlaybackService.isServiceActive) {
        val intent = Intent(reactApplicationContext, NarrationPlaybackService::class.java).apply {
          action = NarrationPlaybackService.ACTION_SET_ENGINE_CONFIG
          putExtra(NarrationPlaybackService.EXTRA_ENGINE_MODE, engineMode)
          putExtra(NarrationPlaybackService.EXTRA_EDGE_VOICE, edgeVoice ?: "en-US-JennyNeural")
        }
        startService(intent)
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("CONFIG_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun play(
    bookId: String,
    chapterId: String,
    sentenceIndex: Double,
    voiceId: String?,
    expression: String?,
    speed: Double?,
    pageSize: Double?,
    promise: Promise,
  ) {
    try {
      val intent = Intent(reactApplicationContext, NarrationPlaybackService::class.java).apply {
        action = NarrationPlaybackService.ACTION_PLAY
        putExtra(NarrationPlaybackService.EXTRA_BOOK_ID, bookId)
        putExtra(NarrationPlaybackService.EXTRA_CHAPTER_ID, chapterId)
        putExtra(NarrationPlaybackService.EXTRA_SENTENCE_INDEX, sentenceIndex.toInt())
        putExtra(NarrationPlaybackService.EXTRA_VOICE_ID, voiceId ?: "warm")
        putExtra(NarrationPlaybackService.EXTRA_EXPRESSION, expression ?: "natural")
        putExtra(NarrationPlaybackService.EXTRA_SPEED, (speed ?: 1.0).toFloat())
        if (pageSize != null && pageSize > 0) {
          putExtra(NarrationPlaybackService.EXTRA_PAGE_SIZE, pageSize.toInt())
        }
      }
      startService(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("PLAY_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun pause(promise: Promise) {
    try {
      val intent = Intent(reactApplicationContext, NarrationPlaybackService::class.java).apply {
        action = NarrationPlaybackService.ACTION_PAUSE
      }
      startService(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("PAUSE_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun resume(promise: Promise) {
    try {
      val intent = Intent(reactApplicationContext, NarrationPlaybackService::class.java).apply {
        action = NarrationPlaybackService.ACTION_RESUME
      }
      startService(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("RESUME_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    try {
      val intent = Intent(reactApplicationContext, NarrationPlaybackService::class.java).apply {
        action = NarrationPlaybackService.ACTION_STOP
      }
      startService(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("STOP_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun seekSentence(sentenceIndex: Double, promise: Promise) {
    try {
      val intent = Intent(reactApplicationContext, NarrationPlaybackService::class.java).apply {
        action = NarrationPlaybackService.ACTION_SEEK_SENTENCE
        putExtra(NarrationPlaybackService.EXTRA_SENTENCE_INDEX, sentenceIndex.toInt())
      }
      startService(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("SEEK_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun skipTime(deltaMs: Double, promise: Promise) {
    try {
      val intent = Intent(reactApplicationContext, NarrationPlaybackService::class.java).apply {
        action = NarrationPlaybackService.ACTION_SKIP_TIME
        putExtra(NarrationPlaybackService.EXTRA_DELTA_MS, deltaMs.toLong())
      }
      startService(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("SKIP_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun setSpeed(speed: Double, promise: Promise) {
    try {
      val intent = Intent(reactApplicationContext, NarrationPlaybackService::class.java).apply {
        action = NarrationPlaybackService.ACTION_SET_SPEED
        putExtra(NarrationPlaybackService.EXTRA_SPEED, speed.toFloat())
      }
      startService(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("SPEED_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun setSleepTimer(minutes: Double, endOfChapter: Boolean, promise: Promise) {
    try {
      val intent = Intent(reactApplicationContext, NarrationPlaybackService::class.java).apply {
        action = NarrationPlaybackService.ACTION_SET_SLEEP_TIMER
        putExtra(NarrationPlaybackService.EXTRA_MINUTES, minutes.toInt())
        putExtra(NarrationPlaybackService.EXTRA_END_OF_CHAPTER, endOfChapter)
      }
      startService(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("SLEEP_TIMER_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun setSentenceStyles(styles: ReadableMap, chapterId: String?, promise: Promise) {
    try {
      val iterator = styles.keySetIterator()
      while (iterator.hasNextKey()) {
        val key = iterator.nextKey()
        val style = styles.getString(key)
        if (style != null) {
          if (!chapterId.isNullOrBlank()) {
            NarrationPlaybackService.sentenceEmotionStyles["${chapterId}:${key}"] = style
          }
          NarrationPlaybackService.sentenceEmotionStyles[key] = style
        }
      }
      NarrationPlaybackService.sentenceCacheInvalidated = true
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("SET_STYLES_ERROR", e.message, e)
    }
  }

  private fun startService(intent: Intent) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      if (intent.action == NarrationPlaybackService.ACTION_PLAY) {
        reactApplicationContext.startForegroundService(intent)
      } else if (NarrationPlaybackService.isServiceActive) {
        reactApplicationContext.startService(intent)
      }
    } else {
      reactApplicationContext.startService(intent)
    }
  }

  private fun emitState(snapshot: PlaybackSnapshot) {
    if (listenerCount <= 0 || !reactApplicationContext.hasActiveReactInstance()) return
    try {
      reactApplicationContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(EVENT_STATE_CHANGED, snapshotToMap(snapshot))
    } catch (_: Exception) { }
  }

  private fun snapshotToMap(snapshot: PlaybackSnapshot): WritableMap {
    return Arguments.createMap().apply {
      putString("state", snapshot.state)
      putString("bookId", snapshot.bookId)
      putString("chapterId", snapshot.chapterId)
      putString("bookTitle", snapshot.bookTitle)
      putString("chapterTitle", snapshot.chapterTitle)
      putInt("sentenceIndex", snapshot.sentenceIndex)
      putInt("totalSentences", snapshot.totalSentences)
      putDouble("positionMs", snapshot.positionMs.toDouble())
      putDouble("durationMs", snapshot.durationMs.toDouble())
      putDouble("speed", snapshot.speed.toDouble())
      putDouble("sleepTimerSecondsRemaining", snapshot.sleepTimerSecondsRemaining.toDouble())
      putBoolean("isSleepTimerActive", snapshot.isSleepTimerActive)
      putBoolean("sleepTimerEndOfChapter", snapshot.sleepTimerEndOfChapter)
      putInt("pagePreparationReady", snapshot.pagePreparationReady)
      putInt("pagePreparationTotal", snapshot.pagePreparationTotal)
      putString("errorMessage", snapshot.errorMessage)
    }
  }
}
