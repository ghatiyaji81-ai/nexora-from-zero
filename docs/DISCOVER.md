# DISCOVER

DISCOVER is an authenticated research workspace at `/discover`. Its local search runs over extracted text already stored in the signed-in user's private THINK document library. Search results are exact excerpts with document IDs and character offsets; there are no synthetic web results or generated citations.

## Available now

- Search supported PDF, DOCX, and TXT documents uploaded through THINK. Exact phrase and all-term matching, date filters, relevance/recent sorting, and bounded history are supported. Each request examines at most 30 matching documents and returns at most 30 excerpts.
- Save a source excerpt to the private research library, add notes, and organize excerpts in owner-scoped collections.
- Compile a Markdown evidence report from selected saved excerpts. Reports retain the cited excerpt, document name, and character offsets and state their limitations. Download reports as Markdown.
- Ask THINK to analyze selected documents after the user explicitly submits the question. If THINK web search is configured, a question without selected documents uses THINK's existing research agent and provider-returned citations.
- Inspect provider configuration without exposing credentials. Local document search works without an AI or web-search key.

## Not implemented

- No standalone external web, news, or academic search adapter exists. Public web research is available only through the existing THINK web-search tool when both `OPENAI_API_KEY` and `THINK_ENABLE_WEB_SEARCH=true` are configured. The UI reports this status and never substitutes mock results.
- Deep research is not an autonomous or background task. Evidence reports are compiled synchronously from excerpts selected by the user; task records are marked complete only after that operation.
- No crawler, arbitrary-URL fetcher, OCR, embedding index, semantic search, source credibility scoring, contradiction detector, saved-search scheduler, or AI-produced report generation exists.
- Scanned PDFs have no searchable text when THINK extraction cannot read a text layer. DISCOVER does not claim OCR support.
- Voice capture remains in SPEAK; users can use the existing SPEAK workspace, but a direct voice-to-DISCOVER action is not implemented.
- Markdown export is implemented. HTML/PDF report export and direct project creation in CREATE/BUILD are not implemented.

## Data and APIs

DISCOVER uses MongoDB collections and existing THINK document records:

- `discover_searches`: per-owner query history.
- `discover_collections`: private named collections.
- `discover_sources`: immutable excerpts referencing a private THINK document and character range.
- `discover_bookmarks`: collection, note, and tags for saved excerpts.
- `discover_research_tasks`: synchronous, completed evidence-compilation records.
- `discover_evidence`: owner-scoped evidence snapshots attached to a task.
- `discover_research_reports`: private Markdown reports.

Run `npm run db:create-indexes` after deployment to create the model indexes.

Routes are under `/api/discover`: `providers`, `search`, `collections`, `collections/[collectionId]`, `sources`, `sources/[sourceId]`, `research`, and `research/[reportId]`. Document upload and access use the existing `/api/think/documents` APIs and remain governed by THINK's owner checks.

## Security boundaries

- API identity comes from the existing authenticated session; client-supplied owner IDs are not accepted.
- Every collection, saved excerpt, search record, evidence record, task, and report lookup is owner-scoped.
- Mutations use same-origin checks, schema validation, and database-backed rate limiting.
- Search returns at most 30 private-document excerpts per request. Query text is escaped before it is used in MongoDB regular expressions. MongoDB text indexing is not yet implemented, so regex scans may become slower for very large personal libraries.
- DISCOVER never fetches a user-supplied URL, preventing server-side request forgery through this module. Provider-supplied citation links are shown only as HTTP(S) links and open in a new tab.
- Private document content is not sent to THINK during search. It is included only when the user explicitly asks THINK to analyze selected documents. THINK treats attached documents as untrusted source material in its existing provider instructions.
- Reports display as escaped text in a `<pre>` element; they are not rendered as raw HTML.

## Configuration and validation

THINK uses the existing server-side provider configuration. Do not expose `OPENAI_API_KEY` or provider credentials to the browser. The provider status endpoint reports whether local documents, THINK, and THINK web search are available.

Run:

```powershell
npm test
npm run typecheck
npm run build
```

`npm run test:integration` requires a running app and a MongoDB replica set configured through the existing test environment.
