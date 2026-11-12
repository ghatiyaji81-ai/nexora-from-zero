import mongoose from 'mongoose';
import { requireCreate } from '@/lib/server/create';
import { safeCreateFilename } from '@/lib/create';
import { jsonResponse } from '@/lib/server/http';
import { CreateAsset } from '@/models/create-asset';

export const runtime = 'nodejs';
type Context = { params: Promise<{ assetId: string }> };

export async function GET(request: Request, route: Context) {
  const gate = await requireCreate(request, 'asset-download', 60);
  if ('response' in gate) return gate.response;
  const { assetId } = await route.params;
  if (!mongoose.isValidObjectId(assetId)) return jsonResponse({ error: 'Asset not found.' }, 404);
  const ownerId = gate.ownerId;
  const asset = await CreateAsset.findOne({ _id: assetId, ownerId }).select('fileId name mimeType size').lean();
  if (!asset) return jsonResponse({ error: 'Asset not found.' }, 404);
  const database = mongoose.connection.db;
  if (!database) return jsonResponse({ error: 'Private asset storage is unavailable.' }, 503);
  const bucket = new mongoose.mongo.GridFSBucket(database, { bucketName: 'create_assets' });
  const storedFile = await bucket.find({ _id: asset.fileId, 'metadata.ownerId': ownerId, 'metadata.private': true }).limit(1).next();
  if (!storedFile || storedFile.length !== asset.size) return jsonResponse({ error: 'Asset not found.' }, 404);
  const total = asset.size;
  const range = request.headers.get('range');
  let start = 0;
  let end = total;
  let status = 200;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${total}` } });
    if (!match[1]) {
      const suffix = Number(match[2]);
      start = Math.max(0, total - suffix);
    } else start = Number(match[1]);
    end = match[1] && match[2] ? Math.min(total, Number(match[2]) + 1) : total;
    if (start >= total || end <= start) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${total}` } });
    status = 206;
  }
  const download = bucket.openDownloadStream(asset.fileId, status === 206 ? { start, end } : undefined);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      download.on('data', chunk => controller.enqueue(new Uint8Array(chunk)));
      download.once('end', () => controller.close());
      download.once('error', () => controller.error(new Error('The private asset could not be read.')));
    },
    cancel() { download.destroy(); },
  });
  const filename = safeCreateFilename(asset.name);
  const fallbackName = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\\r\n]/g, '_');
  const encodedName = encodeURIComponent(filename).replace(/[!'()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  const inline = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'audio/mpeg', 'audio/wav'].includes(asset.mimeType);
  return new Response(body, {
    status,
    headers: {
      'Content-Type': asset.mimeType,
      'Content-Length': String(end - start),
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`,
      'Cache-Control': 'private, no-store',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'X-Content-Type-Options': 'nosniff',
      'Accept-Ranges': 'bytes',
      ...(status === 206 ? { 'Content-Range': `bytes ${start}-${end - 1}/${total}` } : {}),
    },
  });
}
