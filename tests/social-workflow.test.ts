import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import mongoose from 'mongoose';
import { connectToDatabase } from '../src/lib/server/db';
import { Conversation } from '../src/models/conversation';
import { Permission } from '../src/models/permission';
import { Profile } from '../src/models/profile';
import { Session } from '../src/models/session';
import { SocialBlock } from '../src/models/social-block';
import { SocialBookmark } from '../src/models/social-bookmark';
import { SocialComment } from '../src/models/social-comment';
import { SocialFollow } from '../src/models/social-follow';
import { SocialFollowRequest } from '../src/models/social-follow-request';
import { SocialNotification } from '../src/models/social-notification';
import { SocialPost } from '../src/models/social-post';
import { SocialProfile } from '../src/models/social-profile';
import { SocialReaction } from '../src/models/social-reaction';
import { SocialReport } from '../src/models/social-report';
import { SocialStory } from '../src/models/social-story';
import { User } from '../src/models/user';

const baseUrl = process.env.NEXORA_TEST_ORIGIN ?? 'http://127.0.0.1:3001';
const origin = process.env.NEXORA_TEST_ORIGIN_HEADER ?? new URL(baseUrl).origin;
const address = `social-test-${randomUUID()}`;
const password = 'Correct horse battery staple 82!';

async function request(path: string, cookie?: string, init: RequestInit = {}) {
  return fetch(new URL(path, baseUrl), {
    ...init,
    headers: {
      Origin: origin,
      'x-real-ip': address,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...init.headers,
    },
    redirect: 'manual',
  });
}

async function signup(label: string) {
  const response = await request('/api/auth/signup', undefined, {
    method: 'POST',
    body: JSON.stringify({ fullName: `Social ${label}`, email: `social-${label}-${randomUUID()}@example.test`, password, confirmPassword: password }),
  });
  assert.equal(response.status, 201);
  const payload = await response.json() as { user: { id: string } };
  const cookie = response.headers.get('set-cookie');
  assert.ok(cookie);
  return { id: payload.user.id, cookie: cookie.split(';', 1)[0] };
}

test('SOCIAL profiles, privacy, posts, interactions, stories, reports, and blocks enforce ownership', async () => {
  await connectToDatabase();
  const ownerIds: string[] = [];
  try {
    const alice = await signup('alice');
    ownerIds.push(alice.id);
    const bob = await signup('bob');
    ownerIds.push(bob.id);
    const outsider = await signup('outsider');
    ownerIds.push(outsider.id);

    const aliceProfile = (await (await request('/api/social/profile', alice.cookie)).json() as { profile: { username: string } }).profile;
    const bobProfile = (await (await request('/api/social/profile', bob.cookie)).json() as { profile: { username: string; displayName: string } }).profile;
    const makePrivate = await request('/api/social/profile', bob.cookie, {
      method: 'PATCH',
      body: JSON.stringify({ username: bobProfile.username, displayName: bobProfile.displayName, visibility: 'private' }),
    });
    assert.equal(makePrivate.status, 200);

    const postResponse = await request('/api/social/posts', bob.cookie, {
      method: 'POST', body: JSON.stringify({ body: 'Followers-only note', audience: 'followers' }),
    });
    assert.equal(postResponse.status, 201);
    const post = (await postResponse.json() as { post: { id: string } }).post;
    assert.equal((await request('/api/social/posts?mode=latest', outsider.cookie)).status, 200);
    let outsiderFeed = await (await request('/api/social/posts?mode=latest', outsider.cookie)).json() as { posts: Array<{ id: string }> };
    assert.ok(!outsiderFeed.posts.some(item => item.id === post.id));
    const privateProfile = await (await request(`/api/social/users/${bobProfile.username}`, outsider.cookie)).json() as { private: boolean; posts: unknown[] };
    assert.equal(privateProfile.private, true);
    assert.equal(privateProfile.posts.length, 0);

    const followRequest = await request(`/api/social/follows/${bob.id}`, alice.cookie, {
      method: 'POST', body: JSON.stringify({ action: 'follow' }),
    });
    assert.equal(followRequest.status, 201);
    const incoming = await (await request('/api/social/follow-requests', bob.cookie)).json() as { requests: Array<{ id: string }> };
    assert.equal(incoming.requests.length, 1);
    assert.equal((await request('/api/social/follow-requests', alice.cookie, {
      method: 'PATCH', body: JSON.stringify({ requestId: incoming.requests[0].id, action: 'accept' }),
    })).status, 404);
    assert.equal((await request('/api/social/follow-requests', bob.cookie, {
      method: 'PATCH', body: JSON.stringify({ requestId: incoming.requests[0].id, action: 'accept' }),
    })).status, 200);

    const aliceFeed = await (await request('/api/social/posts?mode=latest', alice.cookie)).json() as { posts: Array<{ id: string }> };
    assert.ok(aliceFeed.posts.some(item => item.id === post.id));
    assert.equal((await request(`/api/social/posts/${post.id}`, outsider.cookie, {
      method: 'PATCH', body: JSON.stringify({ body: 'Attempt to edit another account' }),
    })).status, 404);
    assert.equal((await request(`/api/social/posts/${post.id}/like`, alice.cookie, { method: 'POST' })).status, 200);
    assert.equal((await request(`/api/social/posts/${post.id}/comments`, alice.cookie, {
      method: 'POST', body: JSON.stringify({ body: 'Good note' }),
    })).status, 201);
    assert.equal((await request(`/api/social/posts/${post.id}/bookmark`, alice.cookie, { method: 'POST' })).status, 200);

    const storyResponse = await request('/api/social/stories', bob.cookie, {
      method: 'POST', body: JSON.stringify({ body: 'A temporary update', audience: 'followers' }),
    });
    assert.equal(storyResponse.status, 201);
    const story = (await storyResponse.json() as { story: { id: string } }).story;
    let aliceStories = await (await request('/api/social/stories', alice.cookie)).json() as { stories: Array<{ id: string }> };
    assert.ok(aliceStories.stories.some(item => item.id === story.id));
    await SocialStory.updateOne({ _id: story.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    aliceStories = await (await request('/api/social/stories', alice.cookie)).json() as { stories: Array<{ id: string }> };
    assert.ok(!aliceStories.stories.some(item => item.id === story.id));

    assert.equal((await request('/api/social/reports', alice.cookie, {
      method: 'POST', body: JSON.stringify({ targetType: 'post', targetId: post.id, reason: 'spam' }),
    })).status, 201);
    const direct = await request('/api/connect/conversations/direct', alice.cookie, {
      method: 'POST', body: JSON.stringify({ userId: bob.id }),
    });
    assert.equal(direct.status, 200);
    const conversationId = (await direct.json() as { conversationId: string }).conversationId;
    assert.equal((await request(`/api/social/blocks/${bob.id}`, alice.cookie, {
      method: 'POST', body: JSON.stringify({ blocked: true }),
    })).status, 200);
    const blockedFeed = await (await request('/api/social/posts?mode=latest', alice.cookie)).json() as { posts: Array<{ id: string }> };
    assert.ok(!blockedFeed.posts.some(item => item.id === post.id));
    assert.equal((await request('/api/connect/conversations/direct', alice.cookie, {
      method: 'POST', body: JSON.stringify({ userId: bob.id }),
    })).status, 403);
    const conversations = await (await request('/api/connect/conversations', alice.cookie)).json() as { conversations: Array<{ id: string }> };
    assert.ok(!conversations.conversations.some(item => item.id === conversationId));
    assert.equal((await request(`/api/connect/conversations/${conversationId}/messages`, alice.cookie)).status, 404);
    assert.equal((await request(`/api/connect/conversations/${conversationId}/messages`, alice.cookie, {
      method: 'POST', body: JSON.stringify({ body: 'Contact after block' }),
    })).status, 404);
    assert.equal((await request(`/api/social/posts/${post.id}/comments`, alice.cookie)).status, 404);
    assert.equal(aliceProfile.username.length > 0, true);
  } finally {
    if (ownerIds.length) {
      const ids = ownerIds.map(id => new mongoose.Types.ObjectId(id));
      const byOwner = { ownerId: { $in: ids } };
      const postIds = await SocialPost.find(byOwner).distinct('_id');
      await Promise.all([
        SocialComment.deleteMany({ $or: [byOwner, { postId: { $in: postIds } }] }),
        SocialReaction.deleteMany({ $or: [byOwner, { postId: { $in: postIds } }] }),
        SocialBookmark.deleteMany({ $or: [byOwner, { postId: { $in: postIds } }] }),
        SocialBlock.deleteMany({ $or: [{ blockerId: { $in: ids } }, { blockedId: { $in: ids } }] }),
        SocialFollow.deleteMany({ $or: [{ followerId: { $in: ids } }, { followingId: { $in: ids } }] }),
        SocialFollowRequest.deleteMany({ $or: [{ requesterId: { $in: ids } }, { recipientId: { $in: ids } }] }),
        SocialNotification.deleteMany({ $or: [{ ownerId: { $in: ids } }, { actorId: { $in: ids } }] }),
        SocialReport.deleteMany({ reporterId: { $in: ids } }),
        SocialStory.deleteMany({ ownerId: { $in: ids } }),
        SocialPost.deleteMany(byOwner),
        SocialProfile.deleteMany({ userId: { $in: ids } }),
        Conversation.deleteMany({ memberIds: { $in: ids } }),
        Session.deleteMany({ userId: { $in: ids } }),
        Permission.deleteMany({ userId: { $in: ids } }),
        Profile.deleteMany({ userId: { $in: ids } }),
        User.deleteMany({ _id: { $in: ids } }),
      ]);
    }
  }
});
