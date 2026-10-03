# Newtonite — Work Management System

An internal operational work-management system engineered for the **Newtonite Software Engineering Challenge**.

Newtonite enables cross-functional teams to log, assign, investigate, resolve, and audit mission-critical operational work items. The system guarantees transactional integrity, concurrency protection, idempotency, and fine-grained resource-level authorization even under simultaneous high-frequency employee interaction.

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Technology Stack](#technology-stack)
3. [Core Engineering Solutions (Beyond CRUD)](#core-engineering-solutions-beyond-crud)
   - [1. Concurrent Assignment Protection](#1-concurrent-assignment-protection)
   - [2. Optimistic Concurrency & Stale Updates](#2-optimistic-concurrency--stale-updates)
   - [3. Idempotent Mutation Processing](#3-idempotent-mutation-processing)
   - [4. Multi-Tier Resource Authorization](#4-multi-tier-resource-authorization)
   - [5. Atomic Audit & History Log](#5-atomic-audit--history-log)
4. [Data Model & Schema](#data-model--schema)
5. [Prerequisites & Local Environment](#prerequisites--local-environment)
6. [Database Setup & Migrations](#database-setup--migrations)
7. [Running the Application](#running-the-application)
8. [Demo Credentials & Seed Data](#demo-credentials--seed-data)
9. [Automated Testing Suite](#automated-testing-suite)
10. [API Reference](#api-reference)
11. [User Interface Overview](#user-interface-overview)

---

## System Architecture

Newtonite is designed as a **high-performance local-first monolith**:
- **Backend Service:** Node.js + Express + TypeScript running on port `3001` with raw parameterized PostgreSQL queries via `pg` connection pooling for maximum throughput, sub-millisecond query execution, and zero ORM overhead.
- **Frontend SPA:** React 18 + TypeScript + Vite + Tailwind CSS running on port `5173`. Uses TanStack React Query for caching, automatic background refetching, and optimistic UI reconciliation.
- **Database:** PostgreSQL 14+ with strict relational integrity, composite unique constraints, specialized indexes (GIN, B-Tree), and enum types.

```
┌────────────────────────────────────────────────────────┐
│                   React 18 SPA (Vite)                  │
│       TanStack Query · Tailwind CSS · React Router     │
└───────────────────────────┬────────────────────────────┘
                            │ /api reverse-proxy
┌───────────────────────────▼────────────────────────────┐
│                  Express Backend (TypeScript)          │
│   Auth Middleware · Zod Validation · Idempotency Store │
└───────────────────────────┬────────────────────────────┘
                            │ Connection Pool (pg)
┌───────────────────────────▼────────────────────────────┐
│                    PostgreSQL 14+                      │
│   Transactions (BEGIN/COMMIT) · SELECT FOR UPDATE      │
│   work_items · work_item_events · idempotency_keys     │
└────────────────────────────────────────────────────────┘
```

---

## Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Frontend** | React 18, TypeScript, Vite | Fast HMR, type safety, modular component tree |
| **Styling** | Tailwind CSS, Lucide Icons | Responsive enterprise layout, clear design tokens |
| **Client State** | TanStack React Query v5 | Cache invalidation, query deduplication, polling |
| **Backend** | Node.js, Express, TypeScript | Lightweight, deterministic asynchronous runtime |
| **Database** | PostgreSQL 14+ (`pg` pool) | ACID compliance, row-level locking (`FOR UPDATE`), JSONB |
| **Auth** | JWT (`jsonwebtoken`), `bcryptjs` | Stateless session verification with DB user validation |
| **Validation** | Zod v3 | Strict runtime request body and query param parsing |
| **Testing** | Vitest v2, Supertest v7 | Fast parallel integration tests against live DB |

---

## Core Engineering Solutions (Beyond CRUD)

This platform tackles four mission-critical operational challenges where naive CRUD fails:

### 1. Concurrent Assignment Protection
- **The Problem:** Two support agents open an unassigned critical outage ticket simultaneously and click "Assign to me". Without safeguards, both believe they own the ticket, or a race condition silently overwrites the owner.
- **Implementation:** 
  - Every assignment request invokes an isolated database transaction (`withTransaction`).
  - The row is locked using `SELECT wi.* FROM work_items wi WHERE wi.id = $1 FOR UPDATE`.
  - The server verifies:
    1. If the item is already assigned to a different user, it immediately aborts with `HTTP 409 Conflict` (`ALREADY_ASSIGNED`).
    2. Atomic conditional update: `UPDATE work_items SET assignee_id = $1, version = version + 1 WHERE id = $2 AND version = $3`.
    3. If zero rows match, a concurrent transaction modified it, returning `HTTP 409 Conflict`.
- **Client Handling:** The UI detects `409`, notifies the user with an actionable alert, and automatically refetches the latest server state.

### 2. Optimistic Concurrency & Stale Updates
- **The Problem:** User A and User B open version `7` of a ticket. User A updates the priority to `CRITICAL` (incrementing DB version to `8`). User B then changes the status to `IN_PROGRESS` sending stale version `7`. User B's change must **never** silently overwrite User A's priority update.
- **Implementation:**
  - Every work item carries an integer `version` field.
  - All mutating endpoints (`PATCH /api/work-items/:id`, `POST /assign`) require the current `version` in the payload.
  - The mutation updates only if `version = $currentVersion` and increments `version = version + 1`.
  - If a version mismatch occurs: `HTTP 409 Conflict` with `{ error: "This item was modified by another user. Refresh and try again.", code: "STALE_VERSION" }`.

### 3. Idempotent Mutation Processing
- **The Problem:** Unstable mobile networks or rapid double-clicks re-send identical mutation requests (e.g., ticket creation or comment posting), leading to duplicate tickets or repeated charges/actions.
- **Implementation:**
  - Clients can attach an `Idempotency-Key: <unique-uuid>` HTTP header.
  - The backend stores executed requests in an atomic `idempotency_keys` table keyed by `(key, user_id)`.
  - On receiving a request:
    1. Inside the transaction, query `idempotency_keys` for `(key, user_id)`.
    2. If found, return the exact cached response with `HTTP 200 OK` without re-executing logic, without modifying data, and without emitting duplicate audit events.
    3. If new, execute the mutation, persist the response JSONB to `idempotency_keys`, and commit.

### 4. Multi-Tier Resource Authorization
- **The Problem:** Frontend-only checks can easily be bypassed by crafting direct curl/Postman calls.
- **Implementation:**
  - **Server-enforced boundaries:**
    - Authentication verifies the JWT signature and queries the user record in PostgreSQL to confirm active status.
    - **Resource scoping:** Agents and managers only have access to work items belonging to teams they are actively assigned to (`team_members` join).
    - Attempts to view or mutate out-of-team work items yield `HTTP 404 Not Found` (preventing ID enumeration) or `HTTP 403 Forbidden`.
    - **Role Privileges:**
      - `ADMIN`: Broad read/write access across all teams.
      - `MANAGER`: Full management of items belonging to their assigned teams (including re-assigning, team migration).
      - `AGENT`: Can create and view team items; can update status and assignment on items they created or are assigned to.

### 5. Atomic Audit & History Log
- **The Problem:** State changes succeed but audit logging crashes, leaving an untraceable discrepancy.
- **Implementation:**
  - State changes and audit entries into `work_item_events` execute in the **exact same PostgreSQL transaction**.
  - If an audit record fails to insert, the work item change is rolled back.
  - Events capture: `work_item_id`, `actor_id`, `event_type`, `old_value`, `new_value`, `metadata`, and timestamp.
  - The log is strictly append-only (immutable).

---

## Data Model & Schema

```sql
-- Users
users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Teams
teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Team Membership & Roles
team_members (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  role team_role NOT NULL DEFAULT 'AGENT', -- ADMIN | MANAGER | AGENT
  PRIMARY KEY (user_id, team_id)
);

-- Work Items
work_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  status work_status NOT NULL DEFAULT 'OPEN', -- OPEN | INVESTIGATING | IN_PROGRESS | WAITING_APPROVAL | RESOLVED | CLOSED
  priority work_priority NOT NULL DEFAULT 'MEDIUM', -- LOW | MEDIUM | HIGH | CRITICAL
  team_id UUID REFERENCES teams(id),
  assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by_id UUID REFERENCES users(id),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comments
comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id UUID REFERENCES work_items(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Immutable Audit Log
work_item_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id UUID REFERENCES work_items(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users(id),
  event_type TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Idempotency Records
idempotency_keys (
  key TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  request_hash TEXT NOT NULL,
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (key, user_id)
);
```

---

## Prerequisites & Local Environment

- **Node.js:** v18.0.0 or later (v20+ recommended)
- **npm:** v8.0.0 or later
- **PostgreSQL:** v14.0 or later

### Environment Configuration

The server configuration resides in `server/.env`. A ready template is provided at `server/.env.example`:

```env
DATABASE_URL=postgresql://newtonite:newtonite@localhost:5432/newtonite
JWT_SECRET=your-super-secret-jwt-key-change-in-production-min-32-chars
JWT_EXPIRES_IN=7d
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
```

---

## Database Setup & Migrations

### 1. Start PostgreSQL Service
```bash
# macOS (Homebrew)
brew services start postgresql@14

# Linux (systemd)
sudo systemctl start postgresql
```

### 2. Create Database & User
```bash
psql postgres -c "CREATE DATABASE newtonite;"
psql postgres -c "CREATE USER newtonite WITH PASSWORD 'newtonite';"
psql postgres -c "GRANT ALL PRIVILEGES ON DATABASE newtonite TO newtonite;"

# For PostgreSQL 15+:
psql postgres -c "GRANT ALL ON SCHEMA public TO newtonite;"
```

### 3. Run Migrations
Creates all tables, enums, triggers, and performance indexes:
```bash
cd server
npm run db:migrate
```

### 4. Seed Demo Data
Populates 6 users, 3 teams, 15 realistic operational work items, comments, and audit history:
```bash
cd server
npm run db:seed
```

---

## Running the Application

### Development Mode

**Terminal 1 — Backend (Port 3001):**
```bash
cd server
npm run dev
```

**Terminal 2 — Frontend (Port 5173):**
```bash
cd client
npm run dev
```

Open **[http://localhost:5173](http://localhost:5173)** in your browser.

### Root Shortcut Commands
You can also use root scripts from the project root:
```bash
npm run install:all    # Installs both server & client
npm run db:migrate     # Runs schema migrations
npm run db:seed        # Seeds demo records
npm run test           # Executes the automated test suite
npm run build          # Compiles server TypeScript and client bundle
```

---

## Demo Credentials & Seed Data

| Role | Name | Email | Password | Assigned Teams |
|---|---|---|---|---|
| **Admin** | Alice Admin | `alice@newtonite.com` | `admin123` | Platform, Support, Security (All) |
| **Manager** | Marcus Manager | `marcus@newtonite.com` | `password123` | Platform, Support |
| **Agent** | Rahul Agent | `rahul@newtonite.com` | `password123` | Platform, Support |
| **Agent** | Priya Agent | `priya@newtonite.com` | `password123` | Platform, Security |
| **Agent** | Sam Support | `sam@newtonite.com` | `password123` | Customer Support |
| **Agent** | Divya Dev | `divya@newtonite.com` | `password123` | Platform Engineering |

---

## Automated Testing Suite

The project includes an end-to-end integration test suite using **Vitest** and **Supertest** running against the live database:

```bash
cd server
npm test
```

### Test Cases Covered:
1. **TEST 1 — Concurrent Assignment:** Two simultaneous assignment requests on the same unassigned item. Asserts exactly one returns `200` and the other returns `409 Conflict`.
2. **TEST 2 — Stale Update Protection:** Client A updates version `1` to version `2`. Client B tries to update using version `1`. Asserts Client B receives `409 Conflict` (`STALE_VERSION`) and Client A's data remains intact.
3. **TEST 3 — Multi-Tier Authorization:**
   - Unauthenticated requests receive `401`.
   - Accessing a work item from a team the user does not belong to returns `404` (preventing ID disclosure).
   - Creating a work item for an unauthorized team returns `403`.
4. **TEST 4 — Idempotency Integrity:** Same payload submitted twice with the same `Idempotency-Key`. Asserts only one work item is inserted, only one audit event is persisted, and the second call returns the original cached response.
5. **TEST 5 — Audit History Creation:** Status and priority updates verify corresponding `STATUS_CHANGED` and `COMMENTED` audit log entries with previous and new values.
6. **E2E Smoke Workflow:** Full lifecycle: Login → Dashboard → Create item → View item → Assign → Status change → Priority change → Comment → Verify audit trail → Search & filter.

---

## API Reference

All protected endpoints require the header `Authorization: Bearer <token>`.

### Authentication
- `POST /api/auth/login` — Authenticate user and receive JWT + user profile.
- `GET /api/auth/me` — Retrieve active user session and team memberships.

### Work Items
- `GET /api/work-items` — Paginated list with server-side filters:
  - Query parameters: `page`, `limit`, `search`, `status`, `priority`, `teamId`, `assigneeId`, `sort`, `order`.
- `POST /api/work-items` — Create work item. Supports `Idempotency-Key` header.
- `GET /api/work-items/dashboard/summary` — Aggregate status counts, priority metrics, active items, and recent activity.
- `GET /api/work-items/:id` — Retrieve work item detail, comment thread, and audit history.
- `PATCH /api/work-items/:id` — Update work item (requires `version`). Supports `Idempotency-Key`.
- `POST /api/work-items/:id/assign` — Assign or reassign work item atomically (requires `version`).
- `POST /api/work-items/:id/comments` — Post comment and emit audit entry. Supports `Idempotency-Key`.
- `GET /api/work-items/:id/history` — Fetch complete audit trail.

### Teams & Users
- `GET /api/teams` — List teams accessible to the current user.
- `GET /api/users` — List team members (supports `?teamId=<id>`).

---

## User Interface Overview

The UI is built to look and feel like an enterprise-grade operational internal tool:
- **Interactive Dashboard:** Live counts of active, critical, and assigned items, breakdown charts by status/priority, personal work queue, and a unified recent activity feed.
- **Work Items Table:** Instant debounced search, status/priority/team/assignee filters, sort order, and server-side pagination.
- **Detail View:**
  - Header with live status and priority tags.
  - Quick action transition buttons (`Start Investigating`, `Mark In Progress`, `Request Approval`, `Mark Resolved`, `Close`).
  - Dropdown selectors for inline status, priority, and assignment updates with automatic conflict handling.
  - Tabbed interface switching between **Comments** (threaded discussions) and **History** (immutable audit timeline).
- **Graceful Error States:** Clear 409 conflict alerts prompting to refresh rather than silently discarding user intent.