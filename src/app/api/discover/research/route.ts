import mongoose from 'mongoose';
import { z } from 'zod';
import { buildEvidenceReport } from '@/lib/discover';
import { requireDiscover } from '@/lib/server/discover';
import { jsonResponse, parseJsonBody } from '@/lib/server/http';
import { DiscoverResearchReport } from '@/models/discover-research-report';
import { DiscoverResearchTask } from '@/models/discover-research-task';
import { DiscoverEvidence } from '@/models/discover-evidence';
import { DiscoverSource } from '@/models/discover-source';

export const runtime = 'nodejs';
const createSchema = z.object({
  question: z.string().trim().min(2).max(500),
  title: z.string().trim().min(1).max(160).optional(),
  sourceIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).min(1).max(10),
}).strict();

export async function GET(request: Request) {
  const gate = await requireDiscover(request, 'report-list');
  if ('response' in gate) return gate.response;
  const reports = await DiscoverResearchReport.find({ ownerId: gate.ownerId }).sort({ createdAt: -1 }).limit(50).select('-ownerId -markdown').lean();
  return jsonResponse({ reports: reports.map(report => ({ id: report._id.toString(), taskId: report.taskId.toString(), title: report.title, createdAt: report.createdAt })) });
}

export async function POST(request: Request) {
  const gate = await requireDiscover(request, 'report-create', 12);
  if ('response' in gate) return gate.response;
  const parsed = createSchema.safeParse(await parseJsonBody(request, 8 * 1024));
  if (!parsed.success) return jsonResponse({ error: 'Enter a research question and select at least one saved source.' }, 400);
  const sourceIds = [...new Set(parsed.data.sourceIds)].map(id => new mongoose.Types.ObjectId(id));
  const sources = await DiscoverSource.find({ _id: { $in: sourceIds }, ownerId: gate.ownerId }).select('-ownerId').lean();
  if (sources.length !== sourceIds.length) return jsonResponse({ error: 'One or more saved sources are unavailable.' }, 404);
  const orderedSources = sourceIds.map(id => sources.find(source => source._id.equals(id))).filter((source): source is NonNullable<typeof source> => Boolean(source));
  const title = (parsed.data.title ?? parsed.data.question).replace(/[\r\n#]/g, ' ').trim().slice(0, 160);
  const markdown = buildEvidenceReport(title, parsed.data.question, orderedSources.map(source => ({
    sourceId: source._id.toString(), documentId: source.documentId.toString(),
    title: source.title, excerpt: source.excerpt, start: source.start, end: source.end,
  })));
  let task: InstanceType<typeof DiscoverResearchTask> | undefined;
  let report: InstanceType<typeof DiscoverResearchReport> | undefined;
  try {
    const createdTask = await DiscoverResearchTask.create({
      ownerId: gate.ownerId, question: parsed.data.question, sourceIds, status: 'complete',
    });
    task = createdTask;
    report = await DiscoverResearchReport.create({ ownerId: gate.ownerId, taskId: createdTask._id, title, markdown });
    await DiscoverEvidence.insertMany(orderedSources.map(source => ({
      ownerId: gate.ownerId, taskId: createdTask._id, sourceId: source._id,
      excerpt: source.excerpt, start: source.start, end: source.end,
    })));
  } catch (error) {
    if (task) await DiscoverEvidence.deleteMany({ ownerId: gate.ownerId, taskId: task._id });
    if (report) await DiscoverResearchReport.deleteOne({ _id: report._id, ownerId: gate.ownerId });
    if (task) await DiscoverResearchTask.deleteOne({ _id: task._id, ownerId: gate.ownerId });
    throw error;
  }
  if (!task || !report) return jsonResponse({ error: 'The evidence report could not be saved.' }, 503);
  return jsonResponse({
    task: { id: task._id.toString(), question: task.question, sourceCount: sources.length, status: task.status, createdAt: task.createdAt },
    report: { id: report._id.toString(), title: report.title, markdown: report.markdown, createdAt: report.createdAt },
    notice: 'This report is a source-backed evidence compilation, not an AI-verified conclusion.',
  }, 201);
}
