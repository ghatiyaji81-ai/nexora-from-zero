import mongoose from 'mongoose';
import { requireCreate } from '@/lib/server/create';
import { jsonResponse } from '@/lib/server/http';
import { CreateProject } from '@/models/create-project';
import { CreateProjectVersion } from '@/models/create-project-version';

export const runtime = 'nodejs';
type Context = { params: Promise<{ projectId: string }> };

export async function GET(request: Request, route: Context) {
  const gate = await requireCreate(request, 'project-versions');
  if ('response' in gate) return gate.response;
  const { projectId } = await route.params;
  if (!mongoose.isValidObjectId(projectId)) return jsonResponse({ error: 'Project not found.' }, 404);
  const project = await CreateProject.exists({ _id: projectId, ownerId: gate.ownerId });
  if (!project) return jsonResponse({ error: 'Project not found.' }, 404);
  const versions = await CreateProjectVersion.find({ ownerId: gate.ownerId, projectId }).sort({ revision: -1 }).limit(30).select('-ownerId -data').lean();
  return jsonResponse({ versions: versions.map(version => ({ id: version._id.toString(), revision: version.revision, title: version.title, createdAt: version.createdAt })) });
}

export async function POST(request: Request, route: Context) {
  const gate = await requireCreate(request, 'project-restore', 30);
  if ('response' in gate) return gate.response;
  const { projectId } = await route.params;
  const versionId = new URL(request.url).searchParams.get('versionId');
  if (!mongoose.isValidObjectId(projectId) || !versionId || !mongoose.isValidObjectId(versionId)) return jsonResponse({ error: 'Choose a saved version.' }, 400);
  const [project, version] = await Promise.all([
    CreateProject.findOne({ _id: projectId, ownerId: gate.ownerId }),
    CreateProjectVersion.findOne({ _id: versionId, ownerId: gate.ownerId, projectId }),
  ]);
  if (!project || !version) return jsonResponse({ error: 'Project version not found.' }, 404);
  await CreateProjectVersion.create({ ownerId: gate.ownerId, projectId: project._id, revision: project.revision, title: project.title, data: project.data });
  project.data = version.data;
  project.title = version.title;
  project.revision += 1;
  await project.save();
  return jsonResponse({ project: { id: project._id.toString(), data: project.data, title: project.title, revision: project.revision } });
}
