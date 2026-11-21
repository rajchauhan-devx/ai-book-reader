package com.aireader

import okhttp3.HttpUrl.Companion.toHttpUrl
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ModelPackCatalogTest {
  @Test
  fun modelPackArtifactsAreValid() {
    assertTrue(ModelPackCatalog.artifacts.isNotEmpty())
    var sum = 0L
    for (artifact in ModelPackCatalog.artifacts) {
      assertTrue(artifact.path.isNotEmpty())
      assertTrue(artifact.bytes > 0)
      if (artifact.sha256 != null) {
        assertEquals(64, artifact.sha256.length)
      }
      sum += artifact.bytes
    }
    assertEquals(sum, ModelPackCatalog.totalBytes)
  }

  @Test
  fun resolvesDownloadRedirectsCorrectly() {
    val initialUrl = "${ModelPackCatalog.SOURCE_ROOT}/voices-v1.0.bin"
    val relativeLocation = "/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin"
    val resolved = initialUrl.toHttpUrl().resolve(relativeLocation)
    assertTrue(resolved != null)
    assertEquals("github.com", resolved?.host)
    assertEquals("/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin", resolved?.encodedPath)
  }

  @Test
  fun resolvesCrossDomainCdnRedirectsCorrectly() {
    val initialUrl = "${ModelPackCatalog.SOURCE_ROOT}/kokoro-v1.0.onnx"
    val cdnLocation = "https://objects.githubusercontent.com/github-production-release-asset-2e65be/kokoro-v1.0.onnx?Expires=123"
    val resolved = initialUrl.toHttpUrl().resolve(cdnLocation)
    assertTrue(resolved != null)
    assertEquals("objects.githubusercontent.com", resolved?.host)
  }
}
