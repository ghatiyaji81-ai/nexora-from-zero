# NEXORA

NEXORA is a new, independent digital workspace. This repository is being built from a clean foundation; no application source from the earlier project is included.

## Current stage

The first vertical slice establishes the visual system, responsive application shell, keyboard command search, theme switch, and a working local focus timer. The timer runs in the current browser session only. Accounts, database persistence, external providers, and the other product modules have not been implemented yet.

## Run locally

Requirements: Node.js 20.9 or newer and npm.

```sh
npm install
npm run dev
```

Open `http://localhost:3000`. Use `Ctrl+K` or `⌘K` to search the available workspace actions.

## Project checks

```sh
npm run typecheck
npm run build
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for current boundaries and the staged implementation plan. Planned modules are presented as roadmap information, not as working features.
