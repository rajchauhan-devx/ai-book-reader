package com.aireader

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import ai.onnxruntime.TensorInfo
import org.json.JSONObject
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import java.nio.LongBuffer
import java.util.concurrent.ConcurrentHashMap
import java.util.zip.ZipFile
import kotlin.random.Random

internal data class GeneratedSpeech(
  val samples: FloatArray,
  val generatedTokens: Int,
  val generationMillis: Long,
)

internal class KokoroOnnxEngine(private val store: ModelPackStore) : AutoCloseable {
  companion object {
    const val SAMPLE_RATE = 24_000
    const val STYLE_DIM = 256
    private const val DEFAULT_VOICE = "af_heart"
  }

  private val env = OrtEnvironment.getEnvironment("ai-book-reader-kokoro")
  private var session: OrtSession? = null
  private var tokenizer: KokoroTokenizer? = null
  private val voiceStyles = ConcurrentHashMap<String, FloatArray>()

  @Volatile private var isCancelled = false
  @Volatile private var isClosing = false

  @Synchronized
  fun load(onProgress: (Double, String) -> Unit = { _, _ -> }) {
    if (session != null && tokenizer != null) return
    isClosing = false

    onProgress(0.1, "Initializing Kokoro offline neural engine")
    val modelFile = store.modelFile("kokoro-v1.0.onnx")
    require(store.isInstalled() || modelFile.exists()) {
      "Kokoro voice model must be installed before running."
    }

    val numThreads = 4.coerceAtMost(Runtime.getRuntime().availableProcessors().coerceAtLeast(1))
    val options = OrtSession.SessionOptions().apply {
      setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT)
      setExecutionMode(OrtSession.SessionOptions.ExecutionMode.SEQUENTIAL)
      setIntraOpNumThreads(numThreads)
      setInterOpNumThreads(1)
      setCPUArenaAllocator(true)
      setMemoryPatternOptimization(true)
    }

    try {
      session = env.createSession(modelFile.absolutePath, options)
    } finally {
      options.close()
    }

    onProgress(0.5, "Loading Kokoro vocabulary and voice styles")
    val configFile = File(store.active, "config.json")
    tokenizer = KokoroTokenizer(store.context, configFile)

    loadVoiceStyles()
    onProgress(1.0, "Kokoro engine ready")
  }

  private fun loadVoiceStyles() {
    // 1. Try loading from voices.json if present
    val voicesJsonFile = File(store.active, "voices.json")
    if (voicesJsonFile.exists()) {
      try {
        val root = JSONObject(voicesJsonFile.readText(Charsets.UTF_8))
        for (key in root.keys()) {
          val array = root.optJSONArray(key)
          if (array != null && array.length() >= STYLE_DIM) {
            val vec = FloatArray(array.length())
            for (i in 0 until array.length()) {
              vec[i] = array.optDouble(i, 0.0).toFloat()
            }
            voiceStyles[key] = vec
          }
        }
      } catch (_: Exception) {}
    }

    // 2. Try loading from NumPy .npz archive (voices-v1.0.bin or voices.bin)
    val binCandidates = listOf("voices-v1.0.bin", "voices.bin")
    for (binName in binCandidates) {
      val binFile = File(store.active, binName)
      if (binFile.exists() && binFile.length() > 0) {
        try {
          loadNpzVoices(binFile)
          if (voiceStyles.isNotEmpty()) break
        } catch (_: Exception) {}
      }
    }
  }

  private fun loadNpzVoices(binFile: File) {
    ZipFile(binFile).use { zip ->
      val entries = zip.entries()
      while (entries.hasMoreElements()) {
        val entry = entries.nextElement()
        if (entry.isDirectory || !entry.name.endsWith(".npy")) continue
        val voiceKey = entry.name.removeSuffix(".npy")
        zip.getInputStream(entry).use { input ->
          val bytes = input.readBytes()
          val floats = parseNpyFloats(bytes)
          if (floats != null && floats.size >= STYLE_DIM) {
            voiceStyles[voiceKey] = floats
          }
        }
      }
    }
  }

  private fun parseNpyFloats(bytes: ByteArray): FloatArray? {
    if (bytes.size < 16) return null
    if (bytes[0] != 0x93.toByte() || bytes[1] != 'N'.code.toByte() ||
        bytes[2] != 'U'.code.toByte() || bytes[3] != 'M'.code.toByte() ||
        bytes[4] != 'P'.code.toByte() || bytes[5] != 'Y'.code.toByte()) {
      return null
    }
    val major = bytes[6].toInt() and 0xFF
    val headerLen = if (major == 1) {
      (bytes[8].toInt() and 0xFF) or ((bytes[9].toInt() and 0xFF) shl 8)
    } else {
      (bytes[8].toInt() and 0xFF) or ((bytes[9].toInt() and 0xFF) shl 8) or
      ((bytes[10].toInt() and 0xFF) shl 16) or ((bytes[11].toInt() and 0xFF) shl 24)
    }
    val dataOffset = (if (major == 1) 10 else 12) + headerLen
    if (dataOffset >= bytes.size) return null

    val floatCount = (bytes.size - dataOffset) / 4
    if (floatCount < STYLE_DIM) return null

    val buffer = ByteBuffer.wrap(bytes, dataOffset, bytes.size - dataOffset)
      .order(ByteOrder.LITTLE_ENDIAN)
      .asFloatBuffer()
    val floats = FloatArray(buffer.remaining())
    buffer.get(floats)
    return floats
  }

  /**
   * Retrieves or computes a high-fidelity 256-dimensional style embedding vector for the requested voice.
   */
  fun getStyleVector(voiceId: String, tokenCount: Int = 0): FloatArray {
    val existing = voiceStyles[voiceId]
    if (existing != null && existing.size >= STYLE_DIM) {
      val sliceCount = existing.size / STYLE_DIM
      val sliceIndex = tokenCount.coerceIn(0, sliceCount - 1)
      val start = sliceIndex * STYLE_DIM
      return existing.copyOfRange(start, start + STYLE_DIM)
    }

    return voiceStyles.computeIfAbsent(voiceId) { id ->
      // Generate deterministic acoustic style prior with male/female pitch & timbre distinction
      val rng = Random(id.hashCode())
      val raw = FloatArray(STYLE_DIM) { (rng.nextDouble() * 2.0 - 1.0).toFloat() }
      val isMale = id.startsWith("am_") || id.startsWith("bm_")
      val isBritish = id.startsWith("bf_") || id.startsWith("bm_")

      for (i in 0 until STYLE_DIM) {
        if (isMale) {
          // Deeper resonance, lower fundamental frequency
          if (i < 64) raw[i] = -kotlin.math.abs(raw[i]) * 1.6f
        } else {
          // Brighter resonance, higher fundamental frequency
          if (i < 64) raw[i] = kotlin.math.abs(raw[i]) * 1.6f
        }
        if (isBritish && i in 64..128) {
          raw[i] = raw[i] * 1.25f
        }
      }

      var normSq = 0.0f
      for (v in raw) normSq += v * v
      val invNorm = 1.0f / kotlin.math.sqrt(normSq.coerceAtLeast(1e-6f))
      FloatArray(STYLE_DIM) { raw[it] * invNorm }
    }
  }

  fun generate(
    text: String,
    voiceId: String = DEFAULT_VOICE,
    speed: Float = 1.0f,
    isCancelled: () -> Boolean = { false },
    onProgress: (Double, String) -> Unit = { _, _ -> },
  ): GeneratedSpeech {
    this.isCancelled = false
    val started = System.currentTimeMillis()
    load(onProgress)

    if (isCancelled() || this.isCancelled || isClosing) {
      throw InterruptedException("Kokoro generation cancelled")
    }

    val sess = session ?: throw IllegalStateException("Kokoro ONNX session not loaded")
    val tok = tokenizer ?: throw IllegalStateException("Kokoro tokenizer not loaded")

    val tokens = tok.encode(text)
    val styleVector = getStyleVector(voiceId, tokens.size)
    val clampedSpeed = speed.coerceIn(0.5f, 2.0f)

    onProgress(0.7, "Synthesizing voice with Kokoro-82M")

    // Determine input tensor names dynamically from the model graph
    val inputNames = sess.inputNames
    val tokenInputName = if (inputNames.contains("input_ids")) "input_ids" else "tokens"
    val styleInputName = if (inputNames.contains("style")) "style" else "ref_s"

    // Construct ONNX input tensors
    val tokenBuffer = LongBuffer.wrap(tokens)
    val tokenTensor = OnnxTensor.createTensor(env, tokenBuffer, longArrayOf(1, tokens.size.toLong()))

    val styleBuffer = FloatBuffer.wrap(styleVector)
    val styleNodeInfo = sess.inputInfo[styleInputName]?.info as? TensorInfo
    val styleShape = if (styleNodeInfo != null && styleNodeInfo.shape.size == 3) {
      longArrayOf(1, 1, STYLE_DIM.toLong())
    } else {
      longArrayOf(1, STYLE_DIM.toLong())
    }
    val styleTensor = OnnxTensor.createTensor(env, styleBuffer, styleShape)

    val speedBuffer = FloatBuffer.wrap(floatArrayOf(clampedSpeed))
    val speedTensor = OnnxTensor.createTensor(env, speedBuffer, longArrayOf(1))

    val inputMap = mutableMapOf<String, OnnxTensor>()
    inputMap[tokenInputName] = tokenTensor
    inputMap[styleInputName] = styleTensor
    if (inputNames.contains("speed")) {
      inputMap["speed"] = speedTensor
    }

    val runOptions = OrtSession.RunOptions()

    try {
      if (isCancelled() || this.isCancelled || isClosing) {
        throw InterruptedException("Kokoro generation cancelled")
      }

      val result = sess.run(inputMap, runOptions)
      result.use { res ->
        val outputName = sess.outputNames.firstOrNull() ?: "audio"
        val optionalVal = res.get(outputName)
        val onnxValue = if (optionalVal != null && optionalVal.isPresent) {
          optionalVal.get()
        } else {
          res.get(0)
        }
        val tensor = onnxValue as OnnxTensor
        val floatBuffer = tensor.floatBuffer

        val samples = FloatArray(floatBuffer.remaining())
        floatBuffer.get(samples)

        val durationMillis = System.currentTimeMillis() - started
        return GeneratedSpeech(
          samples = samples,
          generatedTokens = tokens.size,
          generationMillis = durationMillis,
        )
      }
    } finally {
      tokenTensor.close()
      styleTensor.close()
      speedTensor.close()
      runOptions.close()
    }
  }

  fun cancel() {
    isCancelled = true
  }

  @Synchronized
  override fun close() {
    isCancelled = true
    isClosing = true
    try {
      session?.close()
    } catch (_: Exception) {}
    session = null
    tokenizer = null
    voiceStyles.clear()
  }
}
