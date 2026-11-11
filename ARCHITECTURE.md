# NEXORA architecture

## Foundation boundaries

- `src/app/` owns route composition, metadata, and the global stylesheet.
- `src/components/` contains the shared shell and the first interactive workspace components.
- `src/lib/` contains small domain-neutral definitions shared by the UI.
- `public/` contains only original static assets for this application.
- Server services and persistence are intentionally not present yet. They will be introduced with authentication and data ownership in a later phase.

## First vertical slice

The current browser-only slice provides a responsive navigation shell, a keyboard-accessible command palette, a persisted light/dark preference, and a focus timer with start, pause, reset, and completion states. It stores no personal or project data on a server.

## Planned service boundaries

Later work will introduce server-side authentication/session handling, MongoDB repositories, object-storage metadata, a permission-checked API layer, and provider adapters. Redis, queues, and WebSockets will be added only for features that need them. Project analysis will execute untrusted source only in a separately isolated worker environment; the web process will not run uploaded code.

## Product sequence

1. Foundation and design system — in progress.
2. Authentication, session model, and MongoDB ownership boundary.
3. CONNECT, THINK, and SPEAK vertical slices.
4. SOCIAL, CREATE, and PRODUCTIVITY workflows.
5. BUILD and isolated project intelligence.
6. DISCOVER and approved integrations.
7. Security, accessibility, performance, and release verification.

Each feature becomes visible as available only after its behavior and error states exist.
