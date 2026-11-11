# NEXORA architecture

## Foundation boundaries

- `src/app/` owns route composition, metadata, and the global stylesheet.
- `src/components/` contains the shared shell and the first interactive workspace components.
- `src/lib/` contains small domain-neutral definitions shared by the UI.
- `public/` contains only original static assets for this application.
- `src/lib/server/` owns MongoDB connection management, request validation, password hashing, sessions, throttling, and recovery email delivery. These modules use a server-only boundary and are called from Server Components and Node.js Route Handlers.
- `src/models/` contains MongoDB schemas and named indexes for users, profiles, sessions, permissions, reset tokens, and rate-limit buckets. Production indexes are created with `npm run db:create-indexes`; the command only creates declared indexes.
- Account creation and password reset use MongoDB transactions. Configure MongoDB as a replica set, including for a local development database.
- Password recovery is implemented through Resend and requires `RESEND_API_KEY`, `EMAIL_FROM`, and `APP_ORIGIN`. The UI and API report when email delivery is not configured.

## First vertical slice

The foundation UI provides a responsive navigation shell, a keyboard-accessible command palette, a persisted light/dark preference, and a focus timer with start, pause, reset, and completion states. The timer stores no focus history. Account, profile, session, permission, and recovery-token data is stored in MongoDB.

## Planned service boundaries

Later work will introduce object-storage metadata, additional permission-checked module APIs, and provider adapters. Redis, queues, and WebSockets will be added only for features that need them. Project analysis will execute untrusted source only in a separately isolated worker environment; the web process will not run uploaded code.

## Product sequence

1. Foundation, authentication, and MongoDB ownership boundary — in progress.
2. CONNECT, THINK, and SPEAK vertical slices.
3. SOCIAL, CREATE, and PRODUCTIVITY workflows.
4. BUILD and isolated project intelligence.
5. DISCOVER and approved integrations.
6. Security, accessibility, performance, and release verification.

Each feature becomes visible as available only after its behavior and error states exist.
