# NEXORA architecture

## Foundation boundaries

- `src/app/` owns route composition, metadata, and the global stylesheet.
- `src/components/` contains the shared shell and the first interactive workspace components.
- `src/lib/` contains small domain-neutral definitions shared by the UI.
- `public/` contains only original static assets for this application.
- `src/lib/server/` owns MongoDB connection management, request validation, password hashing, sessions, throttling, recovery email delivery, Connect membership checks, THINK provider adapters, document extraction, and the SPEAK cloud-voice adapter boundary. Provider credentials and adapters use a server-only boundary.
- `src/models/` contains MongoDB schemas and named indexes for users, profiles, sessions, permissions, reset tokens, rate-limit buckets, Connect data, THINK conversations, messages, preferences, and documents, and SPEAK recording metadata. Production indexes are created with `npm run db:create-indexes`; the command only creates declared indexes.
- Account creation, password reset, and message/conversation updates use MongoDB transactions where atomicity is required. Configure MongoDB as a replica set, including for a local development database.
- Password recovery is implemented through Resend and requires `RESEND_API_KEY`, `EMAIL_FROM`, and `APP_ORIGIN`. The UI and API report when email delivery is not configured.
- CONNECT stores messages in MongoDB and attachments in a private GridFS bucket. Node.js Route Handlers expose paginated APIs and per-conversation SSE streams backed by MongoDB change streams. Each API and each stream event checks current conversation membership. GridFS downloads require an active message or group-avatar reference and current membership.
- Presence and typing are short-lived MongoDB records with TTL indexes. Rate budgets reuse the existing database-backed, HMAC-keyed rate-limit collection. SSE requires a MongoDB replica set and a Node.js hosting runtime that keeps streaming responses open.
- THINK conversations, messages, preferences, and extracted document text are owner-scoped in MongoDB. Original document files use a private GridFS bucket with server-side downloads unavailable to other accounts. Uploads are limited to PDF, DOCX, and UTF-8 TXT files up to 15 MB. The dependency-free extractor reads DOCX text, plain text, and PDFs with accessible text streams; scanned PDFs and some compressed/object-stream PDF variants are explicitly unsupported.
- `AIProviderAdapter` currently has one real implementation: OpenAI Responses API streaming. `OPENAI_API_KEY` is read only by the server; `THINK_OPENAI_MODEL(S)` limits models offered by the UI. `THINK_ENABLE_WEB_SEARCH=true` opts the Research agent into OpenAI's hosted, read-only web search. The provider uses `store:false`; selected document text still leaves the application to the chosen provider when sent for an answer. `THINK_OPENAI_MODELS` and `THINK_OPENAI_MODEL` are treated as absent when set to an empty string; the fallback order is `THINK_OPENAI_MODELS` → `THINK_OPENAI_MODEL` → `gpt-4.1-mini`.
- Agent profiles are persistent, selectable server-side instruction sets. Research can use the configured provider's web search, attached documents are sent as untrusted source material, and the Coding agent does not execute uploaded code. No sensitive side-effect tools are available; new tools must add explicit user approval before they can act outside a response.
- SPEAK is an authenticated browser-native voice workspace that uses the existing THINK conversation and streaming APIs. Speech recognition and speech synthesis use browser APIs only and require no voice-provider credentials; recognition support and privacy behavior vary by browser, which may send speech to its configured speech service. The browser does not upload microphone recordings unless the user chooses Save recording. Saved audio uses owner-scoped MongoDB metadata and the private `speak_recordings` GridFS bucket, is limited to 10 MB, and can be associated with an owned THINK conversation. Audio playback and deletion re-check the recording owner. No cloud speech-to-text, realtime voice, or generated-audio provider is configured; `SpeakProviderAdapter` defines the future server-side extension boundary only.

## Security controls

All API routes that mutate state verify `Origin` matches `APP_ORIGIN` before processing the request body. Session cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` in production. Rate-limit buckets are HMAC-keyed with `AUTH_RATE_LIMIT_SECRET` (minimum 32 characters). File uploads validate MIME type signatures in addition to `Content-Type` headers. All GridFS downloads re-verify the authenticated user's `ownerId` against the file's stored metadata before streaming. Error responses omit internal stack traces and provider details. All pages and API responses include `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, and a `Content-Security-Policy` restricting script, style, and media sources to `self`.

## MongoDB replica set setup (required)

MongoDB must run as a replica set even for local development because account creation uses transactions and CONNECT change streams require oplog access.

```powershell
# 1. Create a user-writable data and log directory
New-Item -ItemType Directory -Path "$env:USERPROFILE\mongod-rs0\data" -Force

# 2. Write a config (adjust path to your mongod.exe version)
@"
storage:
  dbPath: $env:USERPROFILE\mongod-rs0\data
systemLog:
  destination: file
  logAppend: true
  path: $env:USERPROFILE\mongod-rs0\mongod.log
net:
  port: 27017
  bindIp: 127.0.0.1
replication:
  replSetName: rs0
"@ | Set-Content "$env:USERPROFILE\mongod-rs0.cfg"

# 3. Start mongod (run once; add to startup or run as a background task)
Start-Process -FilePath "C:\Program Files\MongoDB\Server\8.3\bin\mongod.exe" `
  -ArgumentList "--config","$env:USERPROFILE\mongod-rs0.cfg" -WindowStyle Hidden

# 4. Initiate the replica set (run once after first start)
& "C:\Program Files\mongosh\mongosh.exe" --port 27017 --eval `
  "rs.initiate({_id:'rs0',members:[{_id:0,host:'127.0.0.1:27017'}]})" --norc

# 5. Create database indexes (run once and after adding new models)
npm run db:create-indexes
```

## Running tests

### Unit tests (no server or database needed)

```powershell
npm test
# or directly:
node --conditions=react-server --import tsx --test `
  tests/auth-security.test.ts tests/think-documents.test.ts `
  tests/speak-audio.test.ts tests/think-provider.test.ts
```

### Integration tests (requires MongoDB rs0 + Next.js dev server)

Integration tests make real HTTP calls and require:

1. MongoDB running as `rs0` on port 27017 (see replica set setup above).
2. A Next.js **dev** server on port 3001 with `APP_ORIGIN` temporarily set to `http://127.0.0.1:3001` in `.env.local`.
3. `AUTH_RATE_LIMIT_SECRET` set to a 32+ character value in `.env.local`.

```powershell
# Step 1 — temporarily set APP_ORIGIN in .env.local to match the test server:
#   APP_ORIGIN=http://127.0.0.1:3001

# Step 2 — start the dev server for integration tests (Terminal 1):
npx next dev --port 3001 --webpack

# Step 3 — run integration tests (Terminal 2):
$env:NEXORA_TEST_ORIGIN = "http://127.0.0.1:3001"
$env:MONGODB_URI        = "mongodb://127.0.0.1:27017/nexora?replicaSet=rs0"
$env:AUTH_RATE_LIMIT_SECRET = "your-secret-here"
$env:APP_ORIGIN         = "http://127.0.0.1:3001"
node --conditions=react-server --import tsx --test --test-concurrency=1 `
  tests/auth-workflow.test.ts tests/connect-workflow.test.ts `
  tests/think-workflow.test.ts tests/speak-workflow.test.ts

# Step 4 — restore APP_ORIGIN=http://localhost:3000 in .env.local after tests.
```

## First vertical slice

The foundation UI provides a responsive navigation shell, a keyboard-accessible command palette, a persisted light/dark preference, and a focus timer with start, pause, reset, and completion states. The timer stores no focus history. Account, profile, session, permission, and recovery-token data is stored in MongoDB.

## CONNECT vertical slice

The Connect route provides direct and group conversations, history pagination, receipts, typing and online indicators, search, replies, reaction toggles, bounded sender edits/deletes, private image/video/document uploads, voice message recording/playback, a media gallery, group profile settings, member invitations, admin assignment, and group exit. The browser uses authenticated `EventSource` and `XMLHttpRequest` for stream updates and upload progress. Messages never rely on in-process persistence.

## THINK vertical slice

The Think route requires authentication and uses MongoDB to persist conversations, message history, model/agent preferences, and document metadata and extracted text. Its OpenAI adapter requests the Responses API with streaming enabled and provider storage disabled, then forwards deltas to the browser over server-sent events. Conversation, message, and document APIs enforce account ownership. TXT, DOCX, and text-layer PDF files are extracted locally and uploaded to a private GridFS bucket; attached text is sent to OpenAI only when the user sends a message. Model ids are configured on the server. The UI supports conversation search, pagination, rename, pin, archive, delete, edit-and-regenerate, continuation, citations, and responsive chat composition.

## SPEAK vertical slice

The Speak route requires authentication, obtains browser microphone permission only after a user action, and uses browser-supported speech recognition for editable dictation and speech synthesis for response playback. MediaRecorder can pause, resume, replay, discard, or explicitly save audio. Saved recordings and transcripts are private, owner-scoped, validated, stored in MongoDB plus GridFS, and can be attached to a THINK conversation. Dictated text is sent through THINK's authenticated conversation API and its existing real provider stream; no speech provider or cloud audio processing is claimed as available.

## Planned service boundaries

Later work will add additional provider adapters, mature PDF/document retrieval with page-level references, richer structured/tool workflows, and explicit approval gates for any sensitive actions. Redis, queues, and WebSockets will be added only for features that need them. Project analysis will execute untrusted source only in a separately isolated worker environment; the web process will not run uploaded code.

## Product sequence

1. Foundation, authentication, and MongoDB ownership boundary — complete.
2. CONNECT vertical slice — implemented; integration and production verification in progress.
3. THINK — initial provider-backed vertical slice implemented; provider credentials and broader tools remain configurable follow-up.
4. SPEAK — browser-native speech and owner-scoped audio storage implemented; cloud voice providers remain future work.
5. SOCIAL, CREATE, and PRODUCTIVITY workflows.
6. BUILD and isolated project intelligence.
7. DISCOVER, integrations, and production hardening.

Each feature becomes visible as available only after its behavior and error states exist.
