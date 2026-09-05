package com.aireader.library

import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

class EpubBookParserTest {
  private fun fixture(extra: Map<String,String> = emptyMap(), body: String = "<h1 id='one'>First chapter</h1><p>Hello <em>world</em>. नमस्ते 😀.</p><script>DO NOT READ</script><p hidden='hidden'>HIDDEN</p>", version: Int = 3): File {
    val file = File.createTempFile("reader-epub-", ".epub")
    val entries = linkedMapOf(
      "mimetype" to "application/epub+zip",
      "META-INF/container.xml" to "<container><rootfiles><rootfile full-path='OPS/book.opf'/></rootfiles></container>",
      "OPS/book.opf" to """<package version='$version.0' xmlns:dc='http://purl.org/dc/elements/1.1/'><metadata><dc:title>Garden Stories</dc:title><dc:creator>Ada Reader</dc:creator></metadata><manifest><item id='a' href='first.xhtml' media-type='application/xhtml+xml'/><item id='b' href='second.xhtml' media-type='application/xhtml+xml'/><item id='nav' href='nav.xhtml' media-type='application/xhtml+xml' properties='nav'/></manifest><spine><itemref idref='b'/><itemref idref='a'/></spine></package>""",
      "OPS/first.xhtml" to "<html><body>$body</body></html>",
      "OPS/second.xhtml" to "<html><body><h1>Second in file, first in spine</h1><p>Reading order matters.</p></body></html>",
      "OPS/nav.xhtml" to "<html><body><nav epub:type='toc'><a href='second.xhtml'>Opening</a><a href='first.xhtml#one'>The garden</a></nav></body></html>"
    )
    entries.putAll(extra)
    ZipOutputStream(file.outputStream()).use { zip -> entries.forEach { (path,text) -> zip.putNextEntry(ZipEntry(path)); zip.write(text.toByteArray()); zip.closeEntry() } }
    return file
  }
  private fun parse(file: File): ParsedDocument = try { EpubBookParser.parse(file, "test-hash") } finally { file.delete() }
  private fun reject(file: File, code: String) { try { parse(file); fail("Expected $code") } catch(e: PreparationFailure) {assertEquals(code,e.code)} }
  @Test fun spineMetadataUnicodeAndActiveContent() {
    val doc = parse(fixture())
    assertEquals("Garden Stories",doc.title); assertEquals("Ada Reader",doc.author)
    assertEquals(listOf("Opening","The garden"),doc.chapters.map { it.title })
    val text = doc.chapters.flatMap { it.blocks }.joinToString(" ") { it.text }
    assertTrue(text.contains("Hello world. नमस्ते 😀.")); assertFalse(text.contains("DO NOT READ")); assertFalse(text.contains("HIDDEN"))
    assertTrue(doc.warnings.isNotEmpty())
  }
  @Test fun deterministicIdsAndRepeatedParagraphsStayUnique() {
    val first = parse(fixture(body="<div>Echo<p>Echo</p>Echo</div><p>Echo</p>"))
    val second = parse(fixture(body="<div>Echo<p>Echo</p>Echo</div><p>Echo</p>"))
    assertEquals(first,second)
    val ids=first.chapters.flatMap { it.blocks }.map { it.id }
    assertEquals(ids.size,ids.toSet().size)
  }
  @Test fun rejectsZipTraversal() = reject(fixture(mapOf("../escape" to "x")),"BOOK_EPUB_UNSAFE")
  @Test fun rejectsRemoteSpine() = reject(fixture(mapOf("OPS/book.opf" to "<package><manifest><item id='x' href='https://example.com/book' media-type='text/html'/></manifest><spine><itemref idref='x'/></spine></package>")),"BOOK_EPUB_UNSAFE")
  @Test fun rejectsPackageDtd() = reject(fixture(mapOf("META-INF/container.xml" to "<!DOCTYPE container SYSTEM 'file:///etc/passwd'><container/>")),"BOOK_EPUB_UNSAFE")
  @Test fun rejectsMissingSpineResource() = reject(fixture(mapOf("OPS/book.opf" to "<package><manifest/><spine><itemref idref='missing'/></spine></package>")),"BOOK_EPUB_UNSAFE")
  @Test fun rejectsDrm() = reject(fixture(mapOf("META-INF/rights.xml" to "<rights/>")),"BOOK_PROTECTED")
  @Test fun rejectsContentEncryption() = reject(fixture(mapOf("META-INF/encryption.xml" to "<encryption><EncryptedData><EncryptionMethod Algorithm='AES'/></EncryptedData></encryption>")),"BOOK_PROTECTED")
  @Test fun rejectsOversizedParagraph() = reject(fixture(body="<p>"+"a".repeat(16_385)+"</p>"),"BOOK_PARSER_LIMIT")
  @Test fun rejectsImageOnlySpine() = reject(fixture(mapOf("OPS/book.opf" to "<package><manifest><item id='x' href='cover.png' media-type='image/png'/></manifest><spine><itemref idref='x'/></spine></package>")),"BOOK_EPUB_LAYOUT")
  @Test fun safeRelativePathsAndEncodedEscape() {
    assertEquals("OPS/text/a b.xhtml",EpubBookParser.resolve("OPS/nav/nav.xhtml","../text/a%20b.xhtml#x"))
    try { EpubBookParser.resolve("OPS/nav.xhtml","%2e%2e/%2e%2e/escape"); fail("Traversal accepted") } catch(_:PreparationFailure) {}
  }
  @Test fun cancellationPropagates() {
    val file=fixture()
    try { EpubBookParser.parse(file,"test", {throw PreparationFailure("BOOK_PREPARATION_CANCELLED","Cancelled")}); fail("Ignored cancellation") }
    catch(e:PreparationFailure) {assertEquals("BOOK_PREPARATION_CANCELLED",e.code)} finally {file.delete()}
  }
  @Test fun epubTwoNcxLabelsFollowSpine() {
    val opf="<package version='2.0'><manifest><item id='a' href='first.xhtml' media-type='application/xhtml+xml'/><item id='toc' href='toc.ncx' media-type='application/x-dtbncx+xml'/></manifest><spine toc='toc'><itemref idref='a'/></spine></package>"
    val ncx="<ncx><navMap><navPoint><navLabel><text>NCX chapter</text></navLabel><content src='first.xhtml#one'/></navPoint></navMap></ncx>"
    assertEquals("NCX chapter",parse(fixture(mapOf("OPS/book.opf" to opf,"OPS/toc.ncx" to ncx),version=2)).chapters.first().title)
  }
}
