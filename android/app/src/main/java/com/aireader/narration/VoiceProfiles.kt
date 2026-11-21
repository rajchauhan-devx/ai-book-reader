package com.aireader.narration

import android.content.Context

data class VoiceProfile(
  val id: String,
  val name: String,
  val descriptor: String,
  val engine: String, // "kokoro"
  val referenceAsset: String? = null,
  val isDefault: Boolean = false,
  val pitch: Float = 1.0f,
  val speed: Float = 1.0f,
  val isCustom: Boolean = false,
  val sampleDurationSec: Double = 0.0,
)

data class ExpressionPreset(
  val id: String,
  val name: String,
  val descriptor: String,
  val topK: Int = 100,
  val temperature: Float = 0.8f,
)

object VoiceCatalog {
  val BUILTIN_VOICES = listOf(
    VoiceProfile(
      id = "af_heart",
      name = "Heart (Flagship Expressive Narrator)",
      descriptor = "Rich, emotional American female narrator with remarkable warmth, human breathing, and storytelling nuance",
      engine = "kokoro",
      isDefault = true,
      pitch = 1.0f,
      speed = 1.0f,
    ),
    VoiceProfile(
      id = "af_bella",
      name = "Bella (Warm Narrator)",
      descriptor = "Warm, expressive American female voice with rich storytelling cadence",
      engine = "kokoro",
      isDefault = false,
      pitch = 1.0f,
      speed = 1.0f,
    ),
    VoiceProfile(
      id = "af_sarah",
      name = "Sarah (Clear & Crisp)",
      descriptor = "Articulate, balanced American female narrator with exceptional clarity",
      engine = "kokoro",
      pitch = 1.0f,
      speed = 1.0f,
    ),
    VoiceProfile(
      id = "af_nicole",
      name = "Nicole (Melodic & Soft)",
      descriptor = "Gentle, soothing American female cadence ideal for bedtime and relaxed reads",
      engine = "kokoro",
      pitch = 1.0f,
      speed = 1.0f,
    ),
    VoiceProfile(
      id = "af_sky",
      name = "Sky (Youthful & Bright)",
      descriptor = "Animated, energetic American female voice suited for dialogue and dynamic scenes",
      engine = "kokoro",
      pitch = 1.0f,
      speed = 1.0f,
    ),
    VoiceProfile(
      id = "am_adam",
      name = "Adam (Deep & Authoritative)",
      descriptor = "Resonant, authoritative American male baritone ideal for history and nonfiction",
      engine = "kokoro",
      pitch = 1.0f,
      speed = 1.0f,
    ),
    VoiceProfile(
      id = "am_michael",
      name = "Michael (Natural & Friendly)",
      descriptor = "Conversational, friendly American male narrator with smooth natural pacing",
      engine = "kokoro",
      pitch = 1.0f,
      speed = 1.0f,
    ),
    VoiceProfile(
      id = "bf_emma",
      name = "Emma (Refined Classical)",
      descriptor = "Sophisticated British female cadence with crisp diction for classical literature",
      engine = "kokoro",
      pitch = 1.0f,
      speed = 1.0f,
    ),
    VoiceProfile(
      id = "bm_george",
      name = "George (Distinguished Baritone)",
      descriptor = "Cultured, deep British male narrator with dramatic resonance for epic tales",
      engine = "kokoro",
      pitch = 1.0f,
      speed = 1.0f,
    ),
  )

  val EXPRESSIONS = listOf(
    ExpressionPreset(
      id = "calm",
      name = "Calm",
      descriptor = "Steady, controlled pacing",
      topK = 50,
      temperature = 0.6f,
    ),
    ExpressionPreset(
      id = "natural",
      name = "Natural",
      descriptor = "Balanced expression and conversational cadence",
      topK = 100,
      temperature = 0.8f,
    ),
    ExpressionPreset(
      id = "expressive",
      name = "Expressive",
      descriptor = "Dynamic vocal range and dramatic inflection",
      topK = 1000,
      temperature = 1.0f,
    ),
  )

  val VOICES: List<VoiceProfile>
    get() = BUILTIN_VOICES

  fun allVoices(context: Context? = null): List<VoiceProfile> = BUILTIN_VOICES

  fun findVoice(id: String?): VoiceProfile {
    if (id == null) return BUILTIN_VOICES.first()
    return BUILTIN_VOICES.firstOrNull { it.id.equals(id, ignoreCase = true) }
      ?: BUILTIN_VOICES.first()
  }

  fun findExpression(id: String?): ExpressionPreset {
    if (id == null) return EXPRESSIONS[1]
    return EXPRESSIONS.firstOrNull { it.id.equals(id, ignoreCase = true) }
      ?: EXPRESSIONS[1]
  }

  fun addCustomVoice(context: Context, profile: VoiceProfile) {
    // Kokoro uses built-in neural voice embeddings
  }

  fun removeCustomVoice(context: Context, voiceId: String): Boolean {
    return false
  }
}
