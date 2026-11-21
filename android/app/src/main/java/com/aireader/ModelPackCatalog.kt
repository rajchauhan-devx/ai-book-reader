package com.aireader

internal data class ModelArtifact(
  val path: String,
  val bytes: Long,
  val minBytes: Long = 100_000L,
  val sha256: String? = null,
)

internal object ModelPackCatalog {
  const val PACK_VERSION = "kokoro-v1.0-onnx"
  const val SOURCE_REVISION = "model-files-v1.0"
  const val SOURCE_ROOT = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/$SOURCE_REVISION"
  const val COMPLETION_MARKER = ".verified"
  const val STORAGE_HEADROOM_BYTES = 128L * 1024L * 1024L

  val artifacts = listOf(
    ModelArtifact("kokoro-v1.0.onnx", 325_532_387L, 300_000_000L),
    ModelArtifact("voices-v1.0.bin", 28_214_398L, 25_000_000L),
  )

  val totalBytes: Long = artifacts.sumOf { it.bytes }
}
