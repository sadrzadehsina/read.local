# Migration Plan — Aligning Codebase with SPEC.md

_Generated from a review of the current codebase against [SPEC.md](SPEC.md) on 2026-07-06._

## 1. Summary

The codebase currently implements a working slice of **Phase 0 → Phase 3** of the spec's phased plan (project bootstrap, source management, basic ingestion, and a minimal reader UI). Several required behaviors within those phases are incomplete, and **Phases 4–7 (tagging, UX polish, sharing/export, local domain setup) are entirely unimplemented**. Phase 8 is optional and out of scope for now.

| Phase | Spec Requirement | Status |
|---|---|---|
| 0 | Monorepo, Docker Compose, DB, base API/frontend shell | ✅ Done |
| 1 | Source CRUD (create/list), frontend form + list | ✅ Done |
| 2 | RSS + HTML ingestion, worker service, dedup | ⚠️ Partial |
| 3 | Post list, reader view, prev/next nav, open original | ⚠️ Partial (no prev/next) |
| 4 | Tagging system (tags, assignment, filter, autocomplete) | ❌ Not started |
| 5 | Dark/light mode, responsive layout, typography, keyboard nav | ⚠️ Partial (responsive only) |
| 6 | Sharing: copy link, export HTML/Markdown, export bundle | ❌ Not started |
| 7 | `read.local` domain, hosts mapping docs, optional HTTPS | ⚠️ Partial (proxy exists, no domain docs/HTTPS) |
| 8 | PWA, offline, full-text search, sync (optional) | ❌ Not started (optional) |

---

## 2. Detailed Findings

### 2.1 Data Model Gaps ([apps/backend](apps/backend) + [packages/database/prisma/schema.prisma](packages/database/prisma/schema.prisma))
- `Source` is missing the `type` field (`rss | html | unknown`) required by SPEC §5. The worker detects RSS vs HTML at ingestion time but never persists or exposes the result.
- `Tag` and `PostTag` models specified in SPEC §5 do not exist at all.
- Otherwise `Source` and `Post` models match the spec (id, url/title, sourceId, content, originalUrl, publishedAt, createdAt).

### 2.2 Ingestion Engine ([apps/worker/src/server.ts](apps/worker/src/server.ts))
- RSS parsing (`rss-parser`) ✅ implemented.
- HTML parsing via `@mozilla/readability` + `jsdom` ✅ implemented.
- Deduplication by `originalUrl` via `upsert` ✅ implemented.
- In-memory queue ✅ implemented (matches "can be in-memory for now" guidance).
- **Gap:** No Playwright fallback for JS-heavy pages (SPEC §4 and §6.2 explicitly call for this).
- **Gap:** HTML sources always produce exactly one `Post` keyed to `source.url`; there's no logic to extract multiple articles from an HTML index/listing page, so an HTML "newsletter archive" page won't behave like a real multi-post source.

### 2.3 Reader Experience ([apps/frontend/src/main.tsx](apps/frontend/src/main.tsx))
- Source list (folder-style sidebar) ✅, post list ✅, reader view with content/date/original-link ✅.
- HTML sanitization before render ✅ (good XSS mitigation, keep as-is).
- **Gap:** No next/previous post navigation control in the reader (SPEC §6.4, Phase 3 deliverable).

### 2.4 Tagging ([packages/database/prisma/schema.prisma](packages/database/prisma/schema.prisma), backend, frontend)
- **Gap:** Entirely missing — no `Tag`/`PostTag` models, no `/tags` or `/posts/:id/tags` endpoints, no tagging UI, no filter-by-tag, no autocomplete.

### 2.5 UI/UX Polish ([apps/frontend/src/styles.css](apps/frontend/src/styles.css))
- Responsive breakpoints exist (`@media (max-width: 1040px)`, `@media (max-width: 760px)`) ✅.
- **Gap:** No dark mode (no `prefers-color-scheme` handling or theme toggle).
- **Gap:** No keyboard navigation (`j`/`k` for next/previous post).
- Typography is reasonably clean already; minor iteration only needed once other gaps close.

### 2.6 Sharing & Export
- **Gap:** No copy-link action, no export-as-HTML, no export-as-Markdown, no export-source-bundle (JSON) feature anywhere in backend or frontend.

### 2.7 Local Domain Setup ([infra/nginx/nginx.conf](infra/nginx/nginx.conf), [docker-compose.yml](docker-compose.yml))
- Nginx reverse proxy correctly routes `/api/*` → backend, `/worker/*` → worker, `/` → frontend ✅.
- **Gap:** No documentation or setup script for mapping `read.local` in `/etc/hosts`, and no optional HTTPS/mkcert setup (SPEC §8, §7). `server_name` is `_` (catch-all) rather than `read.local`.

### 2.8 Documentation
- Current [README.md](README.md) is actually the **Copilot prompt pack** (phase-by-phase prompts), not user/dev-facing setup documentation. There is no README explaining how to run the app, map the local domain, or use each feature — worth addressing alongside Phase 7.

---

## 3. Migration Plan

Work is organized to finish the phases already in progress before starting new ones, per SPEC §11 ("avoid adding features not in current phase"). Each step lists concrete file targets and an acceptance check.

### Step A — Complete Phase 2 (Ingestion Engine)
1. Add `type` column to `Source` (`rss | html | unknown`) in [schema.prisma](packages/database/prisma/schema.prisma); create a Prisma migration.
2. Persist detected type in [apps/backend/src/server.ts](apps/backend/src/server.ts) (or worker) when a source is created/ingested; expose it in `SourceDto` ([packages/shared/src/index.ts](packages/shared/src/index.ts)).
3. Add Playwright as a fallback fetch strategy in [apps/worker/src/server.ts](apps/worker/src/server.ts) when a plain `fetch` yields no RSS items and Readability extraction looks empty/too-short (e.g., render with Playwright, re-run Readability on the rendered DOM).
4. (Optional, only if time allows within this step) Support multi-article extraction for HTML "index" pages by detecting repeated article/link patterns; otherwise document the current single-post-per-HTML-source limitation as a known constraint.

**Acceptance:** New source correctly records `type`; a JS-heavy test page ingests content via Playwright fallback without manual intervention.

### Step B — Complete Phase 3 (Reader Experience)
1. Add "Next post" / "Previous post" controls to the reader header in [apps/frontend/src/main.tsx](apps/frontend/src/main.tsx), operating over the currently loaded `posts` list for the selected source.
2. Disable/hide controls at list boundaries.

**Acceptance:** From an open post, user can move to the next/previous post in the same source without returning to the list.

### Step C — Phase 4 (Tagging System)
1. Add `Tag { id, name unique }` and `PostTag { postId, tagId }` models to [schema.prisma](packages/database/prisma/schema.prisma); migrate.
2. Backend endpoints in [apps/backend/src/server.ts](apps/backend/src/server.ts):
   - `GET /tags`
   - `POST /posts/:id/tags` (create-if-missing by name, associate)
   - `DELETE /posts/:id/tags/:tagId`
   - Extend `GET /sources/:id/posts` and `GET /posts/:id` to include associated tags.
3. Frontend: tag chips in reader view with add/remove, a tag filter control in the post list, and simple autocomplete against `GET /tags`.

**Acceptance:** User can tag a post, see tags persist across reloads, and filter a source's post list by tag.

### Step D — Phase 5 (UX/UI Polish)
1. Add dark/light theme: CSS custom properties + `prefers-color-scheme` media query in [styles.css](apps/frontend/src/styles.css), plus a manual toggle stored in `localStorage`.
2. Add keyboard navigation (`j` = next post, `k` = previous post) in [main.tsx](apps/frontend/src/main.tsx), reusing the next/prev logic from Step B.
3. Minor typography/readability pass (line length, font sizing) once dark mode is in place.

**Acceptance:** Theme respects system preference and manual override; `j`/`k` move between posts; layout remains usable at mobile widths (already partly covered).

### Step E — Phase 6 (Sharing & Export)
1. Backend: `GET /posts/:id/export?format=html|markdown` (or reuse existing `PostDto` and convert client-side for markdown), `GET /sources/:id/export` returning a JSON bundle of the source + its posts.
2. Frontend: "Copy link" (writes a local app route URL to clipboard), "Export as HTML", "Export as Markdown", "Export source" buttons in the reader/source header.

**Acceptance:** Each export action produces a downloadable/copyable artifact using only local data — no external services.

### Step F — Phase 7 (Local Domain Setup)
1. Update [infra/nginx/nginx.conf](infra/nginx/nginx.conf) `server_name` to `read.local` (keep a catch-all fallback for direct IP/localhost access during development).
2. Add setup documentation (new dev-facing `README.md` section or `docs/local-domain.md`) describing the `/etc/hosts` entry (`127.0.0.1 read.local`) and Docker Compose usage.
3. Optional: document/add mkcert-based HTTPS termination in nginx for `https://read.local`.
4. Rename or restructure the current [README.md](README.md) prompt pack (e.g., move to `docs/copilot-prompts.md`) and write a real project README covering setup, running, and architecture.

**Acceptance:** `http://read.local` resolves and serves the app end-to-end after the documented hosts-file change; prompt pack content is preserved but no longer masquerading as the main README.

### Step G (Optional/Backlog) — Phase 8 Enhancements
Not required for MVP per SPEC; track separately if pursued: PWA installability, offline reading, full-text search, sync.

---

## 4. Suggested Execution Order

1. Step A (finish ingestion correctness) — closes the last correctness gap in already-shipped functionality.
2. Step B (prev/next nav) — small, high-value UX completion for Phase 3.
3. Step C (tagging) — largest net-new feature; unlocks Phase 4 success criteria.
4. Step D (dark mode + keyboard nav) — polish once core interactions are stable.
5. Step E (sharing/export) — additive, no dependencies on other steps.
6. Step F (local domain + docs) — infra/documentation, can happen in parallel with any step above.

Per user preference, each step should be implemented and confirmed individually before moving to the next.
