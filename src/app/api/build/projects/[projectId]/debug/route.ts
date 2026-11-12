import mongoose from 'mongoose';
import { requireBuild } from '@/lib/server/build';
import { jsonResponse } from '@/lib/server/http';
import { BuildProject } from '@/models/build-project';
import { BuildRuntimeError } from '@/models/build-runtime-error';

export const runtime = 'nodejs';
type Context = { params: Promise<{ projectId: string }> };

export async function GET(request: Request, route: Context) {
  const gate = await requireBuild(request, 'debug-history');
  if ('response' in gate) return gate.response;
  const { projectId } = await route.params;
  if (!mongoose.isValidObjectId(projectId)) return jsonResponse({ error: 'Project not found.' }, 404);
  const ownerId = new mongoose.Types.ObjectId(gate.context.user.id);
  if (!await BuildProject.exists({ _id: projectId, ownerId })) return jsonResponse({ error: 'Project not found.' }, 404);
  const search = new URL(request.url).searchParams.get('q')?.trim().slice(0, 100);
  const filter: Record<string, unknown> = { ownerId, projectId };
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { message: { $regex: escaped, $options: 'i' } },
      { filePath: { $regex: escaped, $options: 'i' } },
      { command: { $regex: escaped, $options: 'i' } },
    ];
  }
  const errors = await BuildRuntimeError.find(filter).sort({ occurredAt: -1 }).limit(50)
    .select('executionSessionId source severity command message filePath line column stackTrace exitCode occurredAt sourceLogId').lean();
  return jsonResponse({
    errors: errors.map(error => ({
      id: error._id.toString(),
      sessionId: error.executionSessionId.toString(),
      logId: error.sourceLogId.toString(),
      source: error.source,
      severity: error.severity,
      command: error.command,
      message: error.message,
      filePath: error.filePath ?? null,
      line: error.line ?? null,
      column: error.column ?? null,
      stackTrace: error.stackTrace,
      exitCode: error.exitCode,
      occurredAt: error.occurredAt,
    })),
    notice: 'Diagnostics are derived only from commands that returned a non-zero exit code. AI suggestions are not diagnostics.',
  });
}
