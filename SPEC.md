# Local Newsletter Reader App — Implementation Specification

## 1. Overview

This project is a **local-first newsletter reader application** designed to:
- Aggregate newsletters from URLs (RSS or HTML sources)
- Organize them into “sources” (folder-like structure)
- Provide a clean, minimal reading experience
- Allow tagging, sharing, and external access
- Run entirely locally using Docker
- Be accessible via a local domain (`read.local` or `read.dev` via override)

The system is designed for Copilot-assisted development in a phased, incremental way.

---

## 2. Goals

### Primary Goals
- Paste a newsletter URL → system creates a source
- Fetch and store newsletter posts/articles
- Provide a clean reader UI per post
- Organize posts by source (folder-like experience)
- Allow tagging and filtering
- Support sharing and external opening
- Fully Dockerized local deployment

### Secondary Goals
- Mobile responsive UI
- Dark/light theme
- Local domain routing
- Optional PWA installability

---

## 3. Non-Goals (MVP)

- No cloud hosting
- No multi-user system
- No authentication (initially)
- No recommendation engine
- No social features
- No email sending

---

## 4. High-Level Architecture

### Components

1. **Frontend (Web App)**
   - React (Next.js or Vite)
   - TailwindCSS + shadcn/ui
   - Reader UI + source navigation

2. **Backend API**
   - Node.js (Fastify or Next.js API routes)
   - Handles:
     - Source creation
     - Post storage
     - Tagging
     - Fetch requests

3. **Worker Service (Ingestion Engine)**
   - Fetches newsletter content
   - Parses RSS / HTML / dynamic pages
   - Cleans content using readability tools
   - Stores structured posts

4. **Database**
   - SQLite (local-first simplicity)
   - ORM: Prisma recommended

5. **Reverse Proxy**
   - Nginx or Traefik
   - Handles `read.local` routing

6. **Docker Compose**
   - Orchestrates all services

---

## 5. Data Model

### Source
Represents a newsletter/feed.

- id (uuid)
- url (string)
- title (string)
- type (rss | html | unknown)
- created_at (datetime)

### Post
Represents a single newsletter entry.

- id (uuid)
- source_id (foreign key)
- title (string)
- content (html or markdown cleaned)
- original_url (string)
- published_at (datetime)
- created_at (datetime)

### Tag
- id (uuid)
- name (string, unique)

### PostTag (join table)
- post_id
- tag_id

---

## 6. Core Features Specification

### 6.1 Add Newsletter Source
- Input: URL
- System detects:
  - RSS feed OR HTML page
- Creates source entry
- Triggers ingestion job

### 6.2 Ingestion Engine
- Fetch content from source
- Parse:
  - RSS: xml parser
  - HTML: readability extraction
  - JS-heavy pages: Playwright fallback
- Normalize into Post objects
- Deduplicate posts

### 6.3 Source View (“Folder UI”)
- List all sources
- Clicking a source shows:
  - All posts in chronological order
- Acts like a folder in UI

### 6.4 Post Reader View
- Full content display
- Minimal UI
- Supports:
  - next/previous post navigation
  - open original link

### 6.5 Open in Browser
- Button:
  - open post.original_url in system browser

### 6.6 Tagging System
- Add/remove tags per post
- Filter posts by tag
- Tag autocomplete supported

### 6.7 Sharing
- Copy link (local route)
- Export post as HTML/Markdown
- Optional: export full source bundle

---

## 7. UI/UX Requirements

### Design Principles
- Minimal UI
- Reader-first experience
- No clutter
- Fast navigation

### Layout

#### Desktop
- Left sidebar: sources
- Middle: post list
- Right: reader view

#### Mobile
- Single column navigation
- Swipe/back navigation

### Theme
- Light mode
- Dark mode (system-aware default)

---

## 8. Local Development & Deployment

### Docker Compose Setup

Services:
- frontend
- backend
- worker
- database
- reverse proxy

### Local Domain
- Preferred: `read.local`
- Alternative: `read.dev` (requires HTTPS + mkcert)

Setup:
- hosts file mapping:
  127.0.0.1 read.local
- Reverse proxy routes traffic to frontend container

---

## 9. Suggested Tech Stack

### Frontend
- Next.js OR React (Vite)
- TailwindCSS
- shadcn/ui
- React Query (data fetching)

### Backend
- Node.js
- Fastify or Express
- Prisma ORM

### Worker
- Node.js
- Playwright (fallback scraping)
- rss-parser

### DB
- SQLite (default)
- Optional upgrade: Postgres

### Infra
- Docker + Docker Compose
- Traefik or Nginx

---

## 10. Phased Implementation Plan

---

# PHASE 0 — Project Setup

### Tasks
- Initialize monorepo
- Setup Docker Compose
- Setup base folder structure
- Setup database (SQLite + Prisma)
- Setup basic API server
- Setup frontend shell

### Deliverable
- App runs locally with empty UI

---

# PHASE 1 — Source Management

### Tasks
- API: create source (URL input)
- Store sources in DB
- Basic frontend form
- List sources in UI

### Deliverable
- User can add newsletter URL and see it listed

---

# PHASE 2 — Ingestion Engine

### Tasks
- Implement RSS parser
- Implement HTML parser (readability)
- Worker service for ingestion
- Store posts in DB
- Deduplication logic

### Deliverable
- Sources automatically populate posts

---

# PHASE 3 — Reader Experience

### Tasks
- Post list per source
- Full reader view
- Navigation between posts
- Open original URL feature

### Deliverable
- Functional newsletter reading experience

---

# PHASE 4 — Tagging System

### Tasks
- Add tags table
- Tag assignment UI
- Filter posts by tag
- Tag autocomplete

### Deliverable
- Fully taggable posts

---

# PHASE 5 — UX & UI Polish

### Tasks
- Dark mode support
- Responsive mobile layout
- Reader typography improvements
- Keyboard navigation

### Deliverable
- Clean production-level UI

---

# PHASE 6 — Sharing System

### Tasks
- Copy link feature
- Export post as HTML
- Export source bundle
- Shareable local URLs

---

# PHASE 7 — Local Domain Setup

### Tasks
- Configure reverse proxy
- Setup `read.local`
- Optional HTTPS (mkcert)
- Route frontend via domain

---

# PHASE 8 — Optional Enhancements

- PWA support
- Offline reading
- Search engine (full-text search)
- Sync system (future)
- Performance caching layer

---

## 11. Copilot Instructions (IMPORTANT)

When implementing:
- Always prioritize MVP functionality first
- Do not over-engineer early phases
- Keep services modular but minimal
- Prefer SQLite over external DB
- Ensure each phase is independently runnable
- Avoid adding features not in current phase

---

## 12. Success Criteria

MVP is successful when:
- User can add newsletter URL
- Posts are fetched and stored
- Posts are readable in clean UI
- Sources behave like folders
- System runs fully in Docker locally
