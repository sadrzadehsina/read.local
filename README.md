# Copilot Prompt Pack — Local Newsletter Reader App

This file contains **phase-by-phase prompts** designed to be pasted directly into GitHub Copilot Chat (or any AI coding agent) to incrementally build the system.

Each phase is independent and assumes previous phases are completed.

---

# GLOBAL INSTRUCTIONS (apply to all phases)

When implementing:
- Prefer minimal, working implementation over over-engineering
- Keep services modular but simple
- Use SQLite + Prisma
- Ensure everything runs via Docker Compose
- Do NOT add features outside the current phase
- Every phase must be runnable independently
- Use TypeScript where possible
- Prefer clarity over abstraction

---

# PHASE 0 — Project Bootstrap

## Copilot Prompt

You are building a local-first newsletter reader app.

Create a full monorepo structure with:
- frontend (React or Next.js)
- backend (Node.js API using Fastify or Express)
- worker (Node.js ingestion service)
- database (SQLite via Prisma)
- docker-compose setup for all services

Requirements:
- Everything must run locally via Docker Compose
- Include a basic reverse proxy (nginx or traefik)
- Add health check endpoints for backend and worker
- Create a shared types package (optional but recommended)

Output:
- folder structure
- minimal working frontend page
- minimal backend API `/health`
- docker-compose.yml working

Do NOT implement business logic yet.

---

# PHASE 1 — Source Management (Newsletter URLs)

## Copilot Prompt

Implement newsletter "Source" management.

A Source represents a newsletter/feed URL.

Backend:
- Create Prisma model: Source { id, url, title, createdAt }
- Create API endpoints:
  - POST /sources (create source from URL)
  - GET /sources (list all sources)

Frontend:
- Create UI form to add a newsletter URL
- Display list of sources like folders/sidebar items
- Clicking a source should open a placeholder detail page

Rules:
- No ingestion yet
- No posts yet
- Just CRUD sources

Ensure Docker still works.

---

# PHASE 2 — Ingestion Engine (RSS + HTML parsing)

## Copilot Prompt

Build ingestion system for newsletter sources.

Backend worker service must:
- Fetch source URL
- Detect type:
  - RSS feed → use rss-parser
  - HTML page → use readability extraction
- Extract posts with:
  - title
  - content
  - published date
  - original URL
- Store posts in database

Prisma models:
- Post { id, sourceId, title, content, originalUrl, publishedAt }

Rules:
- Deduplicate posts by originalUrl
- Worker runs automatically when new source is created
- Add simple queue mechanism (can be in-memory for now)

Do NOT build UI changes yet except showing empty posts list.

---

# PHASE 3 — Reader Experience (Core UI)

## Copilot Prompt

Implement the reading experience.

Frontend:
- Source page shows list of posts
- Clicking a post opens reader view
- Reader view shows:
  - title
  - content (rendered HTML safely)
  - published date
- Add "Open original in browser" button

Backend:
- GET /sources/:id/posts
- GET /posts/:id

Rules:
- UI should be minimal and clean
- Focus on readability (like Medium / email reader)

No tagging yet.

---

# PHASE 4 — Tagging System

## Copilot Prompt

Add tagging system for posts.

Backend:
- Prisma models:
  - Tag { id, name }
  - PostTag { postId, tagId }
- Endpoints:
  - POST /posts/:id/tags
  - DELETE /posts/:id/tags/:tagId
  - GET /tags

Frontend:
- UI to add/remove tags on a post
- Tag list in sidebar or filter bar
- Filter posts by tag

Rules:
- Tags are global and reusable
- Support autocomplete when adding tags

---

# PHASE 5 — UI/UX Polish

## Copilot Prompt

Improve UI/UX of the application.

Requirements:
- Add dark mode + light mode
- Make layout responsive (mobile-first)
- Improve typography for reading mode
- Add keyboard navigation:
  - j/k for next/previous post
- Improve spacing and readability
- Ensure mobile usability is excellent

No new backend features.

---

# PHASE 6 — Sharing & Export

## Copilot Prompt

Implement sharing features.

Backend/Frontend:
- Copy link to post (local URL)
- Export post as HTML
- Export post as Markdown
- Export full source (all posts) as JSON bundle

Rules:
- Sharing is local-only
- No external services

Add UI buttons in reader view.

---

# PHASE 7 — Local Domain + Docker Networking

## Copilot Prompt

Configure the system to run on a local domain.

Requirements:
- Use nginx or traefik reverse proxy
- Expose frontend at: http://read.local
- Map domain via docker networking
- Update docker-compose accordingly
- Add instructions for /etc/hosts:
  127.0.0.1 read.local

Optional:
- Add HTTPS using mkcert (only if simple)

Ensure all services communicate correctly in Docker.

---

# PHASE 8 — Optional Enhancements

## Copilot Prompt

Add optional enhancements without breaking core system:

- Full-text search over posts
- PWA support (installable app)
- Offline caching for recent posts
- Performance improvements (caching ingestion results)

Do NOT refactor core architecture.

---

# FINAL RULE

At all times:
- Keep app local-first
- Keep Docker as the only deployment method
- Avoid introducing external dependencies unless necessary
- Ensure each phase remains stable and runnable
