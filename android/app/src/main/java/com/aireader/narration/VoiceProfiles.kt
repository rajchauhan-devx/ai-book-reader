package com.aireader.narration

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.ConcurrentHashMap

data class VoiceProfile(
  val id: String,
  val name: String,
  val descriptor: String,
  val engine: String, // "natural", "system", or "edge"
  val referenceAsset: String?,
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
  val topK: Int,
  val temperature: Float,
)

object VoiceCatalog {
  private val customVoices = ConcurrentHashMap<String, VoiceProfile>()
  @Volatile private var customVoicesLoaded = false

  val BUILTIN_VOICES = listOf(
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

  val VOICES: List<VoiceProfile>
    get() = BUILTIN_VOICES + customVoices.values.toList()

  fun loadCustomVoices(context: Context): List<VoiceProfile> {
    synchronized(this) {
      try {
        val registryFile = File(context.filesDir, "custom_voices/registry.json")
        if (registryFile.exists()) {
          val text = registryFile.readText(Charsets.UTF_8)
          if (text.isNotBlank()) {
            val jsonArray = JSONArray(text)
            customVoices.clear()
            for (i in 0 until jsonArray.length()) {
              val obj = jsonArray.getJSONObject(i)
              val profile = jsonToVoiceProfile(obj)
              val audioFile = File(context.filesDir, profile.referenceAsset ?: "")
              if (audioFile.exists() && audioFile.length() >= 44) {
                customVoices[profile.id] = profile
              }
            }
          }
        }
        customVoicesLoaded = true
      } catch (_: Exception) {}
      return customVoices.values.toList()
    }
  }

  fun allVoices(context: Context? = null): List<VoiceProfile> {
    if (context != null && !customVoicesLoaded) {
      loadCustomVoices(context)
    }
    return BUILTIN_VOICES + customVoices.values.toList()
  }

  fun addCustomVoice(context: Context, profile: VoiceProfile) {
    synchronized(this) {
      if (!customVoicesLoaded) loadCustomVoices(context)
      customVoices[profile.id] = profile
      saveRegistry(context)
    }
  }

  fun removeCustomVoice(context: Context, voiceId: String): Boolean {
    synchronized(this) {
      if (!customVoicesLoaded) loadCustomVoices(context)
      val removed = customVoices.remove(voiceId) ?: return false
      try {
        if (!removed.referenceAsset.isNullOrBlank()) {
          File(context.filesDir, removed.referenceAsset).delete()
        }
      } catch (_: Exception) {}
      saveRegistry(context)
      return true
    }
  }

  private fun saveRegistry(context: Context) {
    try {
      val dir = File(context.filesDir, "custom_voices")
      dir.mkdirs()
      val registryFile = File(dir, "registry.json")
      val jsonArray = JSONArray()
      for (voice in customVoices.values) {
        jsonArray.put(voice.toJson())
      }
      registryFile.writeText(jsonArray.toString(2), Charsets.UTF_8)
    } catch (_: Exception) {}
  }

  private fun VoiceProfile.toJson(): JSONObject = JSONObject().apply {
    put("id", id)
    put("name", name)
    put("descriptor", descriptor)
    put("engine", engine)
    put("referenceAsset", referenceAsset)
    put("isDefault", isDefault)
    put("pitch", pitch.toDouble())
    put("speed", speed.toDouble())
    put("isCustom", isCustom)
    put("sampleDurationSec", sampleDurationSec)
  }

  private fun jsonToVoiceProfile(json: JSONObject): VoiceProfile = VoiceProfile(
    id = json.getString("id"),
    name = json.getString("name"),
    descriptor = json.optString("descriptor", "Custom cloned voice"),
    engine = json.optString("engine", "natural"),
    referenceAsset = if (json.isNull("referenceAsset")) null else json.optString("referenceAsset").ifBlank { null },
    isDefault = json.optBoolean("isDefault", false),
    pitch = json.optDouble("pitch", 1.0).toFloat(),
    speed = json.optDouble("speed", 1.0).toFloat(),
    isCustom = json.optBoolean("isCustom", true),
    sampleDurationSec = json.optDouble("sampleDurationSec", 0.0),
  )

  fun findVoice(id: String?, context: Context? = null): VoiceProfile {
    if (context != null && !customVoicesLoaded) {
      loadCustomVoices(context)
    }
    if (id == null) return BUILTIN_VOICES.first()
    return customVoices[id]
      ?: BUILTIN_VOICES.firstOrNull { it.id.equals(id, ignoreCase = true) }
      ?: BUILTIN_VOICES.first()
  }

  fun findExpression(id: String?): ExpressionPreset =
    EXPRESSIONS.firstOrNull { it.id.equals(id, ignoreCase = true) } ?: EXPRESSIONS[1] // natural
}
