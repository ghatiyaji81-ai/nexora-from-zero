# NEXORA architecture

## Foundation boundaries

- `src/app/` owns route composition, metadata, and the global stylesheet.
- `src/components/` contains the shared shell and the first interactive workspace components.
- `src/lib/` contains small domain-neutral definitions shared by the UI.
- `public/` contains only original static assets for this application.
- `src/lib/server/` owns MongoDB connection management, request validation, password hashing, sessions, throttling, recovery email delivery, and Connect membership checks. These modules use a server-only boundary and are called from Server Components and Node.js Route Handlers.
- `src/models/` contains MongoDB schemas and named indexes for users, profiles, sessions, permissions, reset tokens, rate-limit buckets, Connect conversations, messages, presence, and typing state. Production indexes are created with `npm run db:create-indexes`; the command only creates declared indexes.
- Account creation, password reset, and message/conversation updates use MongoDB transactions where atomicity is required. Configure MongoDB as a replica set, including for a local development database.
- Password recovery is implemented through Resend and requires `RESEND_API_KEY`, `EMAIL_FROM`, and `APP_ORIGIN`. The UI and API report when email delivery is not configured.
- CONNECT stores messages in MongoDB and attachments in a private GridFS bucket. Node.js Route Handlers expose paginated APIs and per-conversation SSE streams backed by MongoDB change streams. Each API and each stream event checks current conversation membership. GridFS downloads require an active message or group-avatar reference and current membership.
- Presence and typing are short-lived MongoDB records with TTL indexes. Rate budgets reuse the existing database-backed, HMAC-keyed rate-limit collection. SSE requires a MongoDB replica set and a Node.js hosting runtime that keeps streaming responses open.

## First vertical slice

The foundation UI provides a responsive navigation shell, a keyboard-accessible command palette, a persisted light/dark preference, and a focus timer with start, pause, reset, and completion states. The timer stores no focus history. Account, profile, session, permission, and recovery-token data is stored in MongoDB.

## CONNECT vertical slice

The Connect route provides direct and group conversations, history pagination, receipts, typing and online indicators, search, replies, reaction toggles, bounded sender edits/deletes, private image/video/document uploads, voice message recording/playback, a media gallery, group profile settings, member invitations, admin assignment, and group exit. The browser uses authenticated `EventSource` and `XMLHttpRequest` for stream updates and upload progress. Messages never rely on in-process persistence.

## Planned service boundaries

Later work will introduce object-storage metadata, additional permission-checked module APIs, and provider adapters. Redis, queues, and WebSockets will be added only for features that need them. Project analysis will execute untrusted source only in a separately isolated worker environment; the web process will not run uploaded code.

## Product sequence

1. Foundation, authentication, and MongoDB ownership boundary — complete.
2. CONNECT vertical slice — implemented; integration and production verification in progress.
3. THINK and SPEAK vertical slices.
4. SOCIAL, CREATE, and PRODUCTIVITY workflows.
5. BUILD and isolated project intelligence.
6. DISCOVER, integrations, and production hardening.

Each feature becomes visible as available only after its behavior and error states exist.
