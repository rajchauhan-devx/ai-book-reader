package com.aireader.library

import java.security.MessageDigest

/** Shared parser output. Source text is never replaced by narration normalization. */
internal data class ParsedDocument(
  val parserVersion: String, val chapters: List<ParsedChapter>,
  val title: String? = null, val author: String? = null,
  val warnings: List<String> = emptyList(), val cover: ByteArray? = null,
)
internal data class ParsedChapter(
  val id: String, val title: String, val sourceAnchor: String, val blocks: List<ParsedBlock>,
)
internal data class ParsedBlock(
  val id: String, val kind: String, val text: String, val sourceAnchor: String,
  val checksum: String, val sentences: List<ParsedSentence>,
)
internal data class ParsedSentence(
  val id: String, val text: String, val normalizedText: String, val sourceAnchor: String,
  val normalizedChecksum: String,
)

internal class PreparationFailure(val code: String, override val message: String) : Exception(message)

internal fun textHash(text: String): String = MessageDigest.getInstance("SHA-256")
  .digest(text.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }

internal fun contentId(sourceIdentity: String, kind: String, anchor: String, text: String): String =
  textHash("$sourceIdentity\u0000$kind\u0000$anchor\u0000$text")
