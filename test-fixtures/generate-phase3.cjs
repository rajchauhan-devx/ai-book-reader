// Synthetic, original fixtures only. Run: node test-fixtures/generate-phase3.cjs
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const assert = require('node:assert/strict');
const out = __dirname;
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function zip(entries) {
  const local = [],
    central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const file = Buffer.from(name),
      raw = Buffer.isBuffer(text) ? text : Buffer.from(text),
      data = name === 'mimetype' ? raw : zlib.deflateRawSync(raw),
      crc = crc32(raw);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(name === 'mimetype' ? 0 : 8, 8);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(raw.length, 22);
    header.writeUInt16LE(file.length, 26);
    local.push(header, file, data);
    const index = Buffer.alloc(46);
    index.writeUInt32LE(0x02014b50);
    index.writeUInt16LE(20, 4);
    index.writeUInt16LE(20, 6);
    index.writeUInt16LE(name === 'mimetype' ? 0 : 8, 10);
    index.writeUInt32LE(crc, 16);
    index.writeUInt32LE(data.length, 20);
    index.writeUInt32LE(raw.length, 24);
    index.writeUInt16LE(file.length, 28);
    index.writeUInt32LE(offset, 42);
    central.push(index, file);
    offset += header.length + file.length + data.length;
  }
  const directory = Buffer.concat(central),
    end = Buffer.alloc(22),
    count = Object.keys(entries).length;
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(count, 8);
  end.writeUInt16LE(count, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
function epub(large = false) {
  const paragraphs = Array.from(
    { length: large ? 10000 : 30 },
    (_, i) =>
      '<p>Paragraph ' +
      (i + 1) +
      '. ' +
      (large
        ? 'The patient gardener watched the morning light. A breeze moved through the leaves. '
        : 'A new leaf opened in the morning light.') +
      '</p>',
  ).join('');
  return zip({
    mimetype: 'application/epub+zip',
    'META-INF/container.xml':
      "<container><rootfiles><rootfile full-path='OPS/book.opf'/></rootfiles></container>",
    'OPS/book.opf':
      "<package version='3.0' xmlns:dc='http://purl.org/dc/elements/1.1/'><metadata><dc:title>" +
      (large ? 'Preparation Stress Test' : 'Garden Stories') +
      "</dc:title><dc:creator>AI Reader Test</dc:creator></metadata><manifest><item id='one' href='one.xhtml' media-type='application/xhtml+xml'/><item id='two' href='two.xhtml' media-type='application/xhtml+xml'/><item id='nav' href='nav.xhtml' properties='nav' media-type='application/xhtml+xml'/><item id='cover' href='cover.png' media-type='image/png' properties='cover-image'/></manifest><spine><itemref idref='one'/><itemref idref='two'/></spine></package>",
    'OPS/one.xhtml':
      "<html><body><h1 id='dawn'>Dawn in the garden</h1>" +
      paragraphs +
      '<script>NEVER DISPLAY THIS SCRIPT</script></body></html>',
    'OPS/two.xhtml':
      "<html><body><h1 id='evening'>Evening</h1><p>नमस्ते, café, 😀. The story ends peacefully.</p></body></html>",
    'OPS/nav.xhtml':
      "<html><body><nav epub:type='toc'><a href='one.xhtml#dawn'>Dawn in the garden</a><a href='two.xhtml#evening'>Evening</a></nav></body></html>",
    'OPS/cover.png': Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    ),
  });
}
function pdf(scanned = false) {
  const first = scanned
    ? '0.3 g 50 600 300 80 re f'
    : 'BT /F1 18 Tf 50 720 Td (Morning on the page.) Tj 0 -32 Td (This text was extracted privately.) Tj ET';
  const second =
    'BT /F1 18 Tf 50 720 Td (A second chapter by the river.) Tj ET';
  const stream = text =>
    '<< /Length ' +
    Buffer.byteLength(text) +
    ' >>\nstream\n' +
    text +
    '\nendstream';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    scanned
      ? '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'
      : '<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    stream(first),
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 7 0 R >>',
    stream(second),
    '<< /Title (' +
      (scanned ? 'Scanned Test' : 'River Pages') +
      ') /Author (AI Reader Test) >>',
  ];
  let result = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(result));
    result += i + 1 + ' 0 obj\n' + object + '\nendobj\n';
  });
  const xref = Buffer.byteLength(result);
  result +=
    'xref\n0 ' +
    (objects.length + 1) +
    '\n0000000000 65535 f \n' +
    offsets
      .slice(1)
      .map(n => String(n).padStart(10, '0') + ' 00000 n \n')
      .join('') +
    'trailer\n<< /Size ' +
    (objects.length + 1) +
    ' /Root 1 0 R /Info 8 0 R >>\nstartxref\n' +
    xref +
    '\n%%EOF\n';
  assert.equal(result.slice(xref, xref + 4), 'xref');
  return Buffer.from(result);
}
for (const [name, bytes] of Object.entries({
  'phase3-garden.epub': epub(),
  'phase3-large-cancel.epub': epub(true),
  'phase3-text-pages.pdf': pdf(),
  'phase3-scanned.pdf': pdf(true),
})) {
  fs.writeFileSync(path.join(out, name), bytes);
  process.stdout.write(name + ': ' + bytes.length + ' bytes\n');
}
