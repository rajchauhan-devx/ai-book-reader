package com.aireader

import android.content.Context
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.io.File
import java.util.Locale
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

internal class SystemTtsEngine(context: Context) {
  private val appContext = context.applicationContext
  @Volatile private var activeTts: TextToSpeech? = null

  @Volatile private var persistentTts: TextToSpeech? = null
  private val initLock = Any()

  private fun getOrInitTts(): TextToSpeech {
    persistentTts?.let { return it }
    synchronized(initLock) {
      persistentTts?.let { return it }
      val tts = initialize()
      selectOfflineEnglishVoice(tts)
      persistentTts = tts
      return tts
    }
  }

  fun synthesizeTextToFile(text: String, destination: File, timeoutSeconds: Long = 25): File {
    if (destination.isFile && destination.length() > 44) return destination
    val tts = getOrInitTts()
    destination.parentFile?.mkdirs()
    destination.delete()
    val utteranceId = "synth-${UUID.randomUUID()}"
    val completed = CountDownLatch(1)
    var failure: String? = null
    tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
      override fun onStart(id: String?) = Unit
      override fun onDone(id: String?) {
        if (id == utteranceId) completed.countDown()
      }
      @Deprecated("Deprecated in Java")
      override fun onError(id: String?) {
        if (id == utteranceId) {
          failure = "The phone voice could not create speech."
          completed.countDown()
        }
      }
      override fun onError(id: String?, errorCode: Int) {
        if (id == utteranceId) {
          failure = "The phone voice could not create speech ($errorCode)."
          completed.countDown()
        }
      }
    })
    val result = tts.synthesizeToFile(text, Bundle(), destination, utteranceId)
    if (result != TextToSpeech.SUCCESS || !completed.await(timeoutSeconds, TimeUnit.SECONDS)) {
      throw IllegalStateException(failure ?: "The phone voice took too long to prepare sentence audio.")
    }
    require(destination.isFile && destination.length() > 44) { failure ?: "The phone voice created an empty audio file." }
    return destination
  }

  fun synthesizeReference(destination: File): File {
    if (destination.isFile && destination.length() > 44) return destination
    val text = "Stories carry us beyond the familiar, through quiet rooms and bright horizons. Every page opens a new path, and every voice gives it life."
    return synthesizeTextToFile(text, destination, 75)
  }

  fun speak(text: String, onDone: (Boolean) -> Unit) {
    val tts = initialize()
    activeTts = tts
    try {
      selectOfflineEnglishVoice(tts)
    } catch (error: Exception) {
      tts.shutdown()
      activeTts = null
      throw error
    }
    val utteranceId = "fallback-${UUID.randomUUID()}"
    tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
      override fun onStart(id: String?) = Unit
      override fun onDone(id: String?) {
        if (id == utteranceId) finishSpeaking(tts, true, onDone)
      }
      @Deprecated("Deprecated in Java")
      override fun onError(id: String?) {
        if (id == utteranceId) finishSpeaking(tts, false, onDone)
      }
      override fun onError(id: String?, errorCode: Int) = finishSpeaking(tts, false, onDone)
    })
    if (tts.speak(text, TextToSpeech.QUEUE_FLUSH, Bundle(), utteranceId) != TextToSpeech.SUCCESS) {
      finishSpeaking(tts, false, onDone)
      throw IllegalStateException("The phone voice could not start speaking.")
    }
  }

  fun stop() {
    activeTts?.stop()
    activeTts?.shutdown()
    activeTts = null
  }

  fun shutdown() {
    stop()
    synchronized(initLock) {
      persistentTts?.shutdown()
      persistentTts = null
    }
  }

  private fun initialize(): TextToSpeech {
    val ready = CountDownLatch(1)
    var status = TextToSpeech.ERROR
    val tts = TextToSpeech(appContext) {
      status = it
      ready.countDown()
    }
    if (!ready.await(20, TimeUnit.SECONDS) || status != TextToSpeech.SUCCESS) {
      tts.shutdown()
      throw IllegalStateException("No offline phone voice is ready. Install an offline English voice in Android settings.")
    }
    return tts
  }

  private fun selectOfflineEnglishVoice(tts: TextToSpeech) {
    val current = tts.voice
    val chosen = tts.voices
      ?.filter { !it.isNetworkConnectionRequired && it.locale.language == Locale.ENGLISH.language }
      ?.sortedWith(compareByDescending<android.speech.tts.Voice> { it.quality }.thenBy { it.latency })
      ?.firstOrNull()
      ?: current?.takeIf { !it.isNetworkConnectionRequired && it.locale.language == Locale.ENGLISH.language }
      ?: throw IllegalStateException("Install an offline English phone voice to continue.")
    if (tts.setVoice(chosen) != TextToSpeech.SUCCESS) {
      throw IllegalStateException("The offline English phone voice could not be selected.")
    }
  }

  private fun finishSpeaking(tts: TextToSpeech, success: Boolean, callback: (Boolean) -> Unit) {
    if (activeTts === tts) activeTts = null
    tts.shutdown()
    callback(success)
  }
}
