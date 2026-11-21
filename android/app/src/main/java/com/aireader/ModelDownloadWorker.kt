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
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileOutputStream
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

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

  private val httpClient = OkHttpClient.Builder()
    .connectTimeout(30, TimeUnit.SECONDS)
    .readTimeout(60, TimeUnit.SECONDS)
    .writeTimeout(60, TimeUnit.SECONDS)
    .followRedirects(true)
    .followSslRedirects(true)
    .retryOnConnectionFailure(true)
    .build()

  override fun doWork(): Result {
    applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit().putBoolean(PREF_PAUSED, false).apply()
    return try {
      store.recoverInterruptedInstall()
      if (store.isInstalled()) return Result.success(statusData("ready", ModelPackCatalog.totalBytes, "Natural voice is ready"))
      val downloadedBytes = store.downloadedBytes()
      try {
        setForegroundAsync(foregroundInfo("checking", downloadedBytes, "Checking storage"))
      } catch (_: Exception) {}
      setState("checking", downloadedBytes, "Checking storage")
      store.assertEnoughStorage()
      setState("downloading", store.downloadedBytes(), "Downloading Kokoro neural voice")
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
      setState("ready", ModelPackCatalog.totalBytes, "Kokoro neural voice installed and verified")
      Result.success(statusData("ready", ModelPackCatalog.totalBytes, "Kokoro neural voice installed and verified"))
    } catch (_: InterruptedException) {
      Result.failure(statusData("paused", store.downloadedBytes(), "Download paused"))
    } catch (error: Exception) {
      val message = error.message ?: "The voice download could not be completed."
      setState("failed", store.downloadedBytes(), message)
      Result.failure(statusData("failed", store.downloadedBytes(), message))
    }
  }

  private fun downloadArtifact(artifact: ModelArtifact) {
    val destination = File(store.staging, artifact.path)
    destination.parentFile?.mkdirs()

    if (destination.isFile && destination.length() >= artifact.minBytes) {
      if (artifact.sha256 == null || store.sha256(destination) == artifact.sha256) {
        emitDownloadProgress()
        return
      }
      destination.delete()
    }

    var existingBytes = destination.length()
    val encodedPath = artifact.path.split('/').joinToString("/") {
      URLEncoder.encode(it, Charsets.UTF_8.name()).replace("+", "%20")
    }
    val initialUrl = "${ModelPackCatalog.SOURCE_ROOT}/$encodedPath"

    var currentUrl = initialUrl
    var response: Response? = null
    var redirectCount = 0
    val maxRedirects = 10

    while (redirectCount < maxRedirects) {
      if (isStopped) throw InterruptedException("Download paused")
      val requestBuilder = Request.Builder()
        .url(currentUrl)
        .header("User-Agent", "AIReader-Android/1.0")
      if (existingBytes > 0) {
        requestBuilder.header("Range", "bytes=$existingBytes-")
      }
      val res = httpClient.newCall(requestBuilder.build()).execute()
      val code = res.code
      if (code in 300..399) {
        val location = res.header("Location")
        val requestUrl = res.request.url
        res.close()
        if (location.isNullOrEmpty()) {
          throw IllegalStateException("Redirect from $currentUrl missing Location header ($code)")
        }
        val resolved = requestUrl.resolve(location)
          ?: throw IllegalStateException("Invalid redirect location '$location' from $currentUrl")
        currentUrl = resolved.toString()
        redirectCount++
        continue
      }
      response = res
      break
    }

    val finalResponse = response ?: throw IllegalStateException("Too many redirects downloading ${artifact.path}")
    try {
      if (!finalResponse.isSuccessful) {
        throw IllegalStateException("Voice download failed (${finalResponse.code} ${finalResponse.message}). Please retry.")
      }
      val body = finalResponse.body ?: throw IllegalStateException("Empty response body for ${artifact.path}")
      val append = existingBytes > 0 && finalResponse.code == 206
      if (!append) existingBytes = 0

      BufferedInputStream(body.byteStream(), 64 * 1024).use { input ->
        BufferedOutputStream(FileOutputStream(destination, append), 64 * 1024).use { output ->
          val buffer = ByteArray(64 * 1024)
          var lastProgress = 0L
          while (true) {
            if (isStopped) throw InterruptedException("Download paused")
            val count = input.read(buffer)
            if (count < 0) break
            output.write(buffer, 0, count)
            val now = System.currentTimeMillis()
            if (now - lastProgress >= 300L) {
              output.flush()
              emitDownloadProgress()
              lastProgress = now
            }
          }
          output.flush()
        }
      }
    } finally {
      finalResponse.close()
    }

    if (destination.length() < artifact.minBytes || (artifact.sha256 != null && store.sha256(destination) != artifact.sha256)) {
      destination.delete()
      throw IllegalStateException("A downloaded voice file was incomplete. Please retry.")
    }
    emitDownloadProgress()
  }

  private fun emitDownloadProgress() = setState("downloading", store.downloadedBytes(), "Downloading natural voice")

  private fun setState(state: String, bytes: Long, message: String) {
    val data = statusData(state, bytes, message)
    setProgressAsync(data)
    try {
      setForegroundAsync(foregroundInfo(state, bytes, message))
    } catch (_: Exception) {}
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
