package com.aireader

import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.floor

internal data class MonoAudio(val samples: FloatArray, val sampleRate: Int)

internal object WavAudio {
  fun readMono(file: File, targetSampleRate: Int = 24_000, maxSeconds: Int = 12): MonoAudio {
    val bytes = file.readBytes()
    require(bytes.size >= 44 && ascii(bytes, 0, 4) == "RIFF" && ascii(bytes, 8, 4) == "WAVE") {
      "The phone voice did not create a readable WAV reference."
    }
    var offset = 12
    var format = 0
    var channels = 0
    var sampleRate = 0
    var bits = 0
    var dataOffset = -1
    var dataSize = 0
    while (offset + 8 <= bytes.size) {
      val id = ascii(bytes, offset, 4)
      val size = littleInt(bytes, offset + 4).coerceAtLeast(0)
      val body = offset + 8
      if (body + size > bytes.size) break
      when (id) {
        "fmt " -> {
          format = littleShort(bytes, body)
          channels = littleShort(bytes, body + 2)
          sampleRate = littleInt(bytes, body + 4)
          bits = littleShort(bytes, body + 14)
        }
        "data" -> {
          dataOffset = body
          dataSize = size
          break
        }
      }
      offset = body + size + (size and 1)
    }
    require(dataOffset >= 0 && channels > 0 && sampleRate > 0) { "The WAV reference is missing audio data." }
    require(format == 1 || format == 3) { "The WAV reference uses an unsupported audio format." }
    val bytesPerSample = bits / 8
    require(bytesPerSample in 1..4) { "The WAV reference uses an unsupported bit depth." }
    val frameSize = bytesPerSample * channels
    val frameCount = (dataSize / frameSize).coerceAtMost(sampleRate * maxSeconds)
    val mono = FloatArray(frameCount)
    for (frame in 0 until frameCount) {
      var mixed = 0f
      for (channel in 0 until channels) {
        val sampleOffset = dataOffset + frame * frameSize + channel * bytesPerSample
        mixed += decodeSample(bytes, sampleOffset, format, bits)
      }
      mono[frame] = (mixed / channels).coerceIn(-1f, 1f)
    }
    if (sampleRate == targetSampleRate) return MonoAudio(mono, sampleRate)
    val targetCount = ((mono.size.toLong() * targetSampleRate) / sampleRate).toInt().coerceAtLeast(1)
    val resampled = FloatArray(targetCount)
    val scale = sampleRate.toDouble() / targetSampleRate
    for (index in resampled.indices) {
      val source = index * scale
      val left = floor(source).toInt().coerceIn(0, mono.lastIndex)
      val right = (left + 1).coerceAtMost(mono.lastIndex)
      val fraction = (source - left).toFloat()
      resampled[index] = mono[left] * (1f - fraction) + mono[right] * fraction
    }
    return MonoAudio(resampled, targetSampleRate)
  }

  fun writeMonoPcm16(file: File, samples: FloatArray, sampleRate: Int = 24_000) {
    file.parentFile?.mkdirs()
    val dataSize = samples.size * 2
    val header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
    header.put("RIFF".toByteArray(Charsets.US_ASCII))
    header.putInt(36 + dataSize)
    header.put("WAVEfmt ".toByteArray(Charsets.US_ASCII))
    header.putInt(16)
    header.putShort(1)
    header.putShort(1)
    header.putInt(sampleRate)
    header.putInt(sampleRate * 2)
    header.putShort(2)
    header.putShort(16)
    header.put("data".toByteArray(Charsets.US_ASCII))
    header.putInt(dataSize)
    FileOutputStream(file).use { output ->
      output.write(header.array())
      val block = ByteBuffer.allocate(8192).order(ByteOrder.LITTLE_ENDIAN)
      samples.forEach { sample ->
        if (block.remaining() < 2) {
          output.write(block.array(), 0, block.position())
          block.clear()
        }
        val pcm = (sample.coerceIn(-1f, 1f) * 32767f).toInt().toShort()
        block.putShort(pcm)
      }
      if (block.position() > 0) output.write(block.array(), 0, block.position())
    }
  }

  fun writeMonoPcm16Bytes(file: File, pcmBytes: ByteArray, sampleRate: Int = 24_000) {
    file.parentFile?.mkdirs()
    val dataSize = pcmBytes.size
    val header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
    header.put("RIFF".toByteArray(Charsets.US_ASCII))
    header.putInt(36 + dataSize)
    header.put("WAVEfmt ".toByteArray(Charsets.US_ASCII))
    header.putInt(16)
    header.putShort(1)
    header.putShort(1)
    header.putInt(sampleRate)
    header.putInt(sampleRate * 2)
    header.putShort(2)
    header.putShort(16)
    header.put("data".toByteArray(Charsets.US_ASCII))
    header.putInt(dataSize)
    FileOutputStream(file).use { output ->
      output.write(header.array())
      output.write(pcmBytes)
    }
  }

  private fun decodeSample(bytes: ByteArray, offset: Int, format: Int, bits: Int): Float = when {
    format == 3 && bits == 32 -> ByteBuffer.wrap(bytes, offset, 4).order(ByteOrder.LITTLE_ENDIAN).float
    bits == 8 -> ((bytes[offset].toInt() and 0xff) - 128) / 128f
    bits == 16 -> littleSignedShort(bytes, offset) / 32768f
    bits == 24 -> {
      var value = (bytes[offset].toInt() and 0xff) or
        ((bytes[offset + 1].toInt() and 0xff) shl 8) or
        ((bytes[offset + 2].toInt() and 0xff) shl 16)
      if ((value and 0x800000) != 0) value = value or -0x1000000
      value / 8_388_608f
    }
    bits == 32 -> ByteBuffer.wrap(bytes, offset, 4).order(ByteOrder.LITTLE_ENDIAN).int / 2_147_483_648f
    else -> 0f
  }

  private fun ascii(bytes: ByteArray, offset: Int, length: Int) =
    String(bytes, offset, length, Charsets.US_ASCII)

  private fun littleShort(bytes: ByteArray, offset: Int) =
    (bytes[offset].toInt() and 0xff) or ((bytes[offset + 1].toInt() and 0xff) shl 8)

  private fun littleSignedShort(bytes: ByteArray, offset: Int) = littleShort(bytes, offset).toShort().toInt()

  private fun littleInt(bytes: ByteArray, offset: Int) =
    ByteBuffer.wrap(bytes, offset, 4).order(ByteOrder.LITTLE_ENDIAN).int
}
