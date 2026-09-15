package com.aireader.narration

import com.aireader.WavAudio
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import kotlin.math.abs

class AudioDecoderTest {

  @get:Rule
  val tempFolder = TemporaryFolder()

  @Test
  fun testResampleSameRateReturnsIdentical() {
    val input = floatArrayOf(0.1f, 0.2f, -0.3f, 0.5f, 0.0f)
    val output = AudioDecoder.resample(input, 24000, 24000)
    assertEquals(input.size, output.size)
    for (i in input.indices) {
      assertEquals(input[i], output[i], 1e-6f)
    }
  }

  @Test
  fun testResampleDownsampleProducesCorrectLength() {
    // 48 kHz to 24 kHz halves the sample count
    val input = FloatArray(4800) { 0.5f }
    val output = AudioDecoder.resample(input, 48000, 24000)
    assertEquals(2400, output.size)
    for (sample in output) {
      assertEquals(0.5f, sample, 1e-4f)
    }
  }

  @Test
  fun testResampleUpsampleProducesCorrectLength() {
    // 16 kHz to 24 kHz increases by 1.5x
    val input = FloatArray(1600) { 0.25f }
    val output = AudioDecoder.resample(input, 16000, 24000)
    assertEquals(2400, output.size)
    for (sample in output) {
      assertEquals(0.25f, sample, 1e-4f)
    }
  }

  @Test
  fun testNormalizePeakScalesQuietAudio() {
    val input = floatArrayOf(0.1f, -0.2f, 0.05f)
    AudioDecoder.normalizePeak(input)
    var maxVal = 0f
    for (s in input) {
      val a = abs(s)
      if (a > maxVal) maxVal = a
    }
    assertEquals(0.95f, maxVal, 1e-4f)
  }

  @Test
  fun testWavAudioWriteAndReadRoundTrip() {
    val tempFile = tempFolder.newFile("test_audio.wav")
    val originalSamples = floatArrayOf(0.0f, 0.5f, -0.5f, 0.25f, -0.25f)
    val sampleRate = 24000

    WavAudio.writeMonoPcm16(tempFile, originalSamples, sampleRate)

    assertTrue(tempFile.exists())
    assertTrue(tempFile.length() > 44) // WAV header is 44 bytes

    val monoAudio = WavAudio.readMono(tempFile, targetSampleRate = sampleRate)
    assertEquals(sampleRate, monoAudio.sampleRate)
    assertEquals(originalSamples.size, monoAudio.samples.size)

    for (i in originalSamples.indices) {
      // 16-bit PCM quantization error is <= 1/32768 (~0.0001)
      assertEquals(originalSamples[i], monoAudio.samples[i], 0.001f)
    }
  }
}

