package com.aireader

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.lifecycle.Observer
import androidx.work.ExistingWorkPolicy
import androidx.work.WorkInfo
import androidx.work.WorkManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

class ModelDownloadModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  companion object {
    private const val EVENT_NAME = "ModelDownloadProgress"
  }

  private val workManager = WorkManager.getInstance(reactContext)
  private val store = ModelPackStore(reactContext)
  private val mainHandler = Handler(Looper.getMainLooper())
  private val workInfoLiveData =
    workManager.getWorkInfosForUniqueWorkLiveData(ModelDownloadWorker.UNIQUE_WORK_NAME)
  private var listenerCount = 0
  private val workObserver = Observer<List<WorkInfo>> { emitCurrentStatus(selectWork(it)) }

  init {
    store.recoverInterruptedInstall()
    mainHandler.post { workInfoLiveData.observeForever(workObserver) }
  }

  override fun getName(): String = "ModelDownload"

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
    try {
      val work = selectWork(workManager.getWorkInfosForUniqueWork(ModelDownloadWorker.UNIQUE_WORK_NAME).get())
      promise.resolve(statusMap(work))
    } catch (error: Exception) {
      promise.reject("MODEL_STATUS_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun startDownload(wifiOnly: Boolean, promise: Promise) {
    if (store.isInstalled()) {
      promise.resolve(false)
      return
    }
    reactApplicationContext.getSharedPreferences(ModelDownloadWorker.PREFS, Context.MODE_PRIVATE)
      .edit()
      .putBoolean(ModelDownloadWorker.PREF_PAUSED, false)
      .putBoolean("wifi_only", wifiOnly)
      .apply()
    workManager.enqueueUniqueWork(
      ModelDownloadWorker.UNIQUE_WORK_NAME,
      ExistingWorkPolicy.REPLACE,
      ModelDownloadWorker.request(wifiOnly),
    )
    promise.resolve(true)
  }

  @ReactMethod
  fun pauseDownload(promise: Promise) {
    reactApplicationContext.getSharedPreferences(ModelDownloadWorker.PREFS, Context.MODE_PRIVATE)
      .edit().putBoolean(ModelDownloadWorker.PREF_PAUSED, true).apply()
    workManager.cancelUniqueWork(ModelDownloadWorker.UNIQUE_WORK_NAME)
    emitCurrentStatus(null)
    promise.resolve(true)
  }

  @ReactMethod
  fun removeModel(promise: Promise) {
    try {
      workManager.cancelUniqueWork(ModelDownloadWorker.UNIQUE_WORK_NAME)
      store.removeAll()
      reactApplicationContext.getSharedPreferences(ModelDownloadWorker.PREFS, Context.MODE_PRIVATE)
        .edit().clear().apply()
      emitCurrentStatus(null)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("MODEL_REMOVE_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun getStorageInfo(promise: Promise) {
    promise.resolve(Arguments.createMap().apply {
      putDouble("installedBytes", store.installedBytes().toDouble())
      putDouble("partialBytes", store.downloadedBytes().toDouble())
      putDouble("availableBytes", store.availableBytes().toDouble())
      putDouble("totalBytes", ModelPackCatalog.totalBytes.toDouble())
    })
  }

  private fun statusMap(workInfo: WorkInfo?): WritableMap {
    val paused = reactApplicationContext
      .getSharedPreferences(ModelDownloadWorker.PREFS, Context.MODE_PRIVATE)
      .getBoolean(ModelDownloadWorker.PREF_PAUSED, false)
    val partialBytes = store.downloadedBytes()
    val status = when {
      store.isInstalled() -> Triple("ready", ModelPackCatalog.totalBytes, "Natural voice installed and verified")
      paused && partialBytes > 0L -> Triple("paused", partialBytes, "Download paused")
      workInfo?.state == WorkInfo.State.RUNNING -> Triple(
        workInfo.progress.getString(ModelDownloadWorker.EVENT_STATE) ?: "downloading",
        workInfo.progress.getLong(ModelDownloadWorker.EVENT_BYTES, partialBytes),
        workInfo.progress.getString(ModelDownloadWorker.EVENT_MESSAGE) ?: "Downloading natural voice",
      )
      workInfo?.state == WorkInfo.State.ENQUEUED || workInfo?.state == WorkInfo.State.BLOCKED -> {
        val wifiOnly = reactApplicationContext
          .getSharedPreferences(ModelDownloadWorker.PREFS, Context.MODE_PRIVATE)
          .getBoolean("wifi_only", true)
        val msg = if (wifiOnly) {
          "Waiting for unmetered Wi-Fi. Turn off 'Download over Wi-Fi only' if using mobile data."
        } else {
          "Waiting for network connection…"
        }
        Triple("checking", partialBytes, msg)
      }
      workInfo?.state == WorkInfo.State.FAILED -> Triple(
        "failed",
        workInfo.outputData.getLong(ModelDownloadWorker.EVENT_BYTES, partialBytes),
        workInfo.outputData.getString(ModelDownloadWorker.EVENT_MESSAGE)
          ?: "The voice download could not be completed.",
      )
      partialBytes > 0L -> Triple("paused", partialBytes, "Download can be resumed")
      else -> Triple("not-installed", 0L, "Ready to download")
    }
    val supported = Build.SUPPORTED_ABIS.any { it == "arm64-v8a" } && Build.VERSION.SDK_INT >= 24
    val activityManager = reactApplicationContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    val memoryInfo = ActivityManager.MemoryInfo().also(activityManager::getMemoryInfo)
    val state = if (supported) status.first else "unsupported"
    val safeBytes = status.second.coerceIn(0L, ModelPackCatalog.totalBytes)
    return Arguments.createMap().apply {
      putString("state", state)
      putDouble("progress", safeBytes.toDouble() / ModelPackCatalog.totalBytes)
      putDouble("downloadedBytes", safeBytes.toDouble())
      putDouble("totalBytes", ModelPackCatalog.totalBytes.toDouble())
      putString("message", if (supported) status.third else "Natural voice needs a 64-bit Android phone.")
      putBoolean("supported", supported)
      putDouble("availableBytes", store.availableBytes().toDouble())
      putDouble("memoryBytes", memoryInfo.totalMem.toDouble())
      putString("packVersion", ModelPackCatalog.PACK_VERSION)
    }
  }

  private fun emitCurrentStatus(workInfo: WorkInfo?) {
    if (listenerCount <= 0 || !reactApplicationContext.hasActiveReactInstance()) return
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(EVENT_NAME, statusMap(workInfo))
  }

  private fun selectWork(work: List<WorkInfo>): WorkInfo? =
    work.firstOrNull { !it.state.isFinished } ?: work.firstOrNull()

  override fun invalidate() {
    mainHandler.post { workInfoLiveData.removeObserver(workObserver) }
    super.invalidate()
  }
}
