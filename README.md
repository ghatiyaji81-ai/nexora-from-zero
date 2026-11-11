# NEXORA

NEXORA is a new, independent digital workspace. This repository is being built from a clean foundation; no application source from the earlier project is included.

## Current stage

The foundation includes the responsive workspace shell, keyboard command search, theme switch, and a browser-local focus timer. The account milestone adds MongoDB-backed users and profiles, scrypt password hashing, database sessions, permission checks, signup, login, logout, and a single-use password recovery flow. Password recovery requires a configured Resend account; it returns a clear setup error until email delivery is configured. Other product modules remain on the roadmap.

## Run locally

Requirements: Node.js 20.9 or newer, npm, and a MongoDB replica set (MongoDB Atlas or a local MongoDB server).

1. Copy `.env.example` to `.env.local`.
2. Set `MONGODB_URI` to a replica-set connection string. Multi-document account creation and password reset use MongoDB transactions.
3. Generate a private rate-limit key with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"` and place it in `AUTH_RATE_LIMIT_SECRET`.
4. Set `APP_ORIGIN` to the app's origin. For email recovery, also configure a verified Resend sender in `RESEND_API_KEY` and `EMAIL_FROM`.
5. Run `npm run db:create-indexes` before deploying. It creates declared indexes and does not remove existing indexes.

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

`npm run test:integration` exercises signup, login, the protected workspace, password reset, session revocation, logout, and the unconfigured email-provider state against MongoDB. Start a local replica set and the app first; set `MONGODB_URI`, `AUTH_RATE_LIMIT_SECRET`, `APP_ORIGIN`, and `NEXORA_TEST_ORIGIN` for the test process. It creates and removes a unique `.test` account.

Build diagnosis on this Windows environment: the initial Turbopack build failed in its CSS worker. Restricted build attempts then failed intermittently while creating route output directories such as `.next/server/app/workspace` and `.next/server/app/signup`; direct Node directory creation succeeded and project ACLs allowed modification. I found and stopped a stale NEXORA `next dev --webpack` process on port 3000, but the restricted build still failed afterward. Windows Defender and McAfee are registered on the machine, though I found no evidence that either held these paths. A clean `npm run build` completed when run with normal Windows process permissions using Next's isolated `.nexora-build` output directory. The script selects webpack and the isolated directory for this environment.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for current boundaries and the staged implementation plan. Planned modules are presented as roadmap information, not as working features.
