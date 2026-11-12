import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canShowSocialPost, isSocialStoryActive } from '../src/lib/social-visibility';

const publicLatest = {
  viewerId: 'viewer', ownerId: 'author', authorVisibility: 'public' as const,
  audience: 'public' as const, isFollowing: false, isBlocked: false, isActive: true, feed: 'latest' as const,
};

test('SOCIAL visibility hides blocked and inactive accounts', () => {
  assert.equal(canShowSocialPost({ ...publicLatest, isBlocked: true }), false);
  assert.equal(canShowSocialPost({ ...publicLatest, isActive: false }), false);
});

test('SOCIAL visibility enforces private profiles and follower-only posts', () => {
  assert.equal(canShowSocialPost({ ...publicLatest, authorVisibility: 'private' }), false);
  assert.equal(canShowSocialPost({ ...publicLatest, audience: 'followers' }), false);
  assert.equal(canShowSocialPost({ ...publicLatest, authorVisibility: 'private', isFollowing: true }), true);
  assert.equal(canShowSocialPost({ ...publicLatest, audience: 'followers', isFollowing: true }), true);
});

test('SOCIAL following feed only includes accepted follows while own posts remain visible', () => {
  assert.equal(canShowSocialPost({ ...publicLatest, feed: 'following' }), false);
  assert.equal(canShowSocialPost({ ...publicLatest, viewerId: 'viewer', ownerId: 'viewer', feed: 'following' }), true);
});

test('SOCIAL story expiry is checked against the requested read time', () => {
  const now = new Date('2026-03-01T12:00:00.000Z');
  assert.equal(isSocialStoryActive(new Date('2026-03-01T12:00:01.000Z'), now), true);
  assert.equal(isSocialStoryActive(new Date('2026-03-01T12:00:00.000Z'), now), false);
});
