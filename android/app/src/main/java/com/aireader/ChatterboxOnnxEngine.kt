package com.aireader

import ai.onnxruntime.OnnxJavaType
import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import java.nio.LongBuffer
import kotlin.math.exp
import kotlin.random.Random

internal enum class PerformanceMode(val threads: Int, val maxTokens: Int, val greedy: Boolean, val topK: Int) {
  BATTERY(2, 72, true, 1),
  BALANCED(4, 112, false, 100),
  QUALITY(6, 160, false, 1000);

  companion object {
    fun from(value: String): PerformanceMode = entries.firstOrNull {
      it.name.equals(value, ignoreCase = true)
    } ?: BALANCED
  }
}

internal data class GeneratedSpeech(
  val samples: FloatArray,
  val generatedTokens: Int,
  val generationMillis: Long,
)

internal class ChatterboxOnnxEngine(private val store: ModelPackStore) : AutoCloseable {
  companion object {
    private const val SAMPLE_RATE = 24_000
    private const val START_SPEECH_TOKEN = 6_561L
    private const val STOP_SPEECH_TOKEN = 6_562L
    private const val SILENCE_TOKEN = 4_299L
    private const val VOCAB_SIZE = 6_563
    private const val EMBEDDING_SIZE = 768
    private const val LAYERS = 12
    private const val HEADS = 12
    private const val HEAD_DIM = 64
  }

  private val env = OrtEnvironment.getEnvironment("ai-book-reader")
  @Volatile private var runOptions: OrtSession.RunOptions? = null
  private var mode: PerformanceMode? = null
  private var embedTokens: OrtSession? = null
  private var speechEncoder: OrtSession? = null
  private var languageModel: OrtSession? = null
  private var decoder: OrtSession? = null
  private var tokenizer: Gpt2Tokenizer? = null

  @Synchronized
  fun load(performanceMode: PerformanceMode, onProgress: (Double, String) -> Unit) {
    if (mode == performanceMode && embedTokens != null && speechEncoder != null && languageModel != null && decoder != null) return
    closeSessions()
    require(store.isInstalled()) { "Download the natural voice before testing it." }
    val threads = performanceMode.threads.coerceAtMost(Runtime.getRuntime().availableProcessors().coerceAtLeast(1))
    fun open(
      path: String,
      optimizationLevel: OrtSession.SessionOptions.OptLevel = OrtSession.SessionOptions.OptLevel.ALL_OPT,
    ): OrtSession {
      val options = OrtSession.SessionOptions()
      try {
        options.setOptimizationLevel(optimizationLevel)
        options.setExecutionMode(OrtSession.SessionOptions.ExecutionMode.SEQUENTIAL)
        options.setIntraOpNumThreads(threads)
        options.setInterOpNumThreads(1)
        options.setCPUArenaAllocator(true)
        options.setMemoryPatternOptimization(true)
        return env.createSession(store.modelFile(path).absolutePath, options)
      } finally {
        options.close()
      }
    }
    onProgress(0.04, "Loading text voice data")
    embedTokens = open("onnx/embed_tokens_fp16.onnx")
    onProgress(0.10, "Loading voice encoder")
    speechEncoder = open(
      "onnx/speech_encoder_q4f16.onnx",
      OrtSession.SessionOptions.OptLevel.BASIC_OPT,
    )
    onProgress(0.18, "Loading speech generator")
    languageModel = open("onnx/language_model_q4f16.onnx")
    onProgress(0.26, "Loading audio decoder")
    decoder = open(
      "onnx/conditional_decoder_q4.onnx",
      OrtSession.SessionOptions.OptLevel.BASIC_OPT,
    )
    tokenizer = Gpt2Tokenizer(store.modelFile("tokenizer.json"))
    mode = performanceMode
  }

  fun generate(
    text: String,
    reference: MonoAudio,
    performanceMode: PerformanceMode,
    isCancelled: () -> Boolean,
    onProgress: (Double, String) -> Unit,
  ): GeneratedSpeech {
    val started = System.currentTimeMillis()
    load(performanceMode, onProgress)
    checkCancelled(isCancelled)
    val options = OrtSession.RunOptions()
    runOptions = options
    try {
      onProgress(0.30, "Learning the narrator tone")
      val audioTensor = floatTensor(reference.samples, longArrayOf(1, reference.samples.size.toLong()))
      val encoderResult = audioTensor.use {
        speechEncoder!!.run(mapOf("audio_values" to audioTensor), options)
      }
      val audioFeatures: FloatArray
      val audioFeatureShape: LongArray
      val audioTokens: LongArray
      val speakerEmbeddings: FloatArray
      val speakerFeatures: FloatArray
      val speakerFeatureShape: LongArray
      encoderResult.use { result ->
        val featureTensor = tensor(result, "audio_features")
        audioFeatures = copyFloats(featureTensor)
        audioFeatureShape = featureTensor.info.shape
        audioTokens = copyLongs(tensor(result, "audio_tokens"))
        speakerEmbeddings = copyFloats(tensor(result, "speaker_embeddings"))
        val speakerTensor = tensor(result, "speaker_features")
        speakerFeatures = copyFloats(speakerTensor)
        speakerFeatureShape = speakerTensor.info.shape
      }

      checkCancelled(isCancelled)
      val textIds = tokenizer!!.encode(text.trim().take(360))
      var nextIds = textIds
      val generated = ArrayList<Long>(performanceMode.maxTokens + 1).apply { add(START_SPEECH_TOKEN) }
      var cacheResult: OrtSession.Result? = null
      var attentionLength = 0
      var reachedEos = false
      val random = Random(1337)

      try {
        for (step in 0 until performanceMode.maxTokens) {
          checkCancelled(isCancelled)
          val idTensor = longTensor(nextIds, longArrayOf(1, nextIds.size.toLong()))
          val embedResult = idTensor.use { embedTokens!!.run(mapOf("input_ids" to idTensor), options) }
          val tokenEmbeddings: FloatArray
          embedResult.use { tokenEmbeddings = copyFloats(tensor(it, "inputs_embeds")) }
          val sequenceLength: Int
          val embeddings: FloatArray
          if (step == 0) {
            sequenceLength = audioFeatureShape[1].toInt() + textIds.size
            embeddings = FloatArray(audioFeatures.size + tokenEmbeddings.size)
            audioFeatures.copyInto(embeddings)
            tokenEmbeddings.copyInto(embeddings, audioFeatures.size)
            attentionLength = sequenceLength
          } else {
            sequenceLength = 1
            embeddings = tokenEmbeddings
            attentionLength += 1
          }

          val ownedInputs = ArrayList<OnnxTensor>()
          val inputs = HashMap<String, OnnxTensor>()
          fun own(name: String, value: OnnxTensor) {
            inputs[name] = value
            ownedInputs += value
          }
          own("inputs_embeds", floatTensor(embeddings, longArrayOf(1, sequenceLength.toLong(), EMBEDDING_SIZE.toLong())))
          own("attention_mask", longTensor(LongArray(attentionLength) { 1L }, longArrayOf(1, attentionLength.toLong())))
          val positionStart = attentionLength - sequenceLength
          own(
            "position_ids",
            longTensor(LongArray(sequenceLength) { (positionStart + it).toLong() }, longArrayOf(1, sequenceLength.toLong())),
          )
          if (cacheResult == null) {
            for (layer in 0 until LAYERS) {
              listOf("key", "value").forEach { kind ->
                own("past_key_values.$layer.$kind", emptyFp16Tensor())
              }
            }
          } else {
            for (layer in 0 until LAYERS) {
              listOf("key", "value").forEach { kind ->
                inputs["past_key_values.$layer.$kind"] = tensor(cacheResult, "present.$layer.$kind")
              }
            }
          }

          val newResult = try {
            languageModel!!.run(inputs, options)
          } finally {
            ownedInputs.forEach { it.close() }
          }
          cacheResult?.close()
          cacheResult = newResult
          val logitsBuffer = tensor(newResult, "logits").floatBuffer
          val logits = FloatArray(VOCAB_SIZE)
          logitsBuffer.position(logitsBuffer.limit() - VOCAB_SIZE)
          logitsBuffer.get(logits)
          val next = sample(logits, generated, performanceMode, random)
          generated += next
          val tokenProgress = (step + 1).toDouble() / performanceMode.maxTokens
          onProgress(0.36 + tokenProgress * 0.48, "Creating speech (${step + 1} voice tokens)")
          if (next == STOP_SPEECH_TOKEN) {
            reachedEos = true
            break
          }
          nextIds = longArrayOf(next)
        }
      } finally {
        cacheResult?.close()
      }

      checkCancelled(isCancelled)
      onProgress(0.88, "Turning voice tokens into sound")
      val endIndex = if (reachedEos) generated.lastIndex else generated.size
      val generatedAudio = generated.subList(1, endIndex)
      require(generatedAudio.isNotEmpty()) { "The natural voice did not generate audio. Please retry." }
      val speechTokens = LongArray(audioTokens.size + generatedAudio.size + 3)
      audioTokens.copyInto(speechTokens)
      generatedAudio.forEachIndexed { index, token -> speechTokens[audioTokens.size + index] = token }
      repeat(3) { index -> speechTokens[speechTokens.lastIndex - index] = SILENCE_TOKEN }
      val decoderInputs = listOf(
        longTensor(speechTokens, longArrayOf(1, speechTokens.size.toLong())),
        floatTensor(speakerEmbeddings, longArrayOf(1, speakerEmbeddings.size.toLong())),
        floatTensor(speakerFeatures, speakerFeatureShape),
      )
      val decoderResult = try {
        decoder!!.run(
          mapOf(
            "speech_tokens" to decoderInputs[0],
            "speaker_embeddings" to decoderInputs[1],
            "speaker_features" to decoderInputs[2],
          ),
          options,
        )
      } finally {
        decoderInputs.forEach { it.close() }
      }
      val waveform = decoderResult.use { copyFloats(tensor(it, "waveform")) }
      onProgress(0.98, "Finishing audio")
      return GeneratedSpeech(waveform, generatedAudio.size, System.currentTimeMillis() - started)
    } finally {
      runOptions = null
      options.close()
    }
  }

  fun cancel() {
    try {
      runOptions?.setTerminate(true)
    } catch (_: Exception) {
      // The active run may have finished between reading and terminating it.
    }
  }

  override fun close() {
    cancel()
    closeSessions()
  }

  @Synchronized
  private fun closeSessions() {
    decoder?.close()
    languageModel?.close()
    speechEncoder?.close()
    embedTokens?.close()
    decoder = null
    languageModel = null
    speechEncoder = null
    embedTokens = null
    tokenizer = null
    mode = null
  }

  private fun sample(logits: FloatArray, generated: List<Long>, config: PerformanceMode, random: Random): Long {
    generated.distinct().forEach { token ->
      val index = token.toInt()
      if (index in logits.indices) logits[index] = if (logits[index] < 0f) logits[index] * 1.2f else logits[index] / 1.2f
    }
    if (config.greedy) return logits.indices.maxBy { logits[it] }.toLong()
    val top = logits.indices.sortedByDescending { logits[it] }.take(config.topK.coerceAtMost(logits.size))
    val maxScore = logits[top.first()] / 0.8
    val weights = top.map { exp(logits[it] / 0.8 - maxScore) }.toMutableList()
    val total = weights.sum().coerceAtLeast(1e-12)
    var cumulative = 0.0
    var kept = weights.size
    for (index in weights.indices) {
      cumulative += weights[index] / total
      if (cumulative >= 0.95) {
        kept = index + 1
        break
      }
    }
    val keptTotal = weights.take(kept).sum().coerceAtLeast(1e-12)
    var target = random.nextDouble() * keptTotal
    for (index in 0 until kept) {
      target -= weights[index]
      if (target <= 0) return top[index].toLong()
    }
    return top[kept - 1].toLong()
  }

  private fun tensor(result: OrtSession.Result, name: String): OnnxTensor =
    result.get(name).orElseThrow { IllegalStateException("The voice model did not return $name.") } as OnnxTensor

  private fun copyFloats(tensor: OnnxTensor): FloatArray {
    val buffer = tensor.floatBuffer
    return FloatArray(buffer.remaining()).also(buffer::get)
  }

  private fun copyLongs(tensor: OnnxTensor): LongArray {
    val buffer = tensor.longBuffer
    return LongArray(buffer.remaining()).also(buffer::get)
  }

  private fun floatTensor(values: FloatArray, shape: LongArray): OnnxTensor =
    OnnxTensor.createTensor(env, FloatBuffer.wrap(values), shape)

  private fun longTensor(values: LongArray, shape: LongArray): OnnxTensor =
    OnnxTensor.createTensor(env, LongBuffer.wrap(values), shape)

  private fun emptyFp16Tensor(): OnnxTensor {
    val buffer = ByteBuffer.allocateDirect(0).order(ByteOrder.nativeOrder()).asShortBuffer()
    return OnnxTensor.createTensor(env, buffer, longArrayOf(1, HEADS.toLong(), 0, HEAD_DIM.toLong()), OnnxJavaType.FLOAT16)
  }

  private fun checkCancelled(isCancelled: () -> Boolean) {
    if (isCancelled()) throw InterruptedException("Voice generation cancelled")
  }
}
