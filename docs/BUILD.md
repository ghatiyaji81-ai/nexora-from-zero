# BUILD

BUILD is the authenticated engineering workspace at `/build`. It is an incremental engineering workspace, not a hosted IDE replacement. Its file editor, private storage, project snapshots, JSON/ZIP export, bounded text-only ZIP import, search, and static checks work without an execution provider. Optional terminal and Git operations use a separate Docker container; user project code is never executed in the NEXORA application process.

## What works today

- Create, list/search (latest 100 results), rename, duplicate, archive/restore, delete, and export owner-scoped projects. Fifteen file-based starter templates are available.
- Browse up to 500 project files, open multiple tabs, edit plain text/code, use line numbers, search and replace in a file, search across bounded project contents, download a file, save manually (`Ctrl+S`), and autosave.
- Create, rename, and delete relative-path files. Paths reject traversal, absolute paths, backslashes, controls, empty segments, and Windows device names. Each text file is limited to 256 KiB; the project file list is limited to 500 records.
- Store file bodies in private GridFS bucket `build_project_files`. MongoDB stores metadata, ownership, revision pointers, approvals, and scan records. Up to 20 prior snapshots per path are retained. The History panel restores existing or deleted files.
- Export a project as a private JSON backup (`.nexora-build.json`) or ZIP archive, capped at 500 files and 10 MiB of source content.
- Import ZIP archives up to 10 MiB containing at most 500 UTF-8 text files, each at most 256 KiB. Only stored/deflate entries are accepted; encrypted, multi-volume/ZIP64, duplicate paths, unsafe paths, symlinks, invalid checksums, binary data, and excessive expansion are rejected. Imported source is kept private and is never executed.
- Ask the existing THINK coding agent to explain a file or selected code. When proposing edits, BUILD stores a pending proposal and displays before/after content. Only the authenticated project owner can explicitly approve or reject it. Approval checks the original file revision, applies the change, and retains the prior file version. A malformed AI response is shown without changing project files.
- Run a deterministic heuristic scanner over saved code. Findings include evidence line numbers and `needs_review` status; a clean result is not a security certification.
- When an administrator enables a reachable Docker daemon and preloads the configured runtime image, start up to three project-scoped isolated sessions. Runtime is detected from project paths. Sessions are non-root, network-disabled, read-only except for bounded in-memory `/workspace` and `/tmp`, have CPU/memory/PID limits, and receive no NEXORA application environment or sensitive host mounts. Image pulls are never automatic.
- Run a deliberately restricted set of explicitly approved offline commands: common npm scripts, offline npm install/ci, Python entry files and test discovery, Maven/Gradle offline tasks, `pip list`, and pip install from cached packages or requirements with `--no-index`. Arbitrary shell syntax, network commands, package downloads, and destructive terminal commands are not accepted. Output is bounded; command duration is limited to ten minutes (the UI default is two minutes). A timeout stops the container.
- Synchronize sandbox source files back to private project storage after an explicit confirmation. Saved and deleted files retain BUILD file history. A revision check detects editor changes made after session start. Git metadata and generated directories are excluded; symlinks, binary files and oversized workspaces are rejected.
- Use Git inside an active isolated session for initialization, status, diffs, stage/unstage, commit, history, branch create/switch/compare, and explicitly approved per-file restore. Git commands are fixed argument arrays, not shell input. Commit author identity is supplied per commit and is not stored as a credential.
- View private command and Git execution logs by project owner.
- Detect likely Next.js, Vite, Create React App, supported Node web-server, and static HTML projects from saved manifests/entry files. Detection reports a candidate start script; it does not claim the app is running.
- Record non-zero isolated command outcomes as owner-scoped debugging diagnostics. Recognized compiler locations are extracted from actual command output; otherwise the bounded captured output, command, exit code, and session are shown. Diagnostics can be sent to existing THINK only after the user selects Explain or Prepare fix and then explicitly submits the prompt. Any code proposal still uses the existing before/after review and approval path.
- Provide owner-scoped preview status/action APIs and UI for start/restart/stop/reload, but currently fail closed because no isolated preview gateway is configured. The UI explicitly reports that live rendering is unavailable; it never exposes a container port or fabricates a running state.
- Discover Vitest, Jest, Playwright, Cypress, Node's built-in test runner, pytest, unittest, Maven, and Gradle test targets from project manifests/configuration/files. A config file alone does not count as an installed framework; dependency declarations are shown separately from actual runtime availability. Test file paths are bounded and path-validated.
- Run all or one discovered test file inside an existing active isolated execution session after explicit confirmation. Supported commands are fixed argument arrays; selection paths must match discovered project test files. The runner captures final bounded output, exit code, duration, and only parses counts/failures when recognizable actual test-runner output is present. Timeouts are capped at ten minutes. Cancel stops/removes the entire isolated execution session, including its workspace and session-local Git data. No live output streaming or coverage report is implemented.
- Review recent owner-scoped test runs, actual parsed pass/fail/skip totals, output, status, and failures. At most 50 completed run records per project are retained. The currently open file plus a bounded excerpt of actual test output can be sent to THINK only after the user selects Explain/Prepare fix and explicitly submits.
- Inspect declared dependencies in package.json, requirements.txt, pyproject.toml, Maven pom.xml, and supported Gradle declarations. Detect npm, pnpm, yarn, bun, pip, Poetry, uv, pipenv, Maven, and Gradle markers/lockfiles. Installed versions remain `unknown` unless verified inside a project sandbox; lockfile versions are not represented as installed.
- Create private GridFS recovery snapshots of dependency manifests/lockfiles and explicitly restore those files with file-version retention and revision-checked writes. Snapshots are hash-verified and capped at 20 per project; restore changes only files in the chosen snapshot and may report partial application if concurrent writes occur.
- Reject or record dependency-change, outdated, and vulnerability-scan requests as blocked when no approved registry/network broker or trusted vulnerability source exists. No install, registry request, manifest edit, lockfile regeneration, compatibility recommendation, or vulnerability scan is claimed or performed.

## Not available (not simulated)

- Git is session-local: stopping a session deletes its in-memory workspace and `.git` history after source synchronization. Commit/branch metadata is not restored into later sessions. Persistent repository bundles, GitHub account credentials, repository listing, and remote fetch/pull/push synchronization are not implemented.
- The code editor is a browser-native text editor with line numbers, not Monaco; language syntax highlighting, language-server diagnostics, formatting, and split-pane editing are unavailable.
- Supervised agent roles/task queues and a full project activity timeline are not implemented.
- Docker sandbox execution is disabled by default and was not live-tested in this environment. Without a configured Docker daemon and preloaded image, session creation reports unavailable; BUILD editing, THINK proposals, history and ZIP functions remain available.
- Live browser rendering, a preview gateway, runtime stdout/stderr monitoring, browser console capture, resource telemetry, and actual app process start/stop are not implemented. Existing project containers have `--network none` and no published ports. The preview adapter intentionally returns unavailable; a real gateway and isolated origin/domain are required before the UI enables preview actions. Error history covers failed approved terminal/build/test commands only, not errors from an unmonitored running app.
- Runtime-framework detection is limited to recognizable Next.js, Vite, Create React App, Express/Fastify/Koa/Hono Node projects, and static `index.html`. Detection does not imply the framework's dependencies are installed or that a preview command works. Python, Java, and other application preview adapters are unsupported.
- Test execution depends on a working isolated execution session whose runtime image includes the relevant tools and whose project dependencies are already available. BUILD does not perform registry downloads or installation. Custom test scripts execute project-controlled code in the Docker sandbox only after explicit confirmation; Docker shares the host kernel.
- Test framework support is based on detected manifests/configuration and known command adapters. Unsupported configurations, missing tools, and unparseable output are reported without inferred success/counts. Test stdout/stderr is bounded; results are synchronous with periodic status refresh, not streamed. Coverage, flaky-test analysis, and comprehensive framework-specific failure parsing are unavailable.
- Dependency installation, update/removal, registry/outdated checks, and vulnerability scans are unavailable without an approved package broker and trusted vulnerability provider. The dependency UI supports read-only inspection, blocked-operation records, and explicit private manifest/lockfile snapshots/restores; it does not modify or install packages.
- Docker sandbox execution is disabled by default and was not live-tested in this environment. Without a configured Docker daemon and preloaded image, session creation reports unavailable; BUILD editing, THINK proposals, history and ZIP functions remain available.
- Docker network access, package downloads, GitHub credentials/remotes, deployment, and deployment rollback are unavailable. Project changes inside a session are not saved to MongoDB until the user synchronizes them; `.git` data is never synchronized.
- Dependency/outdated-package and vulnerability checks are not available. The static scanner has a small heuristic ruleset, may miss issues or raise false positives, and does not upload source code to an external scanner.
- PPTX-style export, debugger integration, and role-based permissions are not available.
- Template files are initialized locally, but their dependencies are not installed. Runtime and build commands cannot be run in BUILD.

## Architecture and persistence

- Authentication comes from the existing server-side NEXORA session. Request bodies never select an owner. Mutating API requests use same-origin checks, the existing database-backed rate limiter, strict Zod validation, and owner/project-scoped MongoDB queries.
- `BuildProject` stores owner, title, description, starter, status, and tags in `build_projects`.
- `BuildProjectFile` stores owner, project, safe relative path, private GridFS ID, byte size, and revision in `build_project_files`.
- `BuildProjectFileVersion` stores owner/project/path/revision and a pointer to a retained GridFS body in `build_project_file_versions`.
- `BuildApproval` records pending/applied/rejected/stale THINK edits in `build_approvals`; proposed text is private GridFS content, not copied into ordinary MongoDB documents.
- `BuildSecurityScan` stores bounded heuristic findings in `build_security_scans`.
- `BuildExecutionSession`, `BuildExecutionLog`, and `BuildGitRepository` store owner/project-scoped session state, bounded command/Git output, and per-session repository status. No container secrets or GitHub credentials are stored.
- `BuildPreviewSession` reserves owner/project/execution-session-scoped metadata for a future gateway-backed preview; provider references are excluded from normal reads. No preview sessions are created while the gateway is unavailable.
- `BuildRuntimeError` stores bounded diagnostics only for non-zero execution log outcomes. It does not claim to monitor an active server process. `BuildExecutionLog` remains the source evidence for command output.
- `BuildTestRun` stores owner/project/session-scoped test framework, fixed command, selection, terminal status, bounded output, actual parsed counts, failures, timestamps, and duration. Completed run history is capped at 50 records per project.
- `BuildDependencySnapshot` stores manifest/lockfile paths, source revisions, hashes, and private GridFS backup IDs for explicit recovery. `BuildDependencyOperation` records blocked dependency/provider requests; it does not imply installation or registry access.
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
- `GET/POST /api/build/projects/[projectId]/execution`: list private session/log history; start, run one allowlisted approved offline command, synchronize source with explicit approval, or stop and remove an isolated session.
- `POST /api/build/projects/[projectId]/git`: run a validated local Git operation in an active owned session.
- `GET/POST /api/build/projects/[projectId]/preview`: inspect detected application type and owned sessions, or request a preview lifecycle action. Lifecycle actions return unavailable until a secure gateway is configured.
- `GET /api/build/projects/[projectId]/debug`: search and list actual failed-command diagnostics belonging to the project owner.
- `GET/POST /api/build/projects/[projectId]/tests`: discover tests and recent runs; run approved tests or cancel by stopping the owned isolated session.
- `GET/POST /api/build/projects/[projectId]/dependencies`: inspect dependencies and provider status; create/restore approved private snapshots or record blocked dependency-provider requests.
- `GET /api/build/providers`: truthful THINK, sandbox, preview, GitHub, and deployment integration status.

## THINK, secrets, and approvals

BUILD does not implement its own model provider. A user action creates a normal THINK conversation and sends the user prompt plus at most 2.4 KiB of selected/current-file code through the existing THINK coding endpoint. Provider credentials remain server-side as required by THINK. Configure the existing `OPENAI_API_KEY` and THINK model settings on the server to enable live AI; without them, code editing remains available and THINK returns its normal unavailable-provider response.

AI output is treated as untrusted. A code-change proposal must parse as one bounded JSON object targeting the currently selected path. Before/after content is shown in BUILD, and a separate explicit approval is required to apply it. The apply API checks the project owner and base revision. Agents do not run, approve, or grant their own permissions. Pending proposal expiry is not currently automated; users may reject it or delete the project.

Docker containers receive no NEXORA application environment variables, host mounts, network, Docker socket, or provider credentials. The only writable paths are size-bounded tmpfs mounts; the workspace is not persisted by Docker after stop. The Docker daemon and preloaded images remain trusted infrastructure. Standard containers share the host kernel and are not a complete defense against a kernel or daemon escape; for hostile multi-tenant workloads, use a separately managed VM/microVM or remote sandbox service. GitHub and deployment credentials are not configured or stored.

### Preview gateway security boundary

The current Docker execution provider is deliberately not a preview server: it creates network-disabled containers and publishes no ports. Do not bind a user container to a public interface, proxy arbitrary user-supplied URLs, or host the preview on the authenticated NEXORA origin. Live preview requires a separately deployed gateway with an isolated origin/domain, owner/session authorization on every request, fixed gateway-issued targets, bounded request/response sizes, blocked private/metadata destinations, time/resource limits, and cleanup of expired sessions. `isSafeBuildPreviewUrl` is only a strict URL-policy helper; it is not a network proxy or a substitute for DNS/rebinding controls. Production multi-tenant workloads should use a separately managed VM/microVM or stronger remote sandbox; Docker shares the host kernel.

Preview startup must use the exact saved revision represented by an owned active execution session. The API checks the session source snapshot against current file IDs/revisions and rejects stale sessions. The editor saves pending text before a preview request; sandbox synchronization remains a separate explicit action.

## Setup and checks

Copy the variable-name-only reference at [build.env.example](./build.env.example) into your environment and supply values through the existing NEXORA server setup; do not commit secrets. `OPENAI_API_KEY` is optional and is needed only for live THINK output. To enable execution, set `BUILD_DOCKER_ENABLED=true`, install Docker Engine/Desktop for the app's service account, configure `BUILD_DOCKER_COMMAND` if the executable is not on `PATH`, and preload the exact runtime image tags listed in the environment example. Images are never pulled automatically. Each runtime image can be changed through its corresponding `BUILD_DOCKER_*_IMAGE` setting; use reviewed images with the language toolchain and Git utilities required by your projects. BUILD does not grant project containers network access. The Docker account is highly privileged infrastructure; do not share its credentials with project code.

```sh
npm run db:create-indexes
npm run typecheck
npm test
npm run test:integration
npm run build
```

`npm test` includes BUILD command-policy, preview target/URL/error parsing, test framework/command/count parsing, dependency/package-manager parsing, provider-unavailable, runtime detection, branch validation, template/path/scanner, and ZIP integrity/traversal unit tests. `npm run test:integration` includes authenticated project/file/snapshot/proposal/scan/ZIP ownership workflows and requires a running app plus a MongoDB replica set. Docker test execution, cancellation, Git actions, MongoDB persistence/index creation, dependency snapshot restoration, and ownership workflows require their real providers and were not live-verified when unavailable.

## Extension points

Follow-up work: persist Git history across isolated sessions; add an independently managed sandbox with stronger VM/microVM isolation and enforceable storage quotas; provide an approved package-registry broker with lifecycle-script containment and trusted vulnerability data; stream long-running test output from supervised jobs; complete framework-specific result parsing; implement a dedicated authenticated preview gateway on a separate origin; add GitHub through server-side credential storage and explicit approval for remote writes; and add Docker/MongoDB-backed integration tests in a host with those providers available.
