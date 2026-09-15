package com.aireader.narration

import android.content.Context
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import com.aireader.WavAudio
import java.io.File
import java.nio.ByteOrder
import kotlin.math.abs
import kotlin.math.floor

internal object AudioDecoder {
  private const val TIMEOUT_US = 5000L

  fun decodeTo24kHzMonoWav(
    context: Context,
    uri: Uri,
    targetFile: File,
    maxSeconds: Int = 12,
    targetSampleRate: Int = 24_000,
  ): Double {
    val extractor = MediaExtractor()
    try {
      extractor.setDataSource(context, uri, null)
      var audioTrackIndex = -1
      var audioFormat: MediaFormat? = null
      for (i in 0 until extractor.trackCount) {
        val format = extractor.getTrackFormat(i)
        val mime = format.getString(MediaFormat.KEY_MIME) ?: ""
        if (mime.startsWith("audio/")) {
          audioTrackIndex = i
          audioFormat = format
          break
        }
      }
      require(audioTrackIndex >= 0 && audioFormat != null) {
        "No audio track was found in the selected file."
      }
      extractor.selectTrack(audioTrackIndex)

      val mime = audioFormat.getString(MediaFormat.KEY_MIME)!!
      val sampleRate = if (audioFormat.containsKey(MediaFormat.KEY_SAMPLE_RATE)) {
        audioFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE)
      } else 44100
      val channelCount = if (audioFormat.containsKey(MediaFormat.KEY_CHANNEL_COUNT)) {
        audioFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
      } else 1

      val codec = MediaCodec.createDecoderByType(mime)
      val pcmSamples = mutableListOf<Float>()
      val maxInputSamples = sampleRate * maxSeconds

      try {
        codec.configure(audioFormat, null, null, 0)
        codec.start()

        val bufferInfo = MediaCodec.BufferInfo()
        var isExtractorEOS = false
        var isCodecEOS = false
        var totalFramesExtracted = 0

        while (!isCodecEOS && totalFramesExtracted < maxInputSamples) {
          if (!isExtractorEOS) {
            val inputBufferId = codec.dequeueInputBuffer(TIMEOUT_US)
            if (inputBufferId >= 0) {
              val inputBuffer = codec.getInputBuffer(inputBufferId)
              if (inputBuffer != null) {
                val sampleSize = extractor.readSampleData(inputBuffer, 0)
                if (sampleSize < 0) {
                  codec.queueInputBuffer(inputBufferId, 0, 0, 0L, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                  isExtractorEOS = true
                } else {
                  val presentationTimeUs = extractor.sampleTime
                  codec.queueInputBuffer(inputBufferId, 0, sampleSize, presentationTimeUs, 0)
                  extractor.advance()
                }
              }
            }
          }

          val outputBufferId = codec.dequeueOutputBuffer(bufferInfo, TIMEOUT_US)
          if (outputBufferId >= 0) {
            val outputBuffer = codec.getOutputBuffer(outputBufferId)
            if (outputBuffer != null && bufferInfo.size > 0) {
              outputBuffer.position(bufferInfo.offset)
              outputBuffer.limit(bufferInfo.offset + bufferInfo.size)
              outputBuffer.order(ByteOrder.LITTLE_ENDIAN)

              val shortBuffer = outputBuffer.asShortBuffer()
              val shortCount = shortBuffer.remaining()
              val frames = shortCount / channelCount

              for (f in 0 until frames) {
                if (totalFramesExtracted >= maxInputSamples) break
                var sum = 0f
                for (c in 0 until channelCount) {
                  sum += shortBuffer.get() / 32768.0f
                }
                pcmSamples.add((sum / channelCount).coerceIn(-1.0f, 1.0f))
                totalFramesExtracted++
              }
            }
            codec.releaseOutputBuffer(outputBufferId, false)
            if ((bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
              isCodecEOS = true
            }
          }
        }
      } finally {
        try {
          codec.stop()
        } catch (_: Exception) {}
        codec.release()
      }

      require(pcmSamples.isNotEmpty()) {
        "The audio file could not be decoded or contains no audio data."
      }

      val rawFloats = pcmSamples.toFloatArray()
      val resampled = if (sampleRate == targetSampleRate) {
        rawFloats
      } else {
        resample(rawFloats, sampleRate, targetSampleRate)
      }

      normalizePeak(resampled)

      WavAudio.writeMonoPcm16(targetFile, resampled, targetSampleRate)

      return resampled.size.toDouble() / targetSampleRate.toDouble()
    } finally {
      extractor.release()
    }
  }

  internal fun resample(source: FloatArray, sourceRate: Int, targetRate: Int): FloatArray {
    if (sourceRate == targetRate) return source
    val targetCount = ((source.size.toLong() * targetRate) / sourceRate).toInt().coerceAtLeast(1)
    val resampled = FloatArray(targetCount)
    val scale = sourceRate.toDouble() / targetRate
    for (index in resampled.indices) {
      val src = index * scale
      val left = floor(src).toInt().coerceIn(0, source.lastIndex)
      val right = (left + 1).coerceAtMost(source.lastIndex)
      val fraction = (src - left).toFloat()
      resampled[index] = source[left] * (1f - fraction) + source[right] * fraction
    }
    return resampled
  }

  internal fun normalizePeak(samples: FloatArray) {
    var maxAmp = 0f
    for (s in samples) {
      val a = abs(s)
      if (a > maxAmp) maxAmp = a
    }
    if (maxAmp > 0.01f && maxAmp < 0.95f) {
      val factor = 0.95f / maxAmp
      for (i in samples.indices) {
        samples[i] = (samples[i] * factor).coerceIn(-1.0f, 1.0f)
      }
    }
  }
}
