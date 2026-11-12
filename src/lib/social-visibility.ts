export function canShowSocialPost(input: {
  viewerId: string;
  ownerId: string;
  authorVisibility: 'public' | 'private';
  audience: 'public' | 'followers';
  isFollowing: boolean;
  isBlocked: boolean;
  isActive: boolean;
  feed: 'following' | 'latest';
}) {
  if (!input.isActive || input.isBlocked) return false;
  if (input.viewerId === input.ownerId) return true;
  if (input.feed === 'following' && !input.isFollowing) return false;
  if (input.authorVisibility === 'private' && !input.isFollowing) return false;
  return input.audience === 'public' || input.isFollowing;
}

export function isSocialStoryActive(expiresAt: Date, now = new Date()) {
  return expiresAt.getTime() > now.getTime();
}
