import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { test } from 'node:test';
import { extractThinkDocument } from '../src/lib/server/think-documents';

function crc32(bytes: Uint8Array) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function makeDocx(text: string) {
  const name = Buffer.from('word/document.xml');
  const xml = Buffer.from(`<w:document xmlns:w="x"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p><w:p><w:r><w:t>Second paragraph.</w:t></w:r></w:p></w:body></w:document>`);
  const compressed = deflateRawSync(xml);
  const local = Buffer.alloc(30 + name.length);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(8, 8);
  local.writeUInt32LE(crc32(xml), 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(xml.length, 22);
  local.writeUInt16LE(name.length, 26); name.copy(local, 30);
  const central = Buffer.alloc(46 + name.length);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0, 8); central.writeUInt16LE(8, 10);
  central.writeUInt32LE(crc32(xml), 16); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(xml.length, 24);
  central.writeUInt16LE(name.length, 28); central.writeUInt32LE(0, 42); name.copy(central, 46);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(central.length, 12); end.writeUInt32LE(local.length + compressed.length, 16);
  return Buffer.concat([local, compressed, central, end]);
}

function makePdf(text: string) {
  const content = `BT /F1 12 Tf (${text.replace(/[()\\]/g, '\\$&')}) Tj ET`;
  return Buffer.from(`%PDF-1.4\n1 0 obj << /Type /Page >> endobj\n2 0 obj << /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n%%EOF\n`, 'latin1');
}

test('TXT, DOCX and text-layer PDF extraction returns readable content', () => {
  assert.deepEqual(extractThinkDocument(Buffer.from('NEXORA notes\nSecond line.', 'utf8'), 'text/plain'), { text: 'NEXORA notes\nSecond line.', pageCount: undefined });
  const docx = extractThinkDocument(makeDocx('A &amp; B'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.match(docx.text, /A & B/);
  assert.match(docx.text, /Second paragraph/);
  const pdf = extractThinkDocument(makePdf('Hello from PDF'), 'application/pdf');
  assert.match(pdf.text, /Hello from PDF/);
  assert.equal(pdf.pageCount, 1);
});

test('document extraction rejects malformed, unsupported, and non-text inputs', () => {
  assert.throws(() => extractThinkDocument(Buffer.from([0xff, 0xfe]), 'text/plain'), /valid UTF-8/);
  assert.throws(() => extractThinkDocument(Buffer.from('not a pdf'), 'application/pdf'), /incomplete or invalid/);
  assert.throws(() => extractThinkDocument(Buffer.from(''), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), /invalid/);
  assert.throws(() => extractThinkDocument(Buffer.from('anything'), 'application/msword'), /not supported/);
  assert.throws(() => extractThinkDocument(Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF\n'), 'application/pdf'), /no extractable text/);
});

test('DOCX zip entries are checked with CRC before extracting the document body', () => {
  const corrupted = makeDocx('Integrity check');
  corrupted[47] ^= 1;
  assert.throws(() => extractThinkDocument(corrupted, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), /DOCX/);
});
