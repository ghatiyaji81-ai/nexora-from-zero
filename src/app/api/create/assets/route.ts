import mongoose from 'mongoose';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { requireCreate } from '@/lib/server/create';
import { jsonResponse } from '@/lib/server/http';
import { safeCreateFilename, hasSupportedCreateFileSignature } from '@/lib/create';
import { CreateAsset } from '@/models/create-asset';
import { CreateProject } from '@/models/create-project';

export const runtime = 'nodejs';
const MAX_ASSET_BYTES = 25 * 1024 * 1024;
const MIME_BY_EXTENSION: Record<string, { mimeType: string; kind: 'image' | 'video' | 'audio' | 'document' }> = {
  png: { mimeType: 'image/png', kind: 'image' },
  jpg: { mimeType: 'image/jpeg', kind: 'image' },
  jpeg: { mimeType: 'image/jpeg', kind: 'image' },
  webp: { mimeType: 'image/webp', kind: 'image' },
  gif: { mimeType: 'image/gif', kind: 'image' },
  mp4: { mimeType: 'video/mp4', kind: 'video' },
  webm: { mimeType: 'video/webm', kind: 'video' },
  mp3: { mimeType: 'audio/mpeg', kind: 'audio' },
  wav: { mimeType: 'audio/wav', kind: 'audio' },
  txt: { mimeType: 'text/plain', kind: 'document' },
  pdf: { mimeType: 'application/pdf', kind: 'document' },
};

function publicAsset(asset: {
  _id: mongoose.Types.ObjectId;
  projectId?: mongoose.Types.ObjectId;
  name: string;
  mimeType: string;
  size: number;
  kind: string;
  folder: string;
  tags: string[];
  favorite: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: asset._id.toString(), projectId: asset.projectId?.toString() ?? null,
    name: asset.name, mimeType: asset.mimeType, size: asset.size, kind: asset.kind,
    folder: asset.folder, tags: asset.tags, favorite: asset.favorite,
    url: `/api/create/assets/${asset._id.toString()}/file`,
    createdAt: asset.createdAt, updatedAt: asset.updatedAt,
  };
}

export async function GET(request: Request) {
  const gate = await requireCreate(request, 'asset-list');
  if ('response' in gate) return gate.response;
  const params = new URL(request.url).searchParams;
  const filter: Record<string, unknown> = { ownerId: gate.ownerId };
  const query = params.get('q')?.trim().slice(0, 80);
  const kind = params.get('kind');
  const projectId = params.get('projectId');
  if (kind && ['image', 'video', 'audio', 'document'].includes(kind)) filter.kind = kind;
  if (params.get('favorite') === '1') filter.favorite = true;
  if (projectId) {
    if (!mongoose.isValidObjectId(projectId) || !await CreateProject.exists({ _id: projectId, ownerId: gate.ownerId })) {
      return jsonResponse({ error: 'Project not found.' }, 404);
    }
    filter.projectId = new mongoose.Types.ObjectId(projectId);
  }
  if (query) filter.name = { $regex: escapeRegex(query), $options: 'i' };
  const assets = await CreateAsset.find(filter).sort({ updatedAt: -1 }).limit(100).select('-ownerId -fileId').lean();
  return jsonResponse({ assets: assets.map(publicAsset) });
}

export async function POST(request: Request) {
  const gate = await requireCreate(request, 'asset-upload', 20);
  if ('response' in gate) return gate.response;
  const contentLength = Number(request.headers.get('content-length'));
  if (!Number.isFinite(contentLength) || contentLength < 1 || contentLength > MAX_ASSET_BYTES + 64 * 1024) {
    return jsonResponse({ error: 'Uploads must be 25 MB or smaller.' }, 413);
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  const projectId = form?.get('projectId');
  if (!(file instanceof File) || file.size < 1 || file.size > MAX_ASSET_BYTES) {
    return jsonResponse({ error: 'Choose a supported file up to 25 MB.' }, 400);
  }
  if (typeof projectId === 'string' && projectId) {
    if (!mongoose.isValidObjectId(projectId) || !await CreateProject.exists({ _id: projectId, ownerId: gate.ownerId })) {
      return jsonResponse({ error: 'Project not found.' }, 404);
    }
  }
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const type = MIME_BY_EXTENSION[extension];
  if (!type) return jsonResponse({ error: 'Supported files: PNG, JPEG, WebP, GIF, MP4, WebM, MP3, WAV, PDF, and TXT.' }, 415);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasSupportedCreateFileSignature(type.mimeType, bytes)) return jsonResponse({ error: 'The file contents do not match the selected file format.' }, 415);
  const database = mongoose.connection.db;
  if (!database) return jsonResponse({ error: 'Private asset storage is unavailable.' }, 503);
  const name = safeCreateFilename(file.name);
  const bucket = new mongoose.mongo.GridFSBucket(database, { bucketName: 'create_assets' });
  const upload = bucket.openUploadStream(name, {
    metadata: { ownerId: gate.ownerId, contentType: type.mimeType, private: true, purpose: 'create-asset' },
  });
  let createdAsset: InstanceType<typeof CreateAsset> | null = null;
  try {
    await pipeline(Readable.from([Buffer.from(bytes)]), upload);
    const asset = await CreateAsset.create({
      ownerId: gate.ownerId,
      projectId: typeof projectId === 'string' && projectId ? new mongoose.Types.ObjectId(projectId) : undefined,
      fileId: upload.id, name, mimeType: type.mimeType, size: bytes.length, kind: type.kind,
    });
    createdAsset = asset;
    if (asset.projectId) {
      await CreateProject.updateOne({ _id: asset.projectId, ownerId: gate.ownerId }, { $addToSet: { assetIds: asset._id } });
      if (asset.kind === 'image') {
        await CreateProject.updateOne({ _id: asset.projectId, ownerId: gate.ownerId, thumbnailAssetId: { $exists: false } }, { $set: { thumbnailAssetId: asset._id } });
      }
    }
    return jsonResponse({ asset: publicAsset(asset) }, 201);
  } catch (error) {
    if (createdAsset) {
      await CreateAsset.deleteOne({ _id: createdAsset._id, ownerId: gate.ownerId });
      if (createdAsset.projectId) {
        await CreateProject.updateOne({ _id: createdAsset.projectId, ownerId: gate.ownerId }, { $pull: { assetIds: createdAsset._id } });
        await CreateProject.updateOne({ _id: createdAsset.projectId, ownerId: gate.ownerId, thumbnailAssetId: createdAsset._id }, { $unset: { thumbnailAssetId: 1 } });
      }
    }
    await bucket.delete(upload.id).catch(() => undefined);
    console.error('CREATE asset upload failed.', { errorName: error instanceof Error ? error.name : 'UnknownError' });
    return jsonResponse({ error: 'The file could not be stored. Please retry.' }, 503);
  }
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
