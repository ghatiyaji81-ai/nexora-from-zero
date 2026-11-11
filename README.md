# NEXORA

NEXORA is a new, independent digital workspace. This repository is being built from a clean foundation; no application source from the earlier project is included.

## Current stage

The foundation includes the responsive workspace shell, keyboard command search, theme switch, and a browser-local focus timer. Authentication and account data use MongoDB, scrypt password hashing, server-side sessions, permission checks, and a single-use recovery flow. CONNECT includes private one-to-one and group conversations, MongoDB-backed history, MongoDB change-stream events over SSE, delivery/read receipts, typing/presence, replies, reactions, edits, deletion, search, private GridFS attachments, voice recording, and group member/admin controls. THINK adds private AI conversations, OpenAI Responses API streaming through a server-only adapter, model and agent preferences, searchable history, and owner-scoped document upload and extraction. SPEAK adds browser-native speech input and playback, editable transcripts, microphone recording controls, and private saved audio associated with THINK conversations. SPEAK does not currently use a cloud voice provider.

## Run locally

Requirements: Node.js 20.9 or newer, npm, and a MongoDB replica set (MongoDB Atlas or a local MongoDB server).

1. Copy `.env.example` to `.env.local`.
2. Set `MONGODB_URI` to a replica-set connection string. Transactions and MongoDB change streams require a replica set. CONNECT event streams are long-lived Node.js HTTP responses; deploy them on a runtime that supports persistent streaming connections.
3. Generate a private rate-limit key with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"` and place it in `AUTH_RATE_LIMIT_SECRET`.
4. Set `APP_ORIGIN` to the app's origin. For email recovery, also configure a verified Resend sender in `RESEND_API_KEY` and `EMAIL_FROM`.
5. Configure `OPENAI_API_KEY` on the server to enable real THINK responses. Set `THINK_OPENAI_MODEL` or `THINK_OPENAI_MODELS` to model IDs available to that provider key. `THINK_ENABLE_WEB_SEARCH=true` explicitly enables OpenAI's web search tool for the Research agent. Keys and provider request details are never returned by the settings API.
6. Run `npm run db:create-indexes` before deploying. It creates declared indexes and does not remove existing indexes.

For an installed local MongoDB server, initialize it as a single-node replica set before starting NEXORA:

```powershell
New-Item -ItemType Directory -Force .local\mongo-data
mongod --dbpath .local\mongo-data --replSet rs0 --bind_ip 127.0.0.1 --port 27017
```

In a second terminal, run `mongosh --host 127.0.0.1:27017 --eval "rs.initiate()"`, then use the sample MongoDB URI in `.env.example`.

```sh
npm install
npm run dev
```

Open `http://localhost:3000`. Use `Ctrl+K` or `⌘K` to search the available workspace actions.

## Project checks

```sh
npm run typecheck
npm test
npm run build
```

`npm run test` covers auth security, provider stream parsing/retry/error handling, document extraction, and SPEAK recording format selection, interrupted recordings, transcript handling, playback settings, and unsupported-browser fallback. `npm run test:integration` exercises signup/login, CONNECT, THINK, and SPEAK recording upload, playback, attachment, deletion, and owner isolation against MongoDB. Start a local replica set and the app first; set `MONGODB_URI`, `AUTH_RATE_LIMIT_SECRET`, `APP_ORIGIN`, and `NEXORA_TEST_ORIGIN` for the test process. It creates and removes unique test accounts and chat data. A live OpenAI request is not part of the automated test suite; configure a real server key and run a manual end-to-end request to verify provider credentials, model access, billing, and streaming in your account. Browser speech-recognition availability and privacy depend on the user's browser; SPEAK microphone recording is uploaded only after the user explicitly saves it.

Build diagnosis on this Windows environment: the initial Turbopack build failed in its CSS worker. Restricted build attempts then failed intermittently while creating route output directories such as `.next/server/app/workspace` and `.next/server/app/signup`; direct Node directory creation succeeded and project ACLs allowed modification. I found and stopped a stale NEXORA `next dev --webpack` process on port 3000, but the restricted build still failed afterward. Windows Defender and McAfee are registered on the machine, though I found no evidence that either held these paths. A clean `npm run build` completed when run with normal Windows process permissions using Next's isolated `.nexora-build` output directory. The script selects webpack and the isolated directory for this environment.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for current boundaries and the staged implementation plan. Planned modules are presented as roadmap information, not as working features.
