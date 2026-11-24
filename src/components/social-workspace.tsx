'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';

type Profile = { id: string; username: string; displayName: string; bio: string; visibility: 'public' | 'private'; followersCount: number; followingCount: number };
type Post = {
  id: string; author: { id: string; username: string; displayName: string } | null; body: string;
  audience: 'public' | 'followers'; commentsEnabled: boolean; likeCount: number; commentCount: number;
  liked: boolean; bookmarked: boolean; createdAt: string; pinned?: boolean;
};
type Story = { id: string; body: string; expiresAt: string; author: { username: string; displayName: string } };
type UserResult = { id: string; username: string; displayName: string; bio: string; following: boolean; requestPending: boolean };
type Comment = { id: string; body: string; author: { username: string; displayName: string } | null; createdAt: string };
type Notification = { id: string; type: string; readAt: string | null; actor: { username: string; displayName: string } };

export function SocialWorkspace({ displayName }: { displayName: string }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [mode, setMode] = useState<'following' | 'latest' | 'saved'>('following');
  const [body, setBody] = useState('');
  const [storyBody, setStoryBody] = useState('');
  const [audience, setAudience] = useState<'public' | 'followers'>('public');
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<UserResult[]>([]);
  const [requests, setRequests] = useState<{ id: string; user: UserResult }[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [reportReason, setReportReason] = useState<'spam' | 'harassment' | 'hate' | 'violence' | 'privacy' | 'other'>('spam');
  const [openComments, setOpenComments] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentBody, setCommentBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const api = useCallback(async (url: string, init?: RequestInit) => {
    const response = await fetch(url, { ...init, headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers } });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error ?? `Request failed (${response.status}).`);
    return data;
  }, []);

  const loadFeed = useCallback(async (nextMode = mode) => {
    const data = nextMode === 'saved'
      ? await api('/api/social/bookmarks')
      : await api(`/api/social/posts?mode=${nextMode}`);
    setPosts(data.posts ?? []);
  }, [api, mode]);

  const loadStories = useCallback(async () => {
    const data = await api('/api/social/stories');
    setStories(data.stories ?? []);
  }, [api]);

  const loadRequests = useCallback(async () => {
    const data = await api('/api/social/follow-requests');
    setRequests(data.requests ?? []);
  }, [api]);

  const loadNotifications = useCallback(async () => {
    const data = await api('/api/social/notifications');
    setNotifications(data.notifications ?? []);
    setUnreadCount(data.unreadCount ?? 0);
  }, [api]);

  useEffect(() => {
    let active = true;
    Promise.all([api('/api/social/profile'), api('/api/social/posts?mode=following'), api('/api/social/stories'), api('/api/social/follow-requests'), api('/api/social/notifications')])
      .then(([own, feed, storyData, requestData, noticeData]) => {
        if (!active) return;
        setProfile(own.profile);
        setPosts(feed.posts ?? []);
        setStories(storyData.stories ?? []);
        setRequests(requestData.requests ?? []);
        setNotifications(noticeData.notifications ?? []);
        setUnreadCount(noticeData.unreadCount ?? 0);
      })
      .catch(value => { if (active) setError(value instanceof Error ? value.message : 'SOCIAL could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api]);

  async function run(action: () => Promise<void>, success?: string) {
    setBusy(true); setError(''); setNotice('');
    try { await action(); if (success) setNotice(success); }
    catch (value) { setError(value instanceof Error ? value.message : 'The action could not be completed.'); }
    finally { setBusy(false); }
  }

  async function createPost(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    await run(async () => {
      await api('/api/social/posts', { method: 'POST', body: JSON.stringify({ body, audience }) });
      setBody('');
      setMode('following');
      await loadFeed('following');
    }, 'Your post is live.');
  }

  async function createStory(event: FormEvent) {
    event.preventDefault();
    if (!storyBody.trim()) return;
    await run(async () => {
      await api('/api/social/stories', { method: 'POST', body: JSON.stringify({ body: storyBody, audience: 'followers' }) });
      setStoryBody('');
      await loadStories();
    }, 'Story added. It expires in 24 hours.');
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    if (query.trim().length < 2) { setUsers([]); return; }
    await run(async () => setUsers((await api(`/api/social/users?q=${encodeURIComponent(query.trim())}`)).users ?? []));
  }

  async function toggleFollow(user: UserResult) {
    await run(async () => {
      const result = await api(`/api/social/follows/${user.id}`, { method: 'POST', body: JSON.stringify({ action: user.following || user.requestPending ? 'unfollow' : 'follow' }) });
      setUsers(items => items.map(item => item.id === user.id ? { ...item, following: result.status === 'following', requestPending: result.status === 'requested' } : item));
    });
  }

  async function toggleLike(post: Post) {
    await run(async () => {
      const result = await api(`/api/social/posts/${post.id}/like`, { method: post.liked ? 'DELETE' : 'POST' });
      setPosts(items => items.map(item => item.id === post.id ? { ...item, liked: result.liked, likeCount: result.likeCount } : item));
    });
  }

  async function toggleBookmark(post: Post) {
    await run(async () => {
      const result = await api(`/api/social/posts/${post.id}/bookmark`, { method: post.bookmarked ? 'DELETE' : 'POST' });
      if (mode === 'saved' && !result.bookmarked) setPosts(items => items.filter(item => item.id !== post.id));
      else setPosts(items => items.map(item => item.id === post.id ? { ...item, bookmarked: result.bookmarked } : item));
    });
  }

  async function blockUser(userId: string) {
    await run(async () => {
      await api(`/api/social/blocks/${userId}`, { method: 'POST', body: JSON.stringify({ blocked: true }) });
      setUsers(items => items.filter(item => item.id !== userId));
      setPosts(items => items.filter(item => item.author?.id !== userId));
    }, 'Account blocked. Their content and follow relationship are removed from your SOCIAL view.');
  }

  async function reportItem(targetType: 'profile' | 'post', targetId: string) {
    await run(async () => {
      await api('/api/social/reports', { method: 'POST', body: JSON.stringify({ targetType, targetId, reason: reportReason }) });
    }, 'Report submitted for review.');
  }

  async function showComments(post: Post) {
    const next = openComments === post.id ? null : post.id;
    setOpenComments(next);
    if (!next) return;
    await run(async () => setComments((await api(`/api/social/posts/${post.id}/comments`)).comments ?? []));
  }

  async function addComment(event: FormEvent) {
    event.preventDefault();
    if (!openComments || !commentBody.trim()) return;
    await run(async () => {
      const response = await api(`/api/social/posts/${openComments}/comments`, { method: 'POST', body: JSON.stringify({ body: commentBody }) });
      setComments(items => [...items, { ...response.comment, author: { username: profile?.username ?? 'you', displayName: profile?.displayName ?? displayName } }]);
      setCommentBody('');
      setPosts(items => items.map(item => item.id === openComments ? { ...item, commentCount: item.commentCount + 1 } : item));
    });
  }

  return (
    <main className="social-page">
      <header className="social-hero">
        <div><p className="eyebrow">YOUR PUBLIC SQUARE, ON YOUR TERMS</p><h1>Make room for <em>connection.</em></h1>
          <p>Share what you’re making, meet people with shared interests, and decide who gets to see what.</p></div>
        <div className="social-profile-summary"><span className="social-avatar">{(profile?.displayName ?? displayName).slice(0, 1).toUpperCase()}</span>
          <div><strong>{profile?.displayName ?? displayName}</strong><small>@{profile?.username ?? 'loading'}</small></div>
          <div className="social-stat"><strong>{profile?.followersCount ?? 0}</strong><small>followers</small></div>
        </div>
      </header>

      {error && <div className="social-feedback social-error" role="alert">{error}<button type="button" onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
      {notice && <div className="social-feedback" role="status">{notice}<button type="button" onClick={() => setNotice('')} aria-label="Dismiss message">×</button></div>}
      <div className="social-layout">
        <section className="social-main">
          <form className="social-compose social-card" onSubmit={createPost}>
            <label htmlFor="social-post">What’s on your mind, {profile?.displayName?.split(' ')[0] ?? displayName.split(' ')[0]}?</label>
            <textarea id="social-post" maxLength={5000} value={body} onChange={event => setBody(event.target.value)} placeholder="Share an idea, a moment, or something you’re working on…" />
            <div className="social-compose-footer"><label>Audience <select value={audience} onChange={event => setAudience(event.target.value as 'public' | 'followers')}><option value="public">Everyone</option><option value="followers">Followers</option></select></label>
              <span>{body.length}/5000</span><button className="social-primary" disabled={busy || !body.trim()} type="submit">Share post</button></div>
          </form>

          <section className="social-stories social-card" aria-labelledby="stories-title">
            <div className="social-section-head"><div><p className="eyebrow">THE NEXT 24 HOURS</p><h2 id="stories-title">Stories</h2></div><span className="social-subtle">{stories.length} live</span></div>
            <div className="social-story-row">
              <details className="social-add-story-popover">
                <summary className="social-story-circle add-story" title="Add a story">
                  <span className="social-story-ring add-ring">
                    <span className="social-story-avatar">＋</span>
                  </span>
                  <span className="social-story-label">Your story</span>
                </summary>
                <form className="social-story-form-popover" onSubmit={createStory}>
                  <input aria-label="Write a story" maxLength={500} value={storyBody} onChange={event => setStoryBody(event.target.value)} placeholder="Add a short text story…" autoFocus />
                  <button type="submit" disabled={busy || !storyBody.trim()}>Add</button>
                </form>
              </details>
              {stories.map(story => (
                <div key={story.id} className="social-story-circle" title={`${story.author.displayName}: ${story.body} (Expires ${new Date(story.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })})`}>
                  <span className="social-story-ring gradient-ring">
                    <span className="social-story-avatar">{story.author.displayName.slice(0, 1).toUpperCase()}</span>
                  </span>
                  <span className="social-story-label">{story.author.displayName.split(' ')[0]}</span>
                </div>
              ))}
            </div>
            {stories.length ? (
              <div className="social-story-list">
                {stories.map(story => (
                  <article key={story.id}>
                    <strong>{story.author.displayName}</strong>
                    <p>{story.body}</p>
                    <small>Expires {new Date(story.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small>
                  </article>
                ))}
              </div>
            ) : (
              <p className="social-empty-inline">No active stories yet. Share a small moment with your followers.</p>
            )}
          </section>

          <div className="social-feed-head"><div><p className="eyebrow">YOUR COMMUNITY</p><h2>{mode === 'saved' ? 'Saved posts' : 'The feed'}</h2></div>
            <div className="social-tabs" role="group" aria-label="Feed view">
              {(['following', 'latest', 'saved'] as const).map(item => <button key={item} type="button" className={mode === item ? 'active' : ''} onClick={() => { setMode(item); void run(() => loadFeed(item)); }}>{item === 'following' ? 'Following' : item === 'latest' ? 'Latest' : 'Saved'}</button>)}
            </div>
          </div>
          {loading ? <div className="social-card social-empty">Loading your community…</div> : posts.length ? posts.map(post => (
            <article className="social-post social-card" key={post.id}>
              <div className="social-post-author"><span className="social-avatar small">{post.author?.displayName.slice(0, 1).toUpperCase() ?? '?'}</span><div><strong>{post.author?.displayName ?? 'NEXORA member'}</strong><small>@{post.author?.username ?? 'member'} · {new Date(post.createdAt).toLocaleString()}</small></div><span className="social-audience">{post.audience === 'public' ? 'Public' : 'Followers'}</span></div>
              <p className="social-post-body">{post.body}</p>
              <div className="social-post-actions"><button type="button" aria-pressed={post.liked} onClick={() => void toggleLike(post)}>{post.liked ? '♥' : '♡'} <span>{post.likeCount}</span></button>
                {post.commentsEnabled && <button type="button" onClick={() => void showComments(post)}>◌ <span>{post.commentCount} comments</span></button>}
                <button type="button" aria-pressed={post.bookmarked} onClick={() => void toggleBookmark(post)}>{post.bookmarked ? 'Saved' : 'Save'}</button>
                {post.author?.username === profile?.username && <button type="button" onClick={() => void run(async () => { await api(`/api/social/posts/${post.id}`, { method: 'DELETE' }); setPosts(items => items.filter(item => item.id !== post.id)); }, 'Post deleted.')}>Delete</button>}
                {post.author?.username !== profile?.username && <button type="button" onClick={() => void reportItem('post', post.id)}>Report</button>}
              </div>
              {openComments === post.id && <div className="social-comments">{comments.map(comment => <p key={comment.id}><strong>{comment.author?.displayName ?? 'Member'}</strong> {comment.body}</p>)}<form onSubmit={addComment}><input aria-label="Write a comment" maxLength={2000} value={commentBody} onChange={event => setCommentBody(event.target.value)} placeholder="Write a comment…" /><button type="submit" disabled={busy || !commentBody.trim()}>Send</button></form></div>}
            </article>
          )) : <div className="social-card social-empty"><strong>{mode === 'saved' ? 'Nothing saved yet' : 'Your feed is ready for its first post'}</strong><p>{mode === 'saved' ? 'Save posts to come back to them later.' : 'Share something above or find people to follow.'}</p></div>}
        </section>

        <aside className="social-aside">
          <section className="social-card social-discover"><p className="eyebrow">FIND YOUR PEOPLE</p><h2>Discover members</h2><form onSubmit={search}><input aria-label="Search members" value={query} onChange={event => setQuery(event.target.value)} placeholder="Name or username" /><button type="submit" disabled={busy}>Search</button></form>
            <div className="social-user-results">{users.map(user => <article key={user.id}><div><strong>{user.displayName}</strong><small>@{user.username}</small></div><button type="button" onClick={() => void toggleFollow(user)}>{user.following ? 'Following' : user.requestPending ? 'Requested' : 'Follow'}</button><button type="button" aria-label={`Block ${user.displayName}`} onClick={() => void blockUser(user.id)}>Block</button><button type="button" aria-label={`Report ${user.displayName}`} onClick={() => void reportItem('profile', user.id)}>Report</button></article>)}</div>
            {query.length >= 2 && !users.length && <p className="social-empty-inline">No public profiles match that search.</p>}
          </section>
          <section className="social-card social-requests"><div className="social-section-head"><div><p className="eyebrow">YOUR PRIVACY</p><h2>Follow requests</h2></div><span className="social-count">{requests.length}</span></div>
            {requests.length ? requests.map(request => <article key={request.id}><div><strong>{request.user.displayName}</strong><small>@{request.user.username}</small></div><button type="button" onClick={() => void run(async () => { await api('/api/social/follow-requests', { method: 'PATCH', body: JSON.stringify({ requestId: request.id, action: 'accept' }) }); await loadRequests(); }, 'Follow request accepted.')}>Accept</button><button type="button" onClick={() => void run(async () => { await api('/api/social/follow-requests', { method: 'PATCH', body: JSON.stringify({ requestId: request.id, action: 'reject' }) }); await loadRequests(); }, 'Follow request declined.')}>Decline</button></article>) : <p className="social-empty-inline">No pending requests.</p>}
          </section>
          <section className="social-card social-privacy"><p className="eyebrow">YOUR SPACE</p><h2>Privacy controls</h2><p>Your profile is <strong>{profile?.visibility ?? '…'}</strong>. Private profiles approve every follower request.</p><button type="button" disabled={busy || !profile} onClick={() => void run(async () => {
            const updated = await api('/api/social/profile', { method: 'PATCH', body: JSON.stringify({ username: profile!.username, displayName: profile!.displayName, bio: profile!.bio ?? '', visibility: profile!.visibility === 'public' ? 'private' : 'public' }) });
            setProfile(updated.profile);
          }, 'Profile visibility updated.')}>Make {profile?.visibility === 'public' ? 'private' : 'public'}</button>
        </section>
          <section className="social-card social-requests"><div className="social-section-head"><div><p className="eyebrow">ACCOUNT ACTIVITY</p><h2>Notifications</h2></div><span className="social-count">{unreadCount}</span></div>
            {unreadCount > 0 && <button className="social-mark-read" type="button" onClick={() => void run(async () => { await api('/api/social/notifications', { method: 'PATCH', body: JSON.stringify({}) }); await loadNotifications(); }, 'Notifications marked as read.')}>Mark all read</button>}
            {notifications.slice(0, 6).map(item => <p className="social-notification" key={item.id}><strong>{item.actor.displayName}</strong> {item.type.replaceAll('_', ' ')}</p>)}
            {!notifications.length && <p className="social-empty-inline">Nothing new right now.</p>}
          </section>
          <section className="social-card social-privacy"><p className="eyebrow">SAFETY</p><h2>Report content</h2><p>Choose the closest reason before reporting a profile or post.</p><select aria-label="Report reason" value={reportReason} onChange={event => setReportReason(event.target.value as typeof reportReason)}><option value="spam">Spam</option><option value="harassment">Harassment</option><option value="hate">Hate</option><option value="violence">Violence</option><option value="privacy">Privacy</option><option value="other">Other</option></select></section>
        </aside>
      </div>
    </main>
  );
}
