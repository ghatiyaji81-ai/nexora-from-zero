# NEXORA SOCIAL

SOCIAL is an authenticated, MongoDB-backed social workspace. The current implemented release provides account profiles and visibility settings, public-profile search, follow requests for private accounts, a paginated text feed, post reactions and comments, bookmarks, expiring text stories, blocks, user-submitted reports, and notifications. It reuses NEXORA authentication and does not create a second messaging system.

## Run and database setup

Use the same application and MongoDB configuration as the rest of NEXORA:

```powershell
npm run typecheck
npm test
npm run db:create-indexes
npm run dev
```

The index command creates indexes for all registered application models, including SOCIAL. Follow relationships are only established after accepting a private-account request. All write APIs require the current session and same-origin request validation; SOCIAL never accepts a client-supplied owner ID. Stories are filtered by `expiresAt > now` on reads in addition to MongoDB TTL cleanup.

## API surface

- `GET/PATCH /api/social/profile`: own profile and privacy settings.
- `GET /api/social/users?q=...` and `GET /api/social/users/:username`: public discovery and privacy-aware profile reads.
- `POST/DELETE /api/social/follows/:userId`, `GET/PATCH /api/social/follow-requests`: follow and request lifecycle.
- `GET/POST /api/social/posts`, `PATCH/DELETE /api/social/posts/:postId`: feed and owned-post management.
- `POST/DELETE /api/social/posts/:postId/like`, `/bookmark`; `GET/POST /api/social/posts/:postId/comments`.
- `GET/POST /api/social/stories`, `DELETE /api/social/stories/:storyId`: text stories with a 24-hour lifetime.
- `GET/POST/DELETE /api/social/blocks/:userId`, `POST /api/social/reports`, and `GET/PATCH /api/social/notifications`.
- `GET /api/social/bookmarks`: the signed-in user's visible saved posts.

The workspace UI is at `/social`. API responses are private and non-cacheable. Unauthenticated users are directed to sign in.
Blocking also hides the blocked account's direct CONNECT conversation, prevents opening or creating that direct thread, and prevents direct messages from being sent. Shared group conversations are not disabled by a one-to-one block.

## Current boundaries

This release is intentionally not presented as the full requested social platform. Posts and stories are text-only; there are no media uploads, realtime feeds, voice/video calls, channels, groups, or communities. There is no moderation console or appeals workflow, and reports are accepted into a private moderation queue without claiming human review. AI assistance and voice commands are not integrated in SOCIAL; use THINK and SPEAK directly. Notifications are stored in the database and shown in the SOCIAL workspace, but there is no realtime delivery.

Unit tests cover the pure feed-visibility and story-expiration rules. `tests/social-workflow.test.ts` exercises cross-account privacy, interactions, reporting, story expiry, and CONNECT block enforcement against MongoDB. Running that workflow and MongoDB index creation requires a reachable replica set; this environment's configured cluster had no primary during this implementation.
