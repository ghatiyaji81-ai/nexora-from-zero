# BUILD

BUILD is the authenticated engineering workspace at `/build`. It is an incremental, local editing and review tool, not a hosted IDE replacement. Its file editor, private storage, project snapshots, JSON/ZIP export, bounded text-only ZIP import, search, and static checks work without an execution provider. It never runs project code or shell commands inside the NEXORA application process.

## What works today

- Create, list/search (latest 100 results), rename, duplicate, archive/restore, delete, and export owner-scoped projects. Fifteen file-based starter templates are available.
- Browse up to 500 project files, open multiple tabs, edit plain text/code, use line numbers, search and replace in a file, search across bounded project contents, download a file, save manually (`Ctrl+S`), and autosave.
- Create, rename, and delete relative-path files. Paths reject traversal, absolute paths, backslashes, controls, empty segments, and Windows device names. Each text file is limited to 256 KiB; the project file list is limited to 500 records.
- Store file bodies in private GridFS bucket `build_project_files`. MongoDB stores metadata, ownership, revision pointers, approvals, and scan records. Up to 20 prior snapshots per path are retained. The History panel restores existing or deleted files.
- Export a project as a private JSON backup (`.nexora-build.json`) or ZIP archive, capped at 500 files and 10 MiB of source content.
- Import ZIP archives up to 10 MiB containing at most 500 UTF-8 text files, each at most 256 KiB. Only stored/deflate entries are accepted; encrypted, multi-volume/ZIP64, duplicate paths, unsafe paths, symlinks, invalid checksums, binary data, and excessive expansion are rejected. Imported source is kept private and is never executed.
- Ask the existing THINK coding agent to explain a file or selected code. When proposing edits, BUILD stores a pending proposal and displays before/after content. Only the authenticated project owner can explicitly approve or reject it. Approval checks the original file revision, applies the change, and retains the prior file version. A malformed AI response is shown without changing project files.
- Run a deterministic heuristic scanner over saved code. Findings include evidence line numbers and `needs_review` status; a clean result is not a security certification.

## Not available (not simulated)

- Git repository cloning, remote synchronization, and non-ZIP import formats are not implemented. ZIP import handles validated text sources only; no imported code is executed.
- The code editor is a browser-native text editor with line numbers, not Monaco; language syntax highlighting, language-server diagnostics, formatting, and split-pane editing are unavailable.
- Supervised agent roles/task queues, AI debugging workflows, and a full project activity timeline are not implemented.
- No sandbox provider is configured. Terminal, build/test execution, package installation, live preview, and runtime debugging are blocked. The UI shows: “Execution environment unavailable — configure a sandbox provider.”
- Git/local repository commands, GitHub credentials and remotes, deployment, and rollback are unavailable. No success-shaped fake status is shown.
- Dependency/outdated-package and vulnerability checks are not available. The static scanner has a small heuristic ruleset, may miss issues or raise false positives, and does not upload source code to an external scanner.
- PPTX-style or archive export, test discovery/history, debug logs, role permissions, and task cancellation are not available.
- Template files are initialized locally, but their dependencies are not installed. Runtime and build commands cannot be run in BUILD.

## Architecture and persistence

- Authentication comes from the existing server-side NEXORA session. Request bodies never select an owner. Mutating API requests use same-origin checks, the existing database-backed rate limiter, strict Zod validation, and owner/project-scoped MongoDB queries.
- `BuildProject` stores owner, title, description, starter, status, and tags in `build_projects`.
- `BuildProjectFile` stores owner, project, safe relative path, private GridFS ID, byte size, and revision in `build_project_files`.
- `BuildProjectFileVersion` stores owner/project/path/revision and a pointer to a retained GridFS body in `build_project_file_versions`.
- `BuildApproval` records pending/applied/rejected/stale THINK edits in `build_approvals`; proposed text is private GridFS content, not copied into ordinary MongoDB documents.
- `BuildSecurityScan` stores bounded heuristic findings in `build_security_scans`.
- Declared compound indexes are registered in `scripts/create-indexes.ts`; run `npm run db:create-indexes` when deploying. Index creation and MongoDB workflows require the configured MongoDB replica set used by the rest of NEXORA.
- GridFS project-file bodies are UTF-8 text. Content is served only through authenticated API routes after owner checks. Project export responses are private and non-cacheable.

## API routes

- `GET/POST /api/build/projects`: list/search and create from a starter.
- `GET/PATCH/DELETE /api/build/projects/[projectId]`: read, update metadata/archive, and delete an owned project.
- `POST /api/build/projects/[projectId]/duplicate` and `GET /api/build/projects/[projectId]/export`: bounded copy and JSON backup export.
- `POST /api/build/projects/import`: bounded, validated ZIP import into a new private project.
- `GET /api/build/projects/[projectId]/zip`: bounded ZIP archive export for an owned project.
- `GET/POST /api/build/projects/[projectId]/files`: list and create project files.
- `GET/PATCH/DELETE /api/build/projects/[projectId]/files/[fileId]`: read, revision-checked save/rename, and delete with snapshot retention.
- `GET /api/build/projects/[projectId]/search`: bounded saved-file search.
- `GET/POST /api/build/projects/[projectId]/versions`: list snapshots and restore an existing/deleted file.
- `GET /api/build/projects/[projectId]/files/[fileId]/versions` and `POST .../versions/[versionId]`: list and restore a file's retained history.
- `GET/POST /api/build/projects/[projectId]/approvals` and `PATCH .../approvals/[approvalId]`: owner-scoped proposal queue and explicit decisions.
- `POST /api/build/projects/[projectId]/scan`: bounded static analysis.
- `GET /api/build/providers`: truthful THINK and unavailable integration status.

## THINK, secrets, and approvals

BUILD does not implement its own model provider. A user action creates a normal THINK conversation and sends the user prompt plus at most 2.4 KiB of selected/current-file code through the existing THINK coding endpoint. Provider credentials remain server-side as required by THINK. Configure the existing `OPENAI_API_KEY` and THINK model settings on the server to enable live AI; without them, code editing remains available and THINK returns its normal unavailable-provider response.

AI output is treated as untrusted. A code-change proposal must parse as one bounded JSON object targeting the currently selected path. Before/after content is shown in BUILD, and a separate explicit approval is required to apply it. The apply API checks the project owner and base revision. Agents do not run, approve, or grant their own permissions. Pending proposal expiry is not currently automated; users may reject it or delete the project.

No secrets are available to project code because there is no code-execution provider. BUILD has no GitHub or deployment credential storage until those integrations are implemented.

## Setup and checks

Copy the variable-name-only reference at [build.env.example](./build.env.example) into your environment and supply values through the existing NEXORA server setup; do not commit secrets. `OPENAI_API_KEY` is optional and is needed only for live THINK output. There are no active BUILD-specific sandbox, GitHub, or deployment variables because those adapters are not implemented.

```sh
npm run db:create-indexes
npm run typecheck
npm test
npm run test:integration
npm run build
```

`npm test` includes BUILD template/path/scanner and ZIP integrity/traversal unit tests. `npm run test:integration` includes authenticated project/file/snapshot/proposal/scan/ZIP ownership workflows and requires a running app plus a MongoDB replica set. These checks do not claim a live AI provider, sandbox, Git host, or deployment provider is configured.

## Extension points

Future sandbox work must define a separate execution service with per-user isolation, no application environment variables or sensitive host mounts, explicit resource/network limits, cancellation, and an auditable approval flow. It must not be replaced with `child_process` or arbitrary execution in a Next.js route. GitHub and deployment adapters likewise need server-only credential storage and explicit user approval before remote writes.
