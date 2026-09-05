package com.aireader.narration

data class VoiceProfile(
  val id: String,
  val name: String,
  val descriptor: String,
  val engine: String, // "natural" or "system"
  val referenceAsset: String?,
  val isDefault: Boolean = false,
)

data class ExpressionPreset(
  val id: String,
  val name: String,
  val descriptor: String,
  val topK: Int,
  val temperature: Float,
)

object VoiceCatalog {
  val VOICES = listOf(
    VoiceProfile(
      id = "warm",
      name = "Warm Narrator",
      descriptor = "Rich, engaging tone ideal for fiction and storytelling",
      engine = "natural",
      referenceAsset = "voice/neutral-reference.wav",
      isDefault = true,
    ),
    VoiceProfile(
      id = "clear",
      name = "Clear Voice",
      descriptor = "Balanced, precise tone best for non-fiction and study",
      engine = "natural",
      referenceAsset = "voice/neutral-reference.wav",
    ),
    VoiceProfile(
      id = "deep",
      name = "Deep Voice",
      descriptor = "Resonant, dramatic tone for mysteries and epics",
      engine = "natural",
      referenceAsset = "voice/neutral-reference.wav",
    ),
    VoiceProfile(
      id = "gentle",
      name = "Gentle Voice",
      descriptor = "Soft, calm cadence for relaxed and bedtime reading",
      engine = "natural",
      referenceAsset = "voice/neutral-reference.wav",
    ),
    VoiceProfile(
      id = "system",
      name = "Offline Phone Voice",
      descriptor = "Built-in Android system speech; fast and ultra-low battery",
      engine = "system",
      referenceAsset = null,
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

  fun findVoice(id: String?): VoiceProfile =
    VOICES.firstOrNull { it.id.equals(id, ignoreCase = true) } ?: VOICES.first()

  fun findExpression(id: String?): ExpressionPreset =
    EXPRESSIONS.firstOrNull { it.id.equals(id, ignoreCase = true) } ?: EXPRESSIONS[1] // natural
}
