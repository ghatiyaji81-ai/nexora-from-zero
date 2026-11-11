import mongoose from 'mongoose';
import { z } from 'zod';
import { requireConnect } from '@/lib/server/connect';
import { jsonResponse, parseJsonBody } from '@/lib/server/http';
import { Conversation } from '@/models/conversation';
import { User } from '@/models/user';

export const runtime = 'nodejs';
const schema = z.object({ userId: z.string().regex(/^[a-f\d]{24}$/i).transform(id => id.toLowerCase()) });

export async function POST(request: Request) {
  const gate = await requireConnect(request, 'direct-create', 30);
  if ('response' in gate) return gate.response;
  const parsed = schema.safeParse(await parseJsonBody(request));
  if (!parsed.success || parsed.data.userId === gate.context.user.id) return jsonResponse({ error: 'Choose another NEXORA member.' }, 400);
  const target = await User.findOne({ _id: parsed.data.userId, status: 'active' }).select('_id').lean();
  if (!target) return jsonResponse({ error: 'Member not found.' }, 404);
  const ids = [gate.context.user.id, parsed.data.userId].sort();
  const directKey = ids.join(':');
  try {
    const conversation = await Conversation.findOneAndUpdate(
      { directKey },
      { $setOnInsert: { type: 'direct', directKey, memberIds: ids.map(id => new mongoose.Types.ObjectId(id)), createdBy: new mongoose.Types.ObjectId(gate.context.user.id) } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    );
    return jsonResponse({ conversationId: conversation._id.toString() }, 200);
  } catch (error) {
    if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000) {
      const conversation = await Conversation.findOne({ directKey }).select('_id').lean();
      if (conversation) return jsonResponse({ conversationId: conversation._id.toString() });
    }
    throw error;
  }
}
