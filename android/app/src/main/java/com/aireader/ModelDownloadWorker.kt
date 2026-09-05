package com.aireader

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.ForegroundInfo
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

internal class ModelDownloadWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
  companion object {
    const val UNIQUE_WORK_NAME = "natural-voice-model-download"
    const val EVENT_STATE = "state"
    const val EVENT_BYTES = "downloadedBytes"
    const val EVENT_TOTAL = "totalBytes"
    const val EVENT_MESSAGE = "message"
    const val PREFS = "model-download"
    const val PREF_PAUSED = "pause-requested"
    private const val CHANNEL_ID = "voice_model_download"
    private const val NOTIFICATION_ID = 4102

    fun request(wifiOnly: Boolean) = OneTimeWorkRequestBuilder<ModelDownloadWorker>()
      .setConstraints(
        Constraints.Builder()
          .setRequiredNetworkType(if (wifiOnly) NetworkType.UNMETERED else NetworkType.CONNECTED)
          .build(),
      )
      .build()
  }

  private val store = ModelPackStore(applicationContext)

  override fun doWork(): Result {
    applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit().putBoolean(PREF_PAUSED, false).apply()
    return try {
      store.recoverInterruptedInstall()
      if (store.isInstalled()) return Result.success(statusData("ready", ModelPackCatalog.totalBytes, "Natural voice is ready"))
      val downloadedBytes = store.downloadedBytes()
      setForegroundAsync(foregroundInfo("checking", downloadedBytes, "Checking storage")).get()
      setState("checking", downloadedBytes, "Checking storage")
      store.assertEnoughStorage()
      setState("downloading", store.downloadedBytes(), "Downloading natural voice")
      ModelPackCatalog.artifacts.forEach { artifact ->
        if (isStopped) throw InterruptedException("Download paused")
        downloadArtifact(artifact)
      }
      setState("verifying", ModelPackCatalog.totalBytes, "Checking downloaded files")
      store.verifyStaging { verified ->
        if (isStopped) throw InterruptedException("Download paused")
        setState(
          "verifying",
          ModelPackCatalog.totalBytes,
          "Checking voice files (${(verified * 100 / ModelPackCatalog.totalBytes).toInt()}%)",
        )
      }
      store.activateVerifiedStaging()
      setState("ready", ModelPackCatalog.totalBytes, "Natural voice installed and verified")
      Result.success(statusData("ready", ModelPackCatalog.totalBytes, "Natural voice installed and verified"))
    } catch (_: InterruptedException) {
      Result.failure(statusData("paused", store.downloadedBytes(), "Download paused"))
    } catch (error: Exception) {
      Result.failure(statusData("failed", store.downloadedBytes(), error.message ?: "The voice download could not be completed."))
    }
  }

  private fun downloadArtifact(artifact: ModelArtifact) {
    val destination = File(store.staging, artifact.path)
    destination.parentFile?.mkdirs()
    if (destination.length() == artifact.bytes) {
      if (store.sha256(destination) == artifact.sha256) {
        emitDownloadProgress()
        return
      }
      destination.delete()
    } else if (destination.length() > artifact.bytes) destination.delete()

    var existingBytes = destination.length()
    val encodedPath = artifact.path.split('/').joinToString("/") {
      URLEncoder.encode(it, Charsets.UTF_8.name()).replace("+", "%20")
    }
    val connection = URL("${ModelPackCatalog.SOURCE_ROOT}/$encodedPath?download=true").openConnection() as HttpURLConnection
    connection.instanceFollowRedirects = true
    connection.connectTimeout = 30_000
    connection.readTimeout = 60_000
    connection.setRequestProperty("User-Agent", "AIReader-Android/1.0")
    if (existingBytes > 0) connection.setRequestProperty("Range", "bytes=$existingBytes-")
    try {
      connection.connect()
      if (connection.responseCode !in 200..299) {
        throw IllegalStateException("Voice download failed (${connection.responseCode}). Please retry.")
      }
      val append = existingBytes > 0 && connection.responseCode == HttpURLConnection.HTTP_PARTIAL
      if (!append) existingBytes = 0
      BufferedInputStream(connection.inputStream, 1024 * 1024).use { input ->
        BufferedOutputStream(FileOutputStream(destination, append), 1024 * 1024).use { output ->
          val buffer = ByteArray(1024 * 1024)
          var lastProgress = 0L
          while (true) {
            if (isStopped) throw InterruptedException("Download paused")
            val count = input.read(buffer)
            if (count < 0) break
            output.write(buffer, 0, count)
            val now = System.currentTimeMillis()
            if (now - lastProgress >= 400L) {
              emitDownloadProgress()
              lastProgress = now
            }
          }
          output.flush()
        }
      }
    } finally {
      connection.disconnect()
    }
    if (destination.length() != artifact.bytes || store.sha256(destination) != artifact.sha256) {
      destination.delete()
      throw IllegalStateException("A downloaded voice file was incomplete. Please retry.")
    }
    emitDownloadProgress()
  }

  private fun emitDownloadProgress() = setState("downloading", store.downloadedBytes(), "Downloading natural voice")

  private fun setState(state: String, bytes: Long, message: String) {
    val data = statusData(state, bytes, message)
    setProgressAsync(data)
    setForegroundAsync(foregroundInfo(state, bytes, message))
  }

  private fun statusData(state: String, bytes: Long, message: String): Data = Data.Builder()
    .putString(EVENT_STATE, state)
    .putLong(EVENT_BYTES, bytes.coerceIn(0L, ModelPackCatalog.totalBytes))
    .putLong(EVENT_TOTAL, ModelPackCatalog.totalBytes)
    .putString(EVENT_MESSAGE, message)
    .build()

  private fun foregroundInfo(state: String, bytes: Long, message: String): ForegroundInfo {
    val manager = applicationContext.getSystemService(Service.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, "Natural voice download", NotificationManager.IMPORTANCE_LOW))
    }
    val max = 10_000
    val progress = ((bytes.toDouble() / ModelPackCatalog.totalBytes) * max).toInt().coerceIn(0, max)
    val cancelIntent: PendingIntent = WorkManager.getInstance(applicationContext).createCancelPendingIntent(id)
    val notification = NotificationCompat.Builder(applicationContext, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.stat_sys_download)
      .setContentTitle("AI Book Reader")
      .setContentText(message)
      .setOnlyAlertOnce(true)
      .setOngoing(state != "ready" && state != "failed")
      .setProgress(max, progress, state == "checking")
      .addAction(android.R.drawable.ic_media_pause, "Pause", cancelIntent)
      .build()
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      ForegroundInfo(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    } else ForegroundInfo(NOTIFICATION_ID, notification)
  }
}
