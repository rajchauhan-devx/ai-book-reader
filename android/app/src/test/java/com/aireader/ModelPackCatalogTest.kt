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
      assertEquals(64, artifact.sha256.length)
      sum += artifact.bytes
    }
    assertEquals(sum, ModelPackCatalog.totalBytes)
  }

  @Test
  fun resolvesHuggingFaceRelativeRedirectsCorrectly() {
    val initialUrl = "https://huggingface.co/owensong/chatterbox-nano-ONNX/resolve/19265a0f25b51c723b71e2098f766c95fbb94b29/LICENSE?download=true"
    val relativeLocation = "/api/resolve-cache/models/owensong/chatterbox-nano-ONNX/19265a0f25b51c723b71e2098f766c95fbb94b29/LICENSE?download=true&etag=1234"
    val resolved = initialUrl.toHttpUrl().resolve(relativeLocation)
    assertTrue(resolved != null)
    assertEquals("huggingface.co", resolved?.host)
    assertEquals("/api/resolve-cache/models/owensong/chatterbox-nano-ONNX/19265a0f25b51c723b71e2098f766c95fbb94b29/LICENSE", resolved?.encodedPath)
  }

  @Test
  fun resolvesCrossDomainCdnRedirectsCorrectly() {
    val initialUrl = "https://huggingface.co/owensong/chatterbox-nano-ONNX/resolve/19265a0f25b51c723b71e2098f766c95fbb94b29/onnx/conditional_decoder_q4.onnx_data?download=true"
    val cdnLocation = "https://us.aws.cdn.hf.co/xet-bridge-us/6a5c55babfb69a300f7932fe/102480c6ca01ccb9f253b9cbf62b747842c45d4b697ff139377f7cc097be04f6?Expires=123"
    val resolved = initialUrl.toHttpUrl().resolve(cdnLocation)
    assertTrue(resolved != null)
    assertEquals("us.aws.cdn.hf.co", resolved?.host)
  }
}

