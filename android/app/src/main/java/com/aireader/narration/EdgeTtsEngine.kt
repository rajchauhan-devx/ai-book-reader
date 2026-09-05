package com.aireader.narration

import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

object EdgeTtsEngine {

  private const val TAG = "EdgeTtsEngine"
  private const val TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4"
  private const val CHROMIUM_FULL_VERSION = "143.0.3650.75"
  private const val SEC_MS_GEC_VERSION = "1-143.0.3650.75"
  private const val WIN_EPOCH = 11644473600L

  private val okHttpClient = OkHttpClient.Builder()
    .connectTimeout(10, TimeUnit.SECONDS)
    .readTimeout(25, TimeUnit.SECONDS)
    .writeTimeout(10, TimeUnit.SECONDS)
    .build()

  private fun generateSecMsGec(): String {
    val ticks = (System.currentTimeMillis() / 1000L) + WIN_EPOCH
    val roundedTicks = ticks - (ticks % 300L)
    val ticks100ns = roundedTicks * 10_000_000L
    val strToHash = "$ticks100ns$TRUSTED_CLIENT_TOKEN"
    val md = MessageDigest.getInstance("SHA-256")
    val digest = md.digest(strToHash.toByteArray(Charsets.US_ASCII))
    return digest.joinToString("") { "%02X".format(it) }
  }

  private fun generateMuid(): String {
    return UUID.randomUUID().toString().replace("-", "").uppercase(Locale.US)
  }

  private fun escapeXml(text: String): String {
    return text.replace("&", "&amp;")
      .replace("<", "&lt;")
      .replace(">", "&gt;")
      .replace("\"", "&quot;")
      .replace("'", "&apos;")
  }

  fun synthesize(
    text: String,
    voiceName: String,
    targetFile: File,
    rate: String = "+0%",
    pitch: String = "+0Hz",
    emotionStyle: String? = null,
  ): Result<Unit> {
    if (text.isBlank()) {
      return Result.failure(IllegalArgumentException("Text cannot be blank"))
    }

    val secMsGec = generateSecMsGec()
    val connId = UUID.randomUUID().toString().replace("-", "")
    val url = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=$TRUSTED_CLIENT_TOKEN&Sec-MS-GEC=$secMsGec&Sec-MS-GEC-Version=$SEC_MS_GEC_VERSION&ConnectionId=$connId"

    val request = Request.Builder()
      .url(url)
      .header("Pragma", "no-cache")
      .header("Cache-Control", "no-cache")
      .header("Origin", "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold")
      .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/$CHROMIUM_FULL_VERSION")
      .header("Cookie", "muid=${generateMuid()};")
      .build()

    val latch = CountDownLatch(1)
    val audioBuffer = ByteArrayOutputStream()
    val errorRef = AtomicReference<Throwable?>(null)
    val turnEnded = AtomicBoolean(false)

    val cleanVoice = if (voiceName.isNotBlank() && voiceName.startsWith("en-")) voiceName else "en-US-JennyNeural"

    val webSocket = okHttpClient.newWebSocket(request, object : WebSocketListener() {
      override fun onOpen(webSocket: WebSocket, response: Response) {
        val configMsg = "Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{\"context\":{\"synthesis\":{\"audio\":{\"metadataoptions\":{\"sentenceBoundaryEnabled\":\"false\",\"wordBoundaryEnabled\":\"false\"},\"outputFormat\":\"audio-24khz-48kbitrate-mono-mp3\"}}}}\r\n"
        webSocket.send(configMsg)

        val reqId = UUID.randomUUID().toString().replace("-", "")
        val sdf = SimpleDateFormat("EEE MMM dd yyyy HH:mm:ss 'GMT+0000 (Coordinated Universal Time)'", Locale.US).apply {
          timeZone = TimeZone.getTimeZone("UTC")
        }
        val timestamp = sdf.format(Date())
        val escaped = escapeXml(text)

        val cleanStyle = when (emotionStyle?.lowercase(Locale.ROOT)) {
          "whispering" -> "whispering"
          "excited" -> "excited"
          "cheerful" -> "cheerful"
          "terrified" -> "terrified"
          "angry" -> "angry"
          "sad" -> "sad"
          "dramatic" -> "excited"
          else -> null
        }

        val prosody = "<prosody pitch='$pitch' rate='$rate' volume='+0%'>$escaped</prosody>"
        val innerVoice = if (!cleanStyle.isNullOrBlank()) {
          "<mstts:express-as style='$cleanStyle' styledegree='1.3'>$prosody</mstts:express-as>"
        } else {
          prosody
        }

        val ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='https://www.w3.org/2001/mstts' xml:lang='en-US'><voice name='$cleanVoice'>$innerVoice</voice></speak>"
        val ssmlMsg = "X-RequestId:$reqId\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:$timestamp\r\nPath:ssml\r\n\r\n$ssml"
        webSocket.send(ssmlMsg)
      }

      override fun onMessage(webSocket: WebSocket, text: String) {
        if (text.contains("Path:turn.end")) {
          turnEnded.set(true)
          latch.countDown()
          webSocket.close(1000, "Done")
        }
      }

      override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
        val raw = bytes.toByteArray()
        if (raw.size > 2) {
          val headerLen = ((raw[0].toInt() and 0xFF) shl 8) or (raw[1].toInt() and 0xFF)
          val audioStart = 2 + headerLen
          if (audioStart < raw.size) {
            audioBuffer.write(raw, audioStart, raw.size - audioStart)
          }
        }
      }

      override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
        Log.e(TAG, "WebSocket failure: ${t.message}", t)
        errorRef.set(t)
        latch.countDown()
      }

      override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
        latch.countDown()
      }
    })

    val completed = try {
      latch.await(20, TimeUnit.SECONDS)
    } catch (e: InterruptedException) {
      webSocket.cancel()
      return Result.failure(e)
    }

    val err = errorRef.get()
    if (err != null) {
      return Result.failure(err)
    }

    if (!completed || !turnEnded.get()) {
      webSocket.cancel()
      return Result.failure(IllegalStateException("Edge TTS request timed out"))
    }

    val audioBytes = audioBuffer.toByteArray()
    if (audioBytes.isEmpty()) {
      return Result.failure(IllegalStateException("Edge TTS returned no audio"))
    }

    try {
      targetFile.parentFile?.mkdirs()
      FileOutputStream(targetFile).use { fos ->
        fos.write(audioBytes)
        fos.flush()
      }
      return Result.success(Unit)
    } catch (e: Exception) {
      return Result.failure(e)
    }
  }
}
