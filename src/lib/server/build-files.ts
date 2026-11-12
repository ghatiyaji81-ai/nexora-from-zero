import 'server-only';
import mongoose from 'mongoose';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { BuildProjectFileVersion } from '@/models/build-project-file-version';

export const MAX_BUILD_FILE_BYTES = 256 * 1024;
const BUILD_BUCKET = 'build_project_files';

function getBucket() {
  const database = mongoose.connection.db;
  if (!database) throw new Error('BUILD private file storage is unavailable.');
  return new mongoose.mongo.GridFSBucket(database, { bucketName: BUILD_BUCKET });
}

export async function storeBuildFile(ownerId: mongoose.Types.ObjectId, projectId: mongoose.Types.ObjectId, path: string, content: string, purpose = 'build-project-file') {
  const bytes = Buffer.from(content, 'utf8');
  if (bytes.byteLength > MAX_BUILD_FILE_BYTES) throw new Error('BUILD files must be 256 KB or smaller.');
  const bucket = getBucket();
  const upload = bucket.openUploadStream(path, {
    metadata: { ownerId, projectId, private: true, purpose, contentType: 'text/plain; charset=utf-8' },
  });
  try {
    await pipeline(Readable.from([bytes]), upload);
    return { fileId: upload.id as mongoose.Types.ObjectId, size: bytes.byteLength };
  } catch (error) {
    await bucket.delete(upload.id).catch(() => undefined);
    throw error;
  }
}

export async function readBuildFile(fileId: mongoose.Types.ObjectId, ownerId: mongoose.Types.ObjectId, projectId: mongoose.Types.ObjectId) {
  const bucket = getBucket();
  const stored = await bucket.find({ _id: fileId, 'metadata.ownerId': ownerId, 'metadata.projectId': projectId, 'metadata.private': true }).limit(1).next();
  if (!stored || stored.length > MAX_BUILD_FILE_BYTES) return null;
  const chunks: Buffer[] = [];
  for await (const chunk of bucket.openDownloadStream(fileId)) chunks.push(Buffer.from(chunk));
  const content = Buffer.concat(chunks).toString('utf8');
  if (Buffer.byteLength(content, 'utf8') !== stored.length) return null;
  return content;
}

export async function deleteBuildBlob(fileId: mongoose.Types.ObjectId) {
  const bucket = getBucket();
  if (await bucket.find({ _id: fileId }).limit(1).next()) await bucket.delete(fileId);
}

export async function retainBuildFileVersion(input: {
  ownerId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  fileId: mongoose.Types.ObjectId;
  path: string;
  size: number;
  revision: number;
}) {
  try {
    await BuildProjectFileVersion.create(input);
  } catch (error) {
    if (!(error instanceof mongoose.mongo.MongoServerError) || error.code !== 11000) throw error;
    const existing = await BuildProjectFileVersion.findOne({
      ownerId: input.ownerId, projectId: input.projectId, path: input.path, revision: input.revision,
    }).select('fileId').lean();
    if (!existing?.fileId.equals(input.fileId)) throw error;
  }
  const excess = await BuildProjectFileVersion.find({ ownerId: input.ownerId, projectId: input.projectId, path: input.path })
    .sort({ revision: -1 }).skip(20).select('_id fileId').lean();
  if (excess.length) {
    await BuildProjectFileVersion.deleteMany({ _id: { $in: excess.map(version => version._id) }, ownerId: input.ownerId });
    await Promise.all(excess.map(version => deleteBuildBlob(version.fileId)));
  }
}
