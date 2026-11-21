package com.aireader

import android.content.Context
import android.os.StatFs
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest

internal class ModelPackStore(val context: Context) {
  val root = File(context.applicationContext.filesDir, "model-packs")
  val active = File(root, ModelPackCatalog.PACK_VERSION)
  val staging = File(root, "${ModelPackCatalog.PACK_VERSION}.staging")
  private val backup = File(root, "${ModelPackCatalog.PACK_VERSION}.backup")

  fun isInstalled(): Boolean {
    promoteFoundModels()
    val activeModel = File(active, "kokoro-v1.0.onnx")
    return activeModel.isFile && activeModel.length() >= 500_000L
  }

  fun promoteFoundModels() {
    active.mkdirs()
    val activeModel = File(active, "kokoro-v1.0.onnx")
    if (!activeModel.isFile || activeModel.length() < 500_000L) {
      val candidates = listOf(
        File(staging, "kokoro-v1.0.onnx"),
        File(root, "kokoro-v1.0.onnx"),
        File(context.filesDir, "kokoro-v1.0.onnx"),
        File(context.filesDir, "model-packs/kokoro-v1.0.onnx"),
        context.getExternalFilesDir(null)?.let { File(it, "kokoro-v1.0.onnx") },
        context.getExternalFilesDir(null)?.let { File(it, "model-packs/kokoro-v1.0.onnx") },
      ).filterNotNull()

      for (cand in candidates) {
        if (cand.isFile && cand.length() >= 500_000L) {
          try {
            cand.copyTo(activeModel, overwrite = true)
            break
          } catch (_: Exception) {}
        }
      }
    }

    val activeVoices = File(active, "voices-v1.0.bin")
    if (!activeVoices.isFile || activeVoices.length() < 100_000L) {
      val voiceCandidates = listOf(
        File(staging, "voices-v1.0.bin"),
        File(root, "voices-v1.0.bin"),
        File(context.filesDir, "voices-v1.0.bin"),
        context.getExternalFilesDir(null)?.let { File(it, "voices-v1.0.bin") },
      ).filterNotNull()

      for (cand in voiceCandidates) {
        if (cand.isFile && cand.length() >= 100_000L) {
          try {
            cand.copyTo(activeVoices, overwrite = true)
            break
          } catch (_: Exception) {}
        }
      }
    }

    if (File(active, "kokoro-v1.0.onnx").length() >= 500_000L) {
      try {
        File(active, ModelPackCatalog.COMPLETION_MARKER).writeText(
          "${ModelPackCatalog.PACK_VERSION}\n${ModelPackCatalog.SOURCE_REVISION}\n",
        )
      } catch (_: Exception) {}
    }
  }

  fun downloadedBytes(): Long {
    var sum = 0L
    for (artifact in ModelPackCatalog.artifacts) {
      val inStaging = File(staging, artifact.path).length()
      val inActive = File(active, artifact.path).length()
      sum += maxOf(inStaging, inActive).coerceAtMost(artifact.bytes)
    }
    return sum
  }

  fun installedBytes(): Long = if (isInstalled()) ModelPackCatalog.totalBytes else 0L

  fun availableBytes(): Long {
    root.mkdirs()
    return StatFs(root.absolutePath).availableBytes
  }

  fun assertEnoughStorage() {
    val required = (ModelPackCatalog.totalBytes - downloadedBytes()).coerceAtLeast(0L) +
      ModelPackCatalog.STORAGE_HEADROOM_BYTES
    if (availableBytes() < required) {
      throw IllegalStateException("Not enough free space. Free at least 300 MB, then retry.")
    }
  }

  fun verifyStaging(onProgress: (Long) -> Unit) {
    var verified = 0L
    val onnxFile = File(staging, "kokoro-v1.0.onnx")
    if (!onnxFile.isFile || onnxFile.length() < 500_000L) {
      onnxFile.delete()
      throw IllegalStateException("The Kokoro neural voice model is missing or incomplete. Please retry.")
    }
    verified += onnxFile.length()
    onProgress(verified)

    val voicesFile = File(staging, "voices-v1.0.bin")
    if (voicesFile.exists() && voicesFile.length() < 100_000L) {
      voicesFile.delete()
    } else if (voicesFile.exists()) {
      verified += voicesFile.length()
      onProgress(verified)
    }
  }

  fun activateVerifiedStaging() {
    root.mkdirs()
    active.mkdirs()
    try {
      File(staging, ModelPackCatalog.COMPLETION_MARKER).writeText(
        "${ModelPackCatalog.PACK_VERSION}\n${ModelPackCatalog.SOURCE_REVISION}\n",
      )
    } catch (_: Exception) {}

    staging.listFiles()?.forEach { file ->
      if (file.isFile) {
        val dest = File(active, file.name)
        try {
          file.copyTo(dest, overwrite = true)
          file.delete()
        } catch (_: Exception) {}
      }
    }

    try { staging.deleteRecursively() } catch (_: Exception) {}
    try { backup.deleteRecursively() } catch (_: Exception) {}
  }

  fun recoverInterruptedInstall() {
    promoteFoundModels()
  }

  fun removeAll() {
    listOf(active, staging, backup).forEach { directory ->
      if (directory.exists() && !directory.deleteRecursively()) {
        throw IllegalStateException("Some voice files could not be removed. Please restart the app and retry.")
      }
    }
  }

  fun modelFile(relativePath: String): File {
    promoteFoundModels()
    val activeFile = File(active, relativePath)
    if (activeFile.exists()) return activeFile
    val stagingFile = File(staging, relativePath)
    if (stagingFile.exists()) return stagingFile
    val rootFile = File(root, relativePath)
    if (rootFile.exists()) return rootFile
    val filesDirFile = File(context.filesDir, relativePath)
    if (filesDirFile.exists()) return filesDirFile
    return activeFile
  }

  fun sha256(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    FileInputStream(file).use { input ->
      val buffer = ByteArray(1024 * 1024)
      while (true) {
        val count = input.read(buffer)
        if (count < 0) break
        digest.update(buffer, 0, count)
      }
    }
    return digest.digest().joinToString("") { byte -> "%02x".format(byte.toInt() and 0xff) }
  }
}
