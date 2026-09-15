package com.aireader.library

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.URI
import java.util.zip.ZipFile
import org.jsoup.Jsoup
import org.jsoup.nodes.Document
import org.jsoup.nodes.Element
import org.jsoup.nodes.Node
import org.jsoup.nodes.TextNode
import org.jsoup.parser.Parser
import org.jsoup.select.NodeTraversor
import org.jsoup.select.NodeVisitor

internal object EpubBookParser {
  const val VERSION = "epub-1"
  private const val MAX_ENTRY = 16 * 1024 * 1024
  private const val MAX_EXPANDED = 1024L * 1024 * 1024
  private val blockTags = setOf("p", "div", "section", "article", "h1", "h2", "h3", "h4", "h5", "h6", "li", "blockquote", "pre", "tr", "dt", "dd", "figcaption")
  private val space = Regex("[\\s\\p{Z}]+")

  fun parse(file: File, identity: String, check: () -> Unit = {}, progress: (Int, String) -> Unit = { _, _ -> }): ParsedDocument {
    try {
      ZipFile(file).use { zip ->
        val entries = zip.entries().asSequence().toList()
        if (entries.size > 10_000) unsafe("This EPUB contains too many files.")
        val names = HashSet<String>()
        var expanded = 0L
        val buffer = ByteArray(64 * 1024)
        entries.forEachIndexed { index, entry ->
          check()
          val name = entry.name
          if (name.startsWith('/') || name.contains('\\') || name.contains('\u0000') || name.split('/').any { it == ".." || it == "." } || Regex("^[A-Za-z]:").containsMatchIn(name) || !names.add(name)) unsafe("This EPUB has unsafe or duplicate internal paths.")
          if (!entry.isDirectory) zip.getInputStream(entry).use { input ->
            while (true) {
              check()
              val read = input.read(buffer)
              if (read < 0) break
              expanded += read
              if (expanded > MAX_EXPANDED) unsafe("This EPUB expands beyond the 1 GiB safety limit.")
            }
          }
          if (index % 20 == 0) progress((index * 15 / entries.size.coerceAtLeast(1)).coerceAtMost(15), "Checking EPUB contents")
        }

        fun bytes(path: String, limit: Int = MAX_ENTRY): ByteArray {
          val entry = zip.getEntry(path) ?: throw PreparationFailure("BOOK_INVALID_EPUB", "The EPUB is missing an internal document.")
          if (entry.size > limit) unsafe("An EPUB document exceeds its safe size limit.")
          val output = ByteArrayOutputStream()
          zip.getInputStream(entry).use { input ->
            while (true) {
              check()
              val read = input.read(buffer)
              if (read < 0) break
              if (output.size() + read > limit) unsafe("An EPUB document exceeds its safe size limit.")
              output.write(buffer, 0, read)
            }
          }
          return output.toByteArray()
        }
        if (String(bytes("mimetype", 64), Charsets.US_ASCII) != "application/epub+zip") unsafe("This file is not an EPUB.")
        val container = xml(bytes("META-INF/container.xml", 1024 * 1024))
        val root = elements(container, "rootfile").firstOrNull()?.attr("full-path") ?: unsafe("This EPUB has no package document.")
        val packagePath = resolve("", root)
        val opf = xml(bytes(packagePath, 4 * 1024 * 1024))
        val manifest = elements(opf, "item").associateBy { it.attr("id") }
        if (manifest.size != elements(opf, "item").size || manifest.containsKey("")) unsafe("The EPUB manifest has duplicate or missing IDs.")
        if (zip.getEntry("META-INF/rights.xml") != null) protectedBook()
        zip.getEntry("META-INF/encryption.xml")?.let {
          val encryption = xml(bytes(it.name, 1024 * 1024))
          elements(encryption, "EncryptionMethod").forEach { method ->
            if (method.attr("Algorithm") !in setOf("http://www.idpf.org/2008/embedding", "http://ns.adobe.com/pdf/enc#RC")) protectedBook()
          }
          if (elements(encryption, "EncryptedData").size != elements(encryption, "EncryptionMethod").size) protectedBook()
          elements(encryption, "CipherReference").forEach { reference ->
            val target = resolve("", reference.attr("URI"))
            val item = manifest.values.find { resolve(packagePath, it.attr("href")) == target }
            if (item == null || !item.attr("media-type").let { type -> type.startsWith("font/") || type in setOf("application/vnd.ms-opentype", "application/font-sfnt", "application/font-woff") }) protectedBook()
          }
        }

        val labels = linkedMapOf<String, String>()
        val nav = manifest.values.firstOrNull { "nav" in it.attr("properties").split(' ') }
        if (nav != null) {
          val path = resolve(packagePath, nav.attr("href"))
          val document = html(bytes(path))
          val toc = document.select("nav").firstOrNull { it.attr("epub:type").split(' ').contains("toc") || it.attr("role") == "doc-toc" }
          (toc ?: document).select("a[href]").forEach { a ->
            runCatching { location(path, a.attr("href")) }.getOrNull()?.let { key -> labels.putIfAbsent(key, a.text().take(180)) }
          }
        } else {
          val ncx = manifest.values.firstOrNull { it.attr("media-type") == "application/x-dtbncx+xml" }
          if (ncx != null) {
            val path = resolve(packagePath, ncx.attr("href"))
            elements(xml(bytes(path)), "navPoint").forEach { point ->
              val content = elements(point, "content").firstOrNull()
              val text = elements(point, "text").firstOrNull()?.text()
              if (content != null && !text.isNullOrBlank()) labels.putIfAbsent(location(path, content.attr("src")), text.take(180))
            }
          }
        }
        val warnings = mutableListOf<String>()
        val builder = DocumentBuilder(identity, check)
        val spine = elements(opf, "itemref")
        if (spine.isEmpty() || spine.size > 1_000) unsafe("This EPUB has no usable reading order or too many chapters.")
        val seenSpine = HashSet<String>()
        spine.forEachIndexed { ordinal, ref ->
          check()
          val item = manifest[ref.attr("idref")] ?: unsafe("The EPUB reading order refers to a missing document.")
          val path = resolve(packagePath, item.attr("href"))
          if (!seenSpine.add(path)) unsafe("The EPUB repeats a reading-order document.")
          if (item.attr("media-type") !in setOf("application/xhtml+xml", "text/html")) {
            throw PreparationFailure("BOOK_EPUB_LAYOUT", "This EPUB contains image-only or unsupported reading-order content. Try a reflowable text edition.")
          }
          val doc = html(bytes(path))
          if (doc.select("script, iframe, object, embed, audio, video").isNotEmpty()) warnings.add("Active or multimedia content was ignored; only book text is shown.")
          doc.select("script,style,iframe,object,embed,template,noscript,audio,video,svg,math,[hidden],[aria-hidden=true]").remove()
          doc.select("[style]").filter { Regex("(?i)(display\\s*:\\s*none|visibility\\s*:\\s*hidden)").containsMatchIn(it.attr("style")) }.forEach { it.remove() }
          val title = labels[path] ?: labels.entries.firstOrNull { it.key.substringBefore('#') == path }?.value
            ?: doc.selectFirst("h1,h2")?.text() ?: doc.title().ifBlank { "Chapter ${ordinal + 1}" }
          builder.chapter(title, "epub:$path")
          val content = StringBuilder()
          var blockNumber = 1
          var segment = 0
          var kind = "paragraph"
          var anchor = "epub:$path:block:0"
          fun flush() {
            if (content.isNotBlank()) {
              val raw = if (kind == "pre") content.toString() else content.toString().replace(space, " ")
              val cleaned = if (kind == "pre") raw else com.aireader.narration.TextNormalizer.fixLigatureSplits(
                raw.replace(Regex("[\\u00AD\\u200B\\uFEFF]"), "")
              )
              if (cleaned.isNotBlank()) {
                builder.block(cleaned, "$anchor:segment:${segment++}", if (kind == "pre") "paragraph" else kind)
              }
            }
            content.setLength(0)
          }
          NodeTraversor.traverse(object : NodeVisitor {
            override fun head(node: Node, depth: Int) {
              check()
              if (depth > 128) unsafe("The EPUB markup is too deeply nested.")
              when (node) {
                is TextNode -> {
                  content.append(node.wholeText)
                  if (content.length > 16_384) throw PreparationFailure("BOOK_PARSER_LIMIT", "An EPUB paragraph is too long for safe preparation.")
                }
                is Element -> {
                  val label = node.id().takeIf { it.isNotEmpty() }?.let { labels["$path#$it"] }
                  if (!label.isNullOrBlank()) { flush(); builder.chapter(label, "epub:$path#${node.id()}") }
                  val tag = node.normalName()
                  if (tag in blockTags) {
                    flush(); kind = if (tag.startsWith('h') && tag.length == 2) "heading" else if (tag == "pre") "pre" else "paragraph"
                    anchor = "epub:$path:block:${blockNumber++}" + node.id().takeIf { it.isNotEmpty() }?.let { "#$it" }.orEmpty()
                  }
                  if (tag == "br") content.append('\n')
                  if (tag == "td" || tag == "th") content.append(' ')
                }
              }
            }
            override fun tail(node: Node, depth: Int) { if (node is Element && node.normalName() in blockTags) flush() }
          }, doc.body())
          flush()
          progress(15 + ((ordinal + 1) * 65 / spine.size), "Extracting EPUB chapter ${ordinal + 1} of ${spine.size}")
        }
        val coverItem = manifest.values.firstOrNull { "cover-image" in it.attr("properties").split(' ') }
          ?: elements(opf, "meta").firstOrNull { it.attr("name") == "cover" }?.attr("content")?.let { manifest[it] }
        val cover = if (coverItem != null && coverItem.attr("media-type") in setOf("image/jpeg", "image/png", "image/webp")) {
          try { bytes(resolve(packagePath, coverItem.attr("href")), 5 * 1024 * 1024) }
          catch (error: PreparationFailure) { if (error.code == "BOOK_PREPARATION_CANCELLED") throw error; warnings.add("The embedded cover could not be loaded."); null }
        } else null
        return builder.finish(VERSION, elements(opf, "title").firstOrNull()?.text(), elements(opf, "creator").firstOrNull()?.text(), warnings, cover)
      }
    } catch (error: PreparationFailure) { throw error }
    catch (error: Exception) {
      throw PreparationFailure(
        "BOOK_INVALID_EPUB",
        "This EPUB is damaged or has unsupported markup. Try another edition.",
      ).apply { initCause(error) }
    }
  }

  private fun elements(root: Element, name: String) = root.getAllElements().filter { it.tagName().substringAfter(':').equals(name, true) }
  private fun xml(bytes: ByteArray): Document {
    val doc = parse(bytes, Parser.xmlParser())
    if (doc.childNodes().any { it.nodeName() == "#doctype" } || doc.outerHtml().contains("<!ENTITY", true)) unsafe("DTD and entity declarations are not allowed in EPUB package metadata.")
    return doc
  }
  private fun html(bytes: ByteArray) = parse(bytes, Parser.htmlParser())
  private fun parse(bytes: ByteArray, parser: Parser): Document {
    if (bytes.count { it == '<'.code.toByte() } > 100_000) unsafe("This EPUB document has too many markup nodes.")
    val doc = Jsoup.parse(ByteArrayInputStream(bytes), null, "", parser.setMaxDepth(128).setTrackErrors(16))
    if (parser.errors.any { it.errorMessage.contains("depth", true) }) unsafe("This EPUB document is too deeply nested.")
    return doc
  }
  internal fun resolve(base: String, reference: String): String {
    val uri = try { URI(reference.replace(" ", "%20")) } catch (_: Exception) { unsafe("This EPUB has an invalid internal reference.") }
    if (uri.isAbsolute || uri.rawAuthority != null || uri.rawQuery != null || uri.path.orEmpty().startsWith('/') || uri.path.orEmpty().contains('\\') || uri.path.orEmpty().contains('\u0000')) unsafe("Remote or unsafe EPUB references are not supported.")
    if (uri.path.isNullOrEmpty()) return base.ifEmpty { unsafe("This EPUB has an empty internal reference.") }
    val parts = mutableListOf<String>()
    val combined = base.substringBeforeLast('/', "").let { if (it.isEmpty()) uri.path else "$it/${uri.path}" }
    combined.split('/').forEach { part -> when (part) { "", "." -> Unit; ".." -> if (parts.isEmpty()) unsafe("An EPUB reference escapes the book.") else parts.removeAt(parts.lastIndex); else -> parts.add(part) } }
    return parts.joinToString("/").ifEmpty { unsafe("This EPUB has an empty internal reference.") }
  }
  private fun location(base: String, reference: String): String = resolve(base, reference) + URI(reference.replace(" ", "%20")).fragment?.let { "#$it" }.orEmpty()
  private fun unsafe(message: String): Nothing = throw PreparationFailure("BOOK_EPUB_UNSAFE", message)
  private fun protectedBook(): Nothing = throw PreparationFailure("BOOK_PROTECTED", "This EPUB is encrypted or protected. Import a DRM-free copy that you are allowed to read.")
}
