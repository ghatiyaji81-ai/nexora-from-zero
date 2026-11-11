import 'server-only';
import { inflateRawSync, inflateSync } from 'node:zlib';

const MAX_TEXT_CHARS = 500_000;
const MAX_UNCOMPRESSED_BYTES = 15 * 1024 * 1024;

function decodeXml(value: string) {
  return value.replace(/&#x([\da-f]+);/gi, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function crc32(bytes: Uint8Array) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function findZipEntry(bytes: Buffer, requestedPath: string) {
  let end = -1;
  const lowerBound = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= lowerBound; offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) { end = offset; break; }
  }
  if (end < 0) throw new Error('The DOCX archive is incomplete.');
  const count = bytes.readUInt16LE(end + 10);
  const directorySize = bytes.readUInt32LE(end + 12);
  const directoryStart = bytes.readUInt32LE(end + 16);
  if (count > 10_000 || directorySize > bytes.length || directoryStart + directorySize > end) throw new Error('The DOCX archive is invalid.');

  let offset = directoryStart;
  let totalUncompressed = 0;
  for (let entry = 0; entry < count; entry += 1) {
    if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== 0x02014b50) throw new Error('The DOCX archive is invalid.');
    const flags = bytes.readUInt16LE(offset + 8);
    const method = bytes.readUInt16LE(offset + 10);
    const expectedCrc = bytes.readUInt32LE(offset + 16);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const uncompressedSize = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const localOffset = bytes.readUInt32LE(offset + 42);
    const name = bytes.toString('utf8', offset + 46, offset + 46 + nameLength);
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) throw new Error('The uncompressed DOCX is too large.');
    offset += 46 + nameLength + extraLength + commentLength;
    if (name !== requestedPath) continue;
    if ((flags & 1) !== 0) throw new Error('Encrypted DOCX files are not supported.');
    if (uncompressedSize > MAX_UNCOMPRESSED_BYTES || localOffset + 30 > bytes.length || bytes.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('The DOCX document is invalid.');
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    if (bytes.toString('utf8', localOffset + 30, localOffset + 30 + localNameLength) !== name) throw new Error('The DOCX directory entry does not match its document.');
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.length) throw new Error('The DOCX document is incomplete.');
    const compressed = bytes.subarray(dataStart, dataEnd);
    let result: Buffer | null = null;
    try { result = method === 0 ? Buffer.from(compressed) : method === 8 ? inflateRawSync(compressed, { maxOutputLength: MAX_UNCOMPRESSED_BYTES }) : null; }
    catch { throw new Error('The DOCX document could not be safely extracted.'); }
    if (!result || result.length !== uncompressedSize || crc32(result) !== expectedCrc) throw new Error('The DOCX document could not be safely extracted.');
    return result.toString('utf8');
  }
  throw new Error('The DOCX file has no main document.');
}

function docxText(bytes: Buffer) {
  const xml = findZipEntry(bytes, 'word/document.xml');
  return decodeXml(xml.replace(/<w:(?:del|instr)Text\b[^>]*>[\s\S]*?<\/w:(?:del|instr)Text>/g, '')
    .replace(/<w:tab\b[^>]*\/?\s*>/g, '\t')
    .replace(/<w:br\b[^>]*\/?\s*>/g, '\n')
    .replace(/<\/w:(?:p|tr)>/g, '\n')
    .replace(/<\/w:tc>/g, '\t')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n'));
}

function pdfLiteralBytes(source: string) {
  const values: number[] = [];
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char !== '\\') { values.push(source.charCodeAt(index) & 0xff); continue; }
    index += 1;
    const escaped = source[index];
    if (escaped === undefined) break;
    const control: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12, '(': 40, ')': 41, '\\': 92 };
    if (escaped in control) values.push(control[escaped]);
    else if (escaped === '\r' || escaped === '\n') { if (escaped === '\r' && source[index + 1] === '\n') index += 1; }
    else if (/[0-7]/.test(escaped)) {
      let octal = escaped;
      for (let count = 0; count < 2 && /[0-7]/.test(source[index + 1] ?? ''); count += 1) octal += source[++index];
      values.push(Number.parseInt(octal, 8) & 0xff);
    } else values.push(escaped.charCodeAt(0) & 0xff);
  }
  return Buffer.from(values);
}

function pdfHexBytes(source: string) {
  const normalized = source.replace(/\s/g, '');
  const even = normalized.length % 2 ? `${normalized}0` : normalized;
  return Buffer.from(even, 'hex');
}

function parseCMap(source: string) {
  const map = new Map<number, string>();
  const hexToUnicode = (hex: string) => {
    let value = hex.replace(/\s/g, '');
    if (value.length % 4 !== 0) value = value.padStart(Math.ceil(value.length / 4) * 4, '0');
    let output = '';
    for (let index = 0; index + 4 <= value.length; index += 4) output += String.fromCharCode(Number.parseInt(value.slice(index, index + 4), 16));
    return output;
  };
  for (const block of source.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const pair of block[1].matchAll(/<([\da-f]+)>\s*<([\da-f]+)>/gi)) map.set(Number.parseInt(pair[1], 16), hexToUnicode(pair[2]));
  }
  for (const block of source.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const range of block[1].matchAll(/<([\da-f]+)>\s*<([\da-f]+)>\s*(?:<([\da-f]+)>|\[([^\]]*)\])/gi)) {
      const start = Number.parseInt(range[1], 16);
      const stop = Number.parseInt(range[2], 16);
      if (stop - start > 2048) continue;
      if (range[3]) {
        const base = Number.parseInt(range[3], 16);
        for (let code = start; code <= stop; code += 1) map.set(code, String.fromCharCode(base + code - start));
      } else if (range[4]) {
        const values = [...range[4].matchAll(/<([\da-f]+)>/gi)];
        for (let index = 0; index < values.length && start + index <= stop; index += 1) map.set(start + index, hexToUnicode(values[index][1]));
      }
    }
  }
  return map;
}

function decodePdfString(bytes: Buffer, cmap: Map<number, string>) {
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  const decoded: string[] = [];
  const widths = [...cmap.keys()].map(key => Math.max(1, Math.ceil(key.toString(16).length / 2)));
  const maxWidth = Math.min(4, Math.max(1, ...widths));
  for (let index = 0; index < bytes.length;) {
    let found = false;
    for (let width = maxWidth; width > 0 && index + width <= bytes.length; width -= 1) {
      const code = bytes.subarray(index, index + width).reduce((value, byte) => value * 256 + byte, 0);
      const value = cmap.get(code);
      if (value !== undefined) { decoded.push(value); index += width; found = true; break; }
    }
    if (!found) { decoded.push(String.fromCharCode(bytes[index])); index += 1; }
  }
  return decoded.join('');
}

function pdfStreamText(bytes: Buffer) {
  if (bytes.includes(Buffer.from('/Encrypt'))) throw new Error('Encrypted PDFs are not supported.');
  const latin = bytes.toString('latin1');
  const streams: Array<{ dictionary: string; data: Buffer }> = [];
  const streamPattern = /stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = streamPattern.exec(latin)) !== null) {
    const dictStart = latin.lastIndexOf('obj', match.index);
    const dictEnd = latin.lastIndexOf('endobj', match.index);
    if (dictStart < 0 || dictEnd > dictStart) continue;
    const end = latin.indexOf('endstream', match.index + match[0].length);
    if (end < 0) throw new Error('The PDF contains an incomplete stream.');
    let streamEnd = end;
    if (latin[streamEnd - 1] === '\n') streamEnd -= 1;
    if (latin[streamEnd - 1] === '\r') streamEnd -= 1;
    const dictionary = latin.slice(dictStart, match.index);
    const raw = bytes.subarray(match.index + match[0].length, streamEnd);
    let data: Buffer;
    if (/\/FlateDecode\b/.test(dictionary)) {
      try { data = inflateSync(raw, { maxOutputLength: MAX_UNCOMPRESSED_BYTES }); }
      catch { throw new Error('The PDF uses unsupported or invalid compression.'); }
    } else if (/\/Filter\b/.test(dictionary)) throw new Error('The PDF uses an unsupported compression filter.');
    else data = Buffer.from(raw);
    streams.push({ dictionary, data });
    streamPattern.lastIndex = end + 9;
  }
  const cmap = new Map<number, string>();
  for (const stream of streams) {
    const streamText = stream.data.toString('latin1');
    if (streamText.includes('beginbfchar') || streamText.includes('beginbfrange')) {
      for (const [key, value] of parseCMap(streamText)) cmap.set(key, value);
    }
  }

  const output: string[] = [];
  const textOperand = /(\((?:\\.|[^\\)])*\)|<[\da-f\s]*>|\[[\s\S]*?\])\s*(?:Tj|TJ|'|")/g;
  for (const stream of streams) {
    const text = stream.data.toString('latin1');
    for (const operand of text.matchAll(textOperand)) {
      const source = operand[1];
      const strings = source.startsWith('[')
        ? [...source.matchAll(/\((?:\\.|[^\\)])*\)|<[\da-f\s]*>/gi)].map(item => item[0])
        : [source];
      const value = strings.map(item => decodePdfString(
        item.startsWith('(') ? pdfLiteralBytes(item.slice(1, -1)) : pdfHexBytes(item.slice(1, -1)), cmap,
      )).join('');
      if (value.trim()) output.push(value);
    }
  }
  const text = output.join('\n').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').trim();
  if (!text) throw new Error('This PDF has no extractable text. Scanned or object-stream PDFs are not supported yet.');
  return { text, pageCount: Math.max(1, [...latin.matchAll(/\/Type\s*\/Page\b/g)].length) };
}

export function extractThinkDocument(bytes: Uint8Array, mimeType: string) {
  const buffer = Buffer.from(bytes);
  let text: string;
  let pageCount: number | undefined;
  if (mimeType === 'text/plain') {
    if (buffer.includes(0)) throw new Error('The text file is not valid UTF-8 text.');
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
    catch { throw new Error('The text file is not valid UTF-8.'); }
  } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    if (buffer.length < 30 || buffer.readUInt32LE(0) !== 0x04034b50) throw new Error('The DOCX file is invalid.');
    text = docxText(buffer);
  } else if (mimeType === 'application/pdf') {
    if (buffer.length < 15 || buffer.toString('ascii', 0, 5) !== '%PDF-' || !/%%EOF\s*$/.test(buffer.toString('latin1', Math.max(0, buffer.length - 2048)))) throw new Error('The PDF file is incomplete or invalid.');
    const extracted = pdfStreamText(buffer);
    text = extracted.text;
    pageCount = extracted.pageCount;
  } else throw new Error('This document type is not supported.');

  text = text.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
  if (!text) throw new Error('The document contains no extractable text.');
  if (text.length > MAX_TEXT_CHARS) throw new Error('The extracted text is too large. Limit documents to 500,000 characters.');
  return { text, pageCount };
}
