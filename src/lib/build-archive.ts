import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { safeBuildPath } from '@/lib/build';

export const MAX_BUILD_ARCHIVE_BYTES = 10 * 1024 * 1024;
export const MAX_BUILD_ARCHIVE_FILES = 500;
const MAX_BUILD_ARCHIVE_FILE_BYTES = 256 * 1024;
const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

export type BuildArchiveFile = { path: string; content: string };

export class BuildArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BuildArchiveError';
  }
}

export function readBuildZip(archive: Buffer): BuildArchiveFile[] {
  if (!archive.byteLength || archive.byteLength > MAX_BUILD_ARCHIVE_BYTES) {
    throw new BuildArchiveError('ZIP files must be between 1 byte and 10 MB.');
  }
  if (archive.byteLength < 22) throw new BuildArchiveError('The uploaded file is not a valid ZIP archive.');
  const endRecord = findEndRecord(archive);
  const diskNumber = archive.readUInt16LE(endRecord + 4);
  const centralDisk = archive.readUInt16LE(endRecord + 6);
  const entriesOnDisk = archive.readUInt16LE(endRecord + 8);
  const entryCount = archive.readUInt16LE(endRecord + 10);
  const centralSize = archive.readUInt32LE(endRecord + 12);
  const centralOffset = archive.readUInt32LE(endRecord + 16);
  if (diskNumber || centralDisk || entriesOnDisk !== entryCount || entryCount > MAX_BUILD_ARCHIVE_FILES ||
    entryCount === 0xffff || centralOffset === 0xffffffff || centralSize === 0xffffffff ||
    centralOffset + centralSize > endRecord) {
    throw new BuildArchiveError('This ZIP uses an unsupported or oversized archive layout.');
  }

  const files: BuildArchiveFile[] = [];
  const paths = new Set<string>();
  let totalBytes = 0;
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    requireRange(archive, offset, 46);
    if (archive.readUInt32LE(offset) !== CENTRAL_SIGNATURE) throw new BuildArchiveError('The ZIP directory is malformed.');
    const madeBy = archive.readUInt16LE(offset + 4);
    const flags = archive.readUInt16LE(offset + 8);
    const method = archive.readUInt16LE(offset + 10);
    const expectedCrc = archive.readUInt32LE(offset + 16);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const uncompressedSize = archive.readUInt32LE(offset + 24);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const diskStart = archive.readUInt16LE(offset + 34);
    const externalAttributes = archive.readUInt32LE(offset + 38);
    const localOffset = archive.readUInt32LE(offset + 42);
    const recordLength = 46 + nameLength + extraLength + commentLength;
    requireRange(archive, offset, recordLength);
    if (diskStart !== 0 || compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
      throw new BuildArchiveError('ZIP64 and multi-volume archives are not supported.');
    }
    if (flags & 1) throw new BuildArchiveError('Encrypted ZIP entries are not supported.');
    if (flags & 0x40) throw new BuildArchiveError('Strongly encrypted ZIP entries are not supported.');
    if (method !== 0 && method !== 8) throw new BuildArchiveError('Only stored and deflate ZIP entries are supported.');

    const entryName = decodeUtf8(archive.subarray(offset + 46, offset + 46 + nameLength));
    const isDirectory = entryName.endsWith('/');
    const path = isDirectory ? safeBuildPath(entryName.slice(0, -1)) : safeBuildPath(entryName);
    if (!path) throw new BuildArchiveError(`Unsafe ZIP path: ${entryName.slice(0, 100)}`);
    if (path) {
      if (isSymlink(madeBy, externalAttributes)) throw new BuildArchiveError('Symbolic links are not allowed in project ZIP files.');
    }
    if (!isDirectory && path) {
      if (files.length >= MAX_BUILD_ARCHIVE_FILES) throw new BuildArchiveError('A project archive can contain at most 500 files.');
      const key = path.toLowerCase();
      if (paths.has(key)) throw new BuildArchiveError(`The ZIP contains a duplicate path: ${path}`);
      paths.add(key);
      if (uncompressedSize > MAX_BUILD_ARCHIVE_FILE_BYTES || totalBytes + uncompressedSize > MAX_BUILD_ARCHIVE_BYTES) {
        throw new BuildArchiveError('The ZIP contains files that exceed BUILD size limits.');
      }
      if (uncompressedSize > 0 && compressedSize === 0) throw new BuildArchiveError('The ZIP entry has invalid compressed data.');
      if (compressedSize > 0 && uncompressedSize / compressedSize > 1000) throw new BuildArchiveError('A ZIP entry exceeds the safe compression ratio.');
      const data = readEntryData(archive, localOffset, entryName, flags, method, compressedSize, uncompressedSize, expectedCrc);
      const content = decodeUtf8(data);
      if (content.includes('\0')) throw new BuildArchiveError(`Binary files are not supported: ${path}`);
      totalBytes += data.byteLength;
      files.push({ path, content });
    } else validateDirectoryEntry(archive, localOffset, entryName);
    offset += recordLength;
  }
  if (offset !== centralOffset + centralSize) throw new BuildArchiveError('The ZIP directory size is inconsistent.');
  if (!files.length) throw new BuildArchiveError('The ZIP does not contain any project files.');
  return files;
}

export function writeBuildZip(files: BuildArchiveFile[]) {
  if (!files.length || files.length > MAX_BUILD_ARCHIVE_FILES) throw new BuildArchiveError('A ZIP export must contain between 1 and 500 files.');
  const names = new Set<string>();
  let totalBytes = 0;
  const localRecords: Buffer[] = [];
  const centralRecords: Buffer[] = [];
  let localOffset = 0;
  const date = new Date();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();

  for (const file of files) {
    const path = safeBuildPath(file.path);
    if (!path) throw new BuildArchiveError(`Unsafe project path: ${file.path}`);
    if (names.has(path.toLowerCase())) throw new BuildArchiveError(`Duplicate project path: ${path}`);
    names.add(path.toLowerCase());
    const source = Buffer.from(file.content, 'utf8');
    totalBytes += source.byteLength;
    if (source.byteLength > MAX_BUILD_ARCHIVE_FILE_BYTES || totalBytes > MAX_BUILD_ARCHIVE_BYTES) {
      throw new BuildArchiveError('Project files exceed the 10 MB ZIP export limit.');
    }
    const compressed = deflateRawSync(source);
    const method = compressed.byteLength < source.byteLength ? 8 : 0;
    const payload = method === 8 ? compressed : source;
    const name = Buffer.from(path, 'utf8');
    const checksum = crc32(source);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(LOCAL_SIGNATURE, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(source.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    localRecords.push(local, payload);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(CENTRAL_SIGNATURE, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(source.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(localOffset, 42);
    name.copy(central, 46);
    centralRecords.push(central);
    localOffset += local.length + payload.length;
  }

  const centralDirectory = Buffer.concat(centralRecords);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(EOCD_SIGNATURE, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localRecords, centralDirectory, end]);
}

function findEndRecord(archive: Buffer) {
  const minimum = Math.max(0, archive.length - 22 - 0xffff);
  for (let offset = archive.length - 22; offset >= minimum; offset -= 1) {
    if (archive.readUInt32LE(offset) === EOCD_SIGNATURE) {
      const commentLength = archive.readUInt16LE(offset + 20);
      if (offset + 22 + commentLength === archive.length) return offset;
    }
  }
  throw new BuildArchiveError('The uploaded file is not a valid ZIP archive.');
}

function readEntryData(archive: Buffer, localOffset: number, entryName: string, centralFlags: number, method: number, compressedSize: number, uncompressedSize: number, expectedCrc: number) {
  requireRange(archive, localOffset, 30);
  if (archive.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) throw new BuildArchiveError(`Malformed local ZIP entry: ${entryName}`);
  const localFlags = archive.readUInt16LE(localOffset + 6);
  const localMethod = archive.readUInt16LE(localOffset + 8);
  const localNameLength = archive.readUInt16LE(localOffset + 26);
  const localExtraLength = archive.readUInt16LE(localOffset + 28);
  const localName = decodeUtf8(archive.subarray(localOffset + 30, localOffset + 30 + localNameLength));
  if (localName !== entryName || localFlags !== centralFlags || localMethod !== method) {
    throw new BuildArchiveError(`Inconsistent ZIP entry metadata: ${entryName}`);
  }
  const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
  requireRange(archive, dataOffset, compressedSize);
  const compressed = archive.subarray(dataOffset, dataOffset + compressedSize);
  let content: Buffer;
  try {
    content = method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, { maxOutputLength: MAX_BUILD_ARCHIVE_FILE_BYTES });
  } catch {
    throw new BuildArchiveError(`The ZIP entry could not be safely decompressed: ${entryName}`);
  }
  if (content.byteLength !== uncompressedSize || crc32(content) !== expectedCrc) {
    throw new BuildArchiveError(`The ZIP entry failed its size or integrity check: ${entryName}`);
  }
  return content;
}

function validateDirectoryEntry(archive: Buffer, localOffset: number, entryName: string) {
  requireRange(archive, localOffset, 30);
  if (archive.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) throw new BuildArchiveError(`Malformed ZIP directory entry: ${entryName}`);
}

function isSymlink(madeBy: number, attributes: number) {
  const operatingSystem = madeBy >> 8;
  return operatingSystem === 3 && ((attributes >>> 16) & 0xf000) === 0xa000;
}

function decodeUtf8(bytes: Buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new BuildArchiveError('ZIP paths and project content must be valid UTF-8.');
  }
}

function requireRange(buffer: Buffer, offset: number, length: number) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > buffer.length) {
    throw new BuildArchiveError('The ZIP archive is truncated or malformed.');
  }
}

function crc32(data: Buffer) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
