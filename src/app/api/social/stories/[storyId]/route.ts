import mongoose from 'mongoose';
import { requireSocial } from '@/lib/server/social';
import { jsonResponse } from '@/lib/server/http';
import { SocialStory } from '@/models/social-story';

export const runtime = 'nodejs';
type Context = { params: Promise<{ storyId: string }> };

export async function DELETE(request: Request, route: Context) {
  const gate = await requireSocial(request, 'story-delete', 30);
  if ('response' in gate) return gate.response;
  const { storyId } = await route.params;
  if (!mongoose.isValidObjectId(storyId)) return jsonResponse({ error: 'Story not found.' }, 404);
  const story = await SocialStory.findOneAndDelete({ _id: storyId, ownerId: gate.userId, expiresAt: { $gt: new Date() } });
  if (!story) return jsonResponse({ error: 'Story not found.' }, 404);
  return jsonResponse({ success: true });
}
