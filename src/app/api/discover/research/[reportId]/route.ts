import mongoose from 'mongoose';
import { requireDiscover } from '@/lib/server/discover';
import { jsonResponse } from '@/lib/server/http';
import { DiscoverResearchReport } from '@/models/discover-research-report';

export const runtime = 'nodejs';
type Context = { params: Promise<{ reportId: string }> };

export async function GET(request: Request, route: Context) {
  const gate = await requireDiscover(request, 'report-read');
  if ('response' in gate) return gate.response;
  const { reportId } = await route.params;
  if (!mongoose.isValidObjectId(reportId)) return jsonResponse({ error: 'Report not found.' }, 404);
  const report = await DiscoverResearchReport.findOne({ _id: reportId, ownerId: gate.ownerId }).select('-ownerId').lean();
  if (!report) return jsonResponse({ error: 'Report not found.' }, 404);
  if (new URL(request.url).searchParams.get('download') === '1') {
    const filename = report.title.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'research-report';
    return new Response(report.markdown, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}.md"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }
  return jsonResponse({ report: { id: report._id.toString(), taskId: report.taskId.toString(), title: report.title, markdown: report.markdown, createdAt: report.createdAt } });
}
