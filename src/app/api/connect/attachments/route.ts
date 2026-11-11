import mongoose from 'mongoose';
import { Readable } from 'node:stream';
import { requireConnect, MAX_UPLOAD_BYTES, memberConversation } from '@/lib/server/connect';
import { jsonResponse } from '@/lib/server/http';

export const runtime = 'nodejs';
const allowedTypes = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'video/mp4', 'video/webm',
  'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain',
  'audio/webm', 'audio/ogg', 'audio/wav', 'audio/mpeg', 'audio/mp4',
]);

function kindFor(type: string): 'image' | 'video' | 'document' | 'audio' {
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  return 'document';
}

function readUint32(bytes: Uint8Array, offset: number) {
  return bytes[offset] * 0x1000000 + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
}

function crc32(bytes: Uint8Array, start: number, end: number) {
  let crc = 0xffffffff;
  for (let index = start; index < end; index += 1) {
    crc ^= bytes[index];
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function validPng(bytes: Uint8Array, ascii: (start: number, end: number) => string) {
  if (bytes.length < 45 || bytes[0] !== 0x89 || ascii(1, 4) !== 'PNG' || bytes[4] !== 0x0d || bytes[5] !== 0x0a || bytes[6] !== 0x1a || bytes[7] !== 0x0a) return false;
  let offset = 8;
  let hasHeader = false;
  let hasImageData = false;
  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const next = offset + 12 + length;
    if (length > MAX_UPLOAD_BYTES || next > bytes.length) return false;
    const type = ascii(offset + 4, offset + 8);
    if (crc32(bytes, offset + 4, offset + 8 + length) !== readUint32(bytes, offset + 8 + length)) return false;
    if (!hasHeader) {
      if (type !== 'IHDR' || length !== 13 || readUint32(bytes, offset + 8) === 0 || readUint32(bytes, offset + 12) === 0) return false;
      hasHeader = true;
    } else if (type === 'IHDR') return false;
    if (type === 'IDAT') hasImageData = true;
    if (type === 'IEND') return length === 0 && hasImageData && next === bytes.length;
    offset = next;
  }
  return false;
}

function signatureMatches(type: string, bytes: Uint8Array) {
  const ascii = (start: number, end: number) => new TextDecoder().decode(bytes.slice(start, end));
  if (type === 'image/jpeg') return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
  if (type === 'image/png') return validPng(bytes, ascii);
  if (type === 'image/gif') return bytes.length >= 14 && ['GIF87a', 'GIF89a'].includes(ascii(0, 6)) && bytes.at(-1) === 0x3b;
  if (type === 'image/webp') return bytes.length >= 30 && ascii(0, 4) === 'RIFF' && readUint32(bytes, 4) === bytes.length - 8 && ascii(8, 12) === 'WEBP' && ['VP8 ', 'VP8L', 'VP8X'].includes(ascii(12, 16));
  if (type === 'video/mp4' || type === 'audio/mp4') return bytes.length >= 16 && readUint32(bytes, 0) >= 16 && readUint32(bytes, 0) <= bytes.length && ascii(4, 8) === 'ftyp';
  if (type === 'video/webm' || type === 'audio/webm') return bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  if (type === 'application/pdf') return bytes.length >= 15 && ascii(0, 5) === '%PDF-' && /%%EOF\s*$/.test(ascii(Math.max(0, bytes.length - 1024), bytes.length));
  if (type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const scanStart = Math.max(0, bytes.length - 65_557);
    let hasEndRecord = false;
    for (let index = bytes.length - 22; index >= scanStart; index -= 1) {
      if (bytes[index] === 0x50 && bytes[index + 1] === 0x4b && bytes[index + 2] === 0x05 && bytes[index + 3] === 0x06) { hasEndRecord = true; break; }
    }
    return bytes.length >= 30 && ascii(0, 2) === 'PK' && hasEndRecord;
  }
  if (type === 'audio/ogg') return bytes.length >= 27 && ascii(0, 4) === 'OggS' && bytes[4] === 0;
  if (type === 'audio/wav') return bytes.length >= 44 && ascii(0, 4) === 'RIFF' && readUint32(bytes, 4) === bytes.length - 8 && ascii(8, 12) === 'WAVE';
  if (type === 'audio/mpeg') return bytes.length >= 4 && (ascii(0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0));
  if (type === 'text/plain') {
    if (bytes.slice(0, 4096).includes(0)) return false;
    try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); return true; } catch { return false; }
  }
  return false;
}

export async function POST(request: Request) {
  const gate = await requireConnect(request, 'attachment-upload', 20);
  if ('response' in gate) return gate.response;
  const length = Number(request.headers.get('content-length'));
  if (!Number.isFinite(length) || length < 1 || length > MAX_UPLOAD_BYTES + 64 * 1024) return jsonResponse({ error: 'Upload size must be 25 MB or less.' }, 413);
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  const conversationId = form?.get('conversationId');
  if (!(file instanceof File) || typeof conversationId !== 'string') return jsonResponse({ error: 'Choose a file and conversation.' }, 400);
  const conversation = await memberConversation(gate.context.user.id, conversationId);
  if (!conversation) return jsonResponse({ error: 'Conversation not found.' }, 404);
  const contentType = file.type.split(';', 1)[0].trim().toLowerCase();
  if (file.size < 1 || file.size > MAX_UPLOAD_BYTES || !allowedTypes.has(contentType)) return jsonResponse({ error: 'File type is not supported or the file exceeds 25 MB.' }, 415);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!signatureMatches(contentType, bytes)) return jsonResponse({ error: 'File contents do not match the selected file type.' }, 415);
  const database = mongoose.connection.db;
  if (!database) return jsonResponse({ error: 'File storage is unavailable.' }, 503);
  const bucket = new mongoose.mongo.GridFSBucket(database, { bucketName: 'connect_attachments' });
  const cleanName = file.name.replace(/[\r\n"\\/\x00-\x1f]/g, '_').trim().slice(0, 120) || 'attachment';
  const upload = bucket.openUploadStream(cleanName, {
    metadata: { originalName: cleanName, contentType, kind: kindFor(contentType), conversationId: conversation._id, uploaderId: new mongoose.Types.ObjectId(gate.context.user.id), verified: true },
  });
  await new Promise<void>((resolve, reject) => {
    upload.once('error', reject);
    upload.once('finish', resolve);
    Readable.from(Buffer.from(bytes)).pipe(upload);
  });
  return jsonResponse({ fileId: upload.id.toString(), fileName: cleanName, contentType, size: file.size, kind: kindFor(contentType) }, 201);
}
