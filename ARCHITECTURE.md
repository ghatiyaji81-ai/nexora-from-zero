# NEXORA architecture

## Foundation boundaries

- `src/app/` owns route composition, metadata, and the global stylesheet.
- `src/components/` contains the shared shell and the first interactive workspace components.
- `src/lib/` contains small domain-neutral definitions shared by the UI.
- `public/` contains only original static assets for this application.
- `src/lib/server/` owns MongoDB connection management, request validation, password hashing, sessions, throttling, recovery email delivery, Connect membership checks, THINK provider adapters, and document extraction. Provider credentials and adapters use a server-only boundary.
- `src/models/` contains MongoDB schemas and named indexes for users, profiles, sessions, permissions, reset tokens, rate-limit buckets, Connect data, and THINK conversations, messages, preferences, and documents. Production indexes are created with `npm run db:create-indexes`; the command only creates declared indexes.
- Account creation, password reset, and message/conversation updates use MongoDB transactions where atomicity is required. Configure MongoDB as a replica set, including for a local development database.
- Password recovery is implemented through Resend and requires `RESEND_API_KEY`, `EMAIL_FROM`, and `APP_ORIGIN`. The UI and API report when email delivery is not configured.
- CONNECT stores messages in MongoDB and attachments in a private GridFS bucket. Node.js Route Handlers expose paginated APIs and per-conversation SSE streams backed by MongoDB change streams. Each API and each stream event checks current conversation membership. GridFS downloads require an active message or group-avatar reference and current membership.
- Presence and typing are short-lived MongoDB records with TTL indexes. Rate budgets reuse the existing database-backed, HMAC-keyed rate-limit collection. SSE requires a MongoDB replica set and a Node.js hosting runtime that keeps streaming responses open.
- THINK conversations, messages, preferences, and extracted document text are owner-scoped in MongoDB. Original document files use a private GridFS bucket with server-side downloads unavailable to other accounts. Uploads are limited to PDF, DOCX, and UTF-8 TXT files up to 15 MB. The dependency-free extractor reads DOCX text, plain text, and PDFs with accessible text streams; scanned PDFs and some compressed/object-stream PDF variants are explicitly unsupported.
- `AIProviderAdapter` currently has one real implementation: OpenAI Responses API streaming. `OPENAI_API_KEY` is read only by the server; `THINK_OPENAI_MODEL(S)` limits models offered by the UI. `THINK_ENABLE_WEB_SEARCH=true` opts the Research agent into OpenAI's hosted, read-only web search. The provider uses `store:false`; selected document text still leaves the application to the chosen provider when sent for an answer.
- Agent profiles are persistent, selectable server-side instruction sets. Research can use the configured provider's web search, attached documents are sent as untrusted source material, and the Coding agent does not execute uploaded code. No sensitive side-effect tools are available; new tools must add explicit user approval before they can act outside a response.

## First vertical slice

The foundation UI provides a responsive navigation shell, a keyboard-accessible command palette, a persisted light/dark preference, and a focus timer with start, pause, reset, and completion states. The timer stores no focus history. Account, profile, session, permission, and recovery-token data is stored in MongoDB.

## CONNECT vertical slice

The Connect route provides direct and group conversations, history pagination, receipts, typing and online indicators, search, replies, reaction toggles, bounded sender edits/deletes, private image/video/document uploads, voice message recording/playback, a media gallery, group profile settings, member invitations, admin assignment, and group exit. The browser uses authenticated `EventSource` and `XMLHttpRequest` for stream updates and upload progress. Messages never rely on in-process persistence.

## THINK vertical slice

The Think route requires authentication and uses MongoDB to persist conversations, message history, model/agent preferences, and document metadata and extracted text. Its OpenAI adapter requests the Responses API with streaming enabled and provider storage disabled, then forwards deltas to the browser over server-sent events. Conversation, message, and document APIs enforce account ownership. TXT, DOCX, and text-layer PDF files are extracted locally and uploaded to a private GridFS bucket; attached text is sent to OpenAI only when the user sends a message. Model ids are configured on the server. The UI supports conversation search, pagination, rename, pin, archive, delete, edit-and-regenerate, continuation, citations, and responsive chat composition.

## Planned service boundaries

Later work will add additional provider adapters, mature PDF/document retrieval with page-level references, richer structured/tool workflows, and explicit approval gates for any sensitive actions. Redis, queues, and WebSockets will be added only for features that need them. Project analysis will execute untrusted source only in a separately isolated worker environment; the web process will not run uploaded code.

## Product sequence

1. Foundation, authentication, and MongoDB ownership boundary — complete.
2. CONNECT vertical slice — implemented; integration and production verification in progress.
3. THINK — initial provider-backed vertical slice implemented; provider credentials and broader tools remain configurable follow-up. SPEAK remains planned.
4. SOCIAL, CREATE, and PRODUCTIVITY workflows.
5. BUILD and isolated project intelligence.
6. DISCOVER, integrations, and production hardening.

Each feature becomes visible as available only after its behavior and error states exist.
