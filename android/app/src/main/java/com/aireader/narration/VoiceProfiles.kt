package com.aireader.narration

data class VoiceProfile(
  val id: String,
  val name: String,
  val descriptor: String,
  val engine: String, // "natural", "system", or "edge"
  val referenceAsset: String?,
  val isDefault: Boolean = false,
  val pitch: Float = 1.0f,
  val speed: Float = 1.0f,
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
      pitch = 1.0f,
      speed = 1.0f,
    ),
    VoiceProfile(
      id = "clear",
      name = "Clear Voice",
      descriptor = "Balanced, precise tone best for non-fiction and study",
      engine = "natural",
      referenceAsset = "voice/clear-reference.wav",
      pitch = 1.08f,
      speed = 1.05f,
    ),
    VoiceProfile(
      id = "deep",
      name = "Deep Voice",
      descriptor = "Resonant, dramatic tone for mysteries and epics",
      engine = "natural",
      referenceAsset = "voice/deep-reference.wav",
      pitch = 0.85f,
      speed = 0.95f,
    ),
    VoiceProfile(
      id = "gentle",
      name = "Gentle Voice",
      descriptor = "Soft, calm cadence for relaxed and bedtime reading",
      engine = "natural",
      referenceAsset = "voice/gentle-reference.wav",
      pitch = 0.95f,
      speed = 0.90f,
    ),
    VoiceProfile(
      id = "edge-Jenny",
      name = "Jenny (Edge Neural)",
      descriptor = "Warm, natural and expressive female voice ideal for fiction",
      engine = "edge",
      referenceAsset = null,
      pitch = 1.0f,
      speed = 1.0f,
    ),
    VoiceProfile(
      id = "edge-Guy",
      name = "Guy (Edge Neural)",
      descriptor = "Conversational, engaging and versatile male narrator",
      engine = "edge",
      referenceAsset = null,
      pitch = 1.0f,
      speed = 1.0f,
    ),
    VoiceProfile(
      id = "edge-Aria",
      name = "Aria (Edge Neural)",
      descriptor = "Dynamic, passionate storytelling female voice",
      engine = "edge",
      referenceAsset = null,
      pitch = 1.0f,
      speed = 1.0f,
    ),
    VoiceProfile(
      id = "edge-Christopher",
      name = "Christopher (Edge Neural)",
      descriptor = "Authoritative, classic and deep male narrator",
      engine = "edge",
      referenceAsset = null,
      pitch = 1.0f,
      speed = 1.0f,
    ),
    VoiceProfile(
      id = "edge-Emma",
      name = "Emma (Edge Neural)",
      descriptor = "Warm, gentle and cheerful female voice",
      engine = "edge",
      referenceAsset = null,
      pitch = 1.0f,
      speed = 1.0f,
    ),
    VoiceProfile(
      id = "edge-Brian",
      name = "Brian (Edge Neural)",
      descriptor = "Approachable, relaxed and friendly male narrator",
      engine = "edge",
      referenceAsset = null,
      pitch = 1.0f,
      speed = 1.0f,
    ),
    VoiceProfile(
      id = "edge-Ava",
      name = "Ava (Edge Neural)",
      descriptor = "Clear, modern and articulate female voice",
      engine = "edge",
      referenceAsset = null,
      pitch = 1.0f,
      speed = 1.0f,
    ),
    VoiceProfile(
      id = "edge-Eric",
      name = "Eric (Edge Neural)",
      descriptor = "Resonant, calm and steady male voice",
      engine = "edge",
      referenceAsset = null,
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

  fun findVoice(id: String?): VoiceProfile =
    VOICES.firstOrNull { it.id.equals(id, ignoreCase = true) } ?: VOICES.first()

  fun findExpression(id: String?): ExpressionPreset =
    EXPRESSIONS.firstOrNull { it.id.equals(id, ignoreCase = true) } ?: EXPRESSIONS[1] // natural
}
