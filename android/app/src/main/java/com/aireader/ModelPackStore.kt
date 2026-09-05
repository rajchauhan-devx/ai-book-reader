package com.aireader

import android.content.Context
import android.os.StatFs
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest

internal class ModelPackStore(context: Context) {
  val root = File(context.applicationContext.filesDir, "model-packs")
  val active = File(root, ModelPackCatalog.PACK_VERSION)
  val staging = File(root, "${ModelPackCatalog.PACK_VERSION}.staging")
  private val backup = File(root, "${ModelPackCatalog.PACK_VERSION}.backup")

  fun isInstalled(): Boolean = File(active, ModelPackCatalog.COMPLETION_MARKER).isFile &&
    ModelPackCatalog.artifacts.all { File(active, it.path).length() == it.bytes }

  fun downloadedBytes(): Long = ModelPackCatalog.artifacts.sumOf {
    File(staging, it.path).length().coerceAtMost(it.bytes)
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
      throw IllegalStateException("Not enough free space. Free at least 800 MB, then retry.")
    }
  }

  fun verifyStaging(onProgress: (Long) -> Unit) {
    var verified = 0L
    ModelPackCatalog.artifacts.forEach { artifact ->
      val file = File(staging, artifact.path)
      if (file.length() != artifact.bytes || sha256(file) != artifact.sha256) {
        file.delete()
        throw IllegalStateException("A voice file did not pass the security check. Please retry.")
      }
      verified += artifact.bytes
      onProgress(verified)
    }
  }

  fun activateVerifiedStaging() {
    root.mkdirs()
    File(staging, ModelPackCatalog.COMPLETION_MARKER).writeText(
      "${ModelPackCatalog.PACK_VERSION}\n${ModelPackCatalog.SOURCE_REVISION}\n",
    )
    if (backup.exists() && !backup.deleteRecursively()) {
      throw IllegalStateException("The old recovery copy could not be cleared.")
    }
    val hadActive = active.exists()
    if (hadActive && !active.renameTo(backup)) {
      throw IllegalStateException("The current voice pack could not be protected during update.")
    }
    if (!staging.renameTo(active)) {
      if (hadActive) backup.renameTo(active)
      throw IllegalStateException("The verified voice pack could not be installed.")
    }
    backup.deleteRecursively()
  }

  fun recoverInterruptedInstall() {
    root.mkdirs()
    if (!active.exists() && backup.exists()) backup.renameTo(active)
    else if (active.exists() && backup.exists()) backup.deleteRecursively()
  }

  fun removeAll() {
    listOf(active, staging, backup).forEach { directory ->
      if (directory.exists() && !directory.deleteRecursively()) {
        throw IllegalStateException("Some voice files could not be removed. Please restart the app and retry.")
      }
    }
  }

  fun modelFile(relativePath: String): File {
    require(ModelPackCatalog.artifacts.any { it.path == relativePath }) { "Unknown model file" }
    return File(active, relativePath)
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
