# Newtonite — Operational Work Management System

> **Newtonite Software Engineering Challenge · Operations Under Pressure**

An internal operational work-management system for teams to **create, assign, investigate, resolve, collaborate on, and audit operational work**.

Newtonite is designed around the parts of the challenge where a simple CRUD application is not enough: **authorization, concurrent actions, stale data, idempotent mutations, transactional history, server-side filtering, and operational visibility**.

---

## 🎥 Project Demo

**YouTube walkthrough:** https://youtu.be/R-nrlxun-Bo

> The demo will walk through authentication, team-based authorization, work-item lifecycle, concurrent assignment, stale-update protection, idempotency, audit history, search/filtering, and the test suite.

---

## ✨ What This Project Demonstrates

| Engineering area | Implementation |
|---|---|
| Authentication | JWT-based authentication with active-user validation |
| Authorization | Server-enforced role + team/resource authorization |
| Concurrency | PostgreSQL transactions, row locking, optimistic version checks |
| Stale data | Version-based optimistic concurrency control |
| Duplicate requests | Idempotency keys persisted per user |
| Auditability | Transactional, append-only work-item event history |
| Search | Server-side search and filtering |
| Scale-aware reads | Pagination and targeted aggregate queries |
| Validation | Runtime request validation with Zod |
| Testing | Vitest + Supertest integration tests |
| Frontend state | TanStack React Query for caching/refetching |
| Database | PostgreSQL with relational constraints and indexes |

---

# 1. Problem

Operational work is often coordinated through chat, spreadsheets, email, and direct conversations. That becomes difficult when:

- many people work on the same request;
- ownership changes;
- urgent items compete for attention;
- approvals are required;
- two users act on the same item simultaneously;
- one user edits an item while another is viewing an older version;
- repeated requests can accidentally create duplicate actions;
- managers need to understand what is active and what changed.

Newtonite turns those workflows into a centralized operational system with explicit ownership, state, history, authorization, and conflict handling.

---

# 2. Architecture

Newtonite uses a **modular monolith** architecture: a React SPA communicates with an Express API, which owns authorization, validation, business rules, transactions, and persistence in PostgreSQL.

```mermaid
flowchart TD
    U[User / Browser]

    F[React 18 + TypeScript<br/>Vite + Tailwind CSS<br/>TanStack React Query]
    A[Express API<br/>Node.js + TypeScript]
    AUTH[Authentication & Authorization]
    VAL[Zod Validation]
    TX[Transactional Business Logic<br/>Concurrency + Idempotency + Audit]
    DB[(PostgreSQL)]

    U --> F
    F -->|REST /api| A
    A --> AUTH
    A --> VAL
    A --> TX
    TX -->|pg connection pool| DB
```

### Why a modular monolith?

For this challenge, the main risks are correctness and maintainability rather than service-count. Keeping the application in one deployable backend makes transactions, authorization, testing, and local development straightforward while leaving room to split bounded workloads later if scale requires it.

### Request flow

```mermaid
sequenceDiagram
    participant B as Browser
    participant API as Express API
    participant DB as PostgreSQL

    B->>API: HTTP request + JWT
    API->>API: Authenticate user
    API->>API: Validate request
    API->>API: Check team/resource permissions
    API->>DB: Transaction / targeted query
    DB-->>API: Result
    API-->>B: JSON response
    B->>B: Update/refetch cached state
```

---

# 3. Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React 18 + TypeScript | Component-based SPA |
| Build | Vite | Development server and production bundling |
| Styling | Tailwind CSS | Responsive internal-tool UI |
| Client state | TanStack React Query | Server-state caching, refetching, query management |
| Backend | Node.js + Express + TypeScript | REST API and business logic |
| Database | PostgreSQL 14+ | ACID transactions and relational integrity |
| Database driver | `pg` | Connection pooling and parameterized queries |
| Authentication | JWT + bcryptjs | Authentication and password hashing |
| Validation | Zod | Runtime request validation |
| Testing | Vitest + Supertest | Integration and API testing |

---

# 4. Critical Engineering Behaviours — Beyond CRUD

The challenge requires correctness in situations where naive CRUD is insufficient. Newtonite deliberately implements five such behaviours.

## 4.1 Concurrent Assignment Protection

### Problem

Two users may open the same unassigned work item and select **Assign to me** at nearly the same time.

Without server-side protection, both requests could believe they succeeded.

### Solution

Assignment is performed inside a PostgreSQL transaction.

```mermaid
sequenceDiagram
    participant A as User A
    participant B as User B
    participant DB as PostgreSQL

    A->>DB: BEGIN + SELECT ... FOR UPDATE
    B->>DB: BEGIN + SELECT ... FOR UPDATE
    DB-->>A: Row lock acquired
    A->>DB: Assign item + increment version
    DB-->>A: COMMIT
    DB-->>B: Row now reflects assignment
    B->>B: Reject conflicting assignment
    B-->>B: HTTP 409 Conflict
```

The server:

1. starts a transaction;
2. locks the work-item row using `SELECT ... FOR UPDATE`;
3. checks current ownership;
4. performs the assignment;
5. increments the version;
6. records the audit event in the same transaction.

A competing assignment receives a conflict instead of silently overwriting ownership.

---

## 4.2 Optimistic Concurrency / Stale Update Protection

### Problem

Two users can load version `7` of the same item.

```text
User A reads version 7
User B reads version 7

User A updates → version 8

User B submits an update using version 7
```

User B's stale update must not silently overwrite User A's change.

### Solution

Each work item contains an integer `version`.

Mutating requests include the version the client last observed.

```mermaid
sequenceDiagram
    participant A as User A
    participant B as User B
    participant DB as PostgreSQL

    A->>DB: Update WHERE version = 7
    DB-->>A: Success → version 8

    B->>DB: Update WHERE version = 7
    DB-->>B: 0 rows / stale version
    B-->>B: HTTP 409 STALE_VERSION
```

The client then refetches the latest server state and informs the user rather than silently discarding the conflict.

---

## 4.3 Idempotent Mutation Processing

### Problem

A request can be retried because of a network failure, timeout, rapid double-click, or uncertain client state.

Without idempotency, the same logical operation could execute twice.

### Solution

Clients can send:

```http
Idempotency-Key: <unique-request-id>
```

The server persists the key together with the authenticated user, request hash, and response.

```mermaid
flowchart TD
    R[Mutation request] --> K{Idempotency key exists?}

    K -->|No| N[Execute mutation]
    N --> S[Persist response + key]
    S --> C[Commit]

    K -->|Yes| E{Existing key?}
    E -->|No| N
    E -->|Yes| H[Return stored response]
```

The intended result is that retrying the same mutation does not create duplicate records or duplicate audit events.

---

## 4.4 Resource-Level Authorization

Authentication alone is not enough.

A user may belong to multiple teams and therefore have access to different sets of work items.

Authorization is enforced **on the server**, rather than relying on hidden frontend controls.

### Role model

| Role | Responsibility |
|---|---|
| `ADMIN` | Broad access across teams |
| `MANAGER` | Management of work belonging to assigned teams |
| `AGENT` | Work with items within their permitted team scope and assigned/created items according to the API rules |

### Resource boundary

```mermaid
flowchart LR
    JWT[Authenticated User]
    TEAM[Team Membership]
    ROLE[Role]
    ITEM[Requested Work Item]
    DECISION{Authorized?}

    JWT --> TEAM
    TEAM --> ROLE
    ROLE --> DECISION
    ITEM --> DECISION

    DECISION -->|Yes| ALLOW[Perform operation]
    DECISION -->|No| DENY[Reject request]
```

This prevents a user from bypassing UI restrictions by directly calling the API.

---

## 4.5 Atomic Audit & History

Important state changes should not disappear.

For mutations such as status, priority, assignment, and comments, the state change and its corresponding audit event are written within the same PostgreSQL transaction.

```mermaid
flowchart TD
    START[Mutation] --> TX[BEGIN TRANSACTION]
    TX --> UPDATE[Update work item]
    UPDATE --> EVENT[Insert audit event]
    EVENT --> CHECK{Both succeed?}
    CHECK -->|Yes| COMMIT[COMMIT]
    CHECK -->|No| ROLLBACK[ROLLBACK]
    COMMIT --> DONE[Consistent state + history]
    ROLLBACK --> FAIL[No partial mutation]
```

Audit events capture information such as:

- work-item ID;
- actor;
- event type;
- previous value;
- new value;
- metadata;
- timestamp.

---

# 5. Data Model

The core relational model is intentionally simple and supports the operational workflows directly.

```mermaid
erDiagram
    USERS ||--o{ TEAM_MEMBERS : belongs_to
    TEAMS ||--o{ TEAM_MEMBERS : contains

    TEAMS ||--o{ WORK_ITEMS : owns
    USERS ||--o{ WORK_ITEMS : creates
    USERS ||--o{ WORK_ITEMS : assigned_to

    WORK_ITEMS ||--o{ COMMENTS : has
    USERS ||--o{ COMMENTS : writes

    WORK_ITEMS ||--o{ WORK_ITEM_EVENTS : records
    USERS ||--o{ WORK_ITEM_EVENTS : performs

    USERS ||--o{ IDEMPOTENCY_KEYS : owns

    USERS {
        uuid id PK
        string name
        string email
        string password_hash
        boolean is_admin
    }

    TEAMS {
        uuid id PK
        string name
    }

    TEAM_MEMBERS {
        uuid user_id PK
        uuid team_id PK
        enum role
    }

    WORK_ITEMS {
        uuid id PK
        string title
        string description
        enum status
        enum priority
        uuid team_id FK
        uuid assignee_id FK
        uuid created_by_id FK
        int version
        timestamp created_at
        timestamp updated_at
    }

    COMMENTS {
        uuid id PK
        uuid work_item_id FK
        uuid user_id FK
        string body
        timestamp created_at
    }

    WORK_ITEM_EVENTS {
        uuid id PK
        uuid work_item_id FK
        uuid actor_id FK
        string event_type
        string old_value
        string new_value
        json metadata
        timestamp created_at
    }

    IDEMPOTENCY_KEYS {
        string key PK
        uuid user_id PK
        string request_hash
        json response
        timestamp created_at
    }
```

### Work-item lifecycle

The application models:

```text
OPEN
  ↓
INVESTIGATING
  ↓
IN_PROGRESS
  ↓
WAITING_APPROVAL
  ↓
RESOLVED
  ↓
CLOSED
```

The UI exposes workflow actions such as **Start Investigating**, **Mark In Progress**, **Request Approval**, **Mark Resolved**, and **Close**.

---

# 6. Scale-Aware Design

The challenge describes a system with thousands of registered users, hundreds to a few thousand simultaneous users, many teams, tens of thousands of active work items, and a continually growing history.

Newtonite avoids loading the entire dataset into the browser.

### Read path

- server-side pagination;
- server-side search;
- server-side status/priority/team/assignee filtering;
- targeted work-item queries;
- aggregate dashboard queries;
- PostgreSQL indexes;
- connection pooling.

### Write path

- parameterized SQL;
- transactions for consistency-sensitive operations;
- row locking for assignment;
- optimistic version checks;
- idempotency persistence;
- append-only audit events.

```mermaid
flowchart LR
    UI[Paginated UI]
    API[API]
    IDX[(PostgreSQL Indexes)]
    DB[(PostgreSQL)]

    UI -->|filters + page| API
    API --> IDX
    IDX --> DB
    DB --> API
    API --> UI
```

This keeps the browser payload bounded as the number of records grows.

---

# 7. Dashboard & User Experience

The UI focuses on operational visibility rather than decorative analytics.

### Dashboard

Provides:

- active work;
- critical/high-priority work;
- assigned work;
- status breakdown;
- priority breakdown;
- recent activity;
- personal work queue.

### Work-item list

Supports:

- debounced search;
- status filtering;
- priority filtering;
- team filtering;
- assignee filtering;
- sorting;
- server-side pagination.

### Work-item detail

Provides:

- current status and priority;
- ownership;
- workflow actions;
- comments;
- immutable history;
- conflict feedback;
- inline updates.

When the server detects a conflict, the UI surfaces a clear `409` error and refreshes the latest state rather than pretending the mutation succeeded.

---

# 8. Authentication & Authorization Flow

```mermaid
sequenceDiagram
    participant U as User
    participant API as Express
    participant DB as PostgreSQL

    U->>API: POST /api/auth/login
    API->>DB: Find user
    DB-->>API: User + password hash
    API->>API: Verify bcrypt password
    API-->>U: JWT + user profile

    U->>API: Protected request + Bearer token
    API->>API: Verify JWT
    API->>DB: Validate active user + membership
    DB-->>API: User / team context
    API->>API: Resource + role authorization
    API-->>U: Authorized response / error
```

---

# 9. API Reference

All protected endpoints use:

```http
Authorization: Bearer <token>
```

## Authentication

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/auth/login` | Authenticate and receive JWT |
| `GET` | `/api/auth/me` | Retrieve current user/session |

## Work Items

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/work-items` | Paginated work-item list with filters |
| `POST` | `/api/work-items` | Create work item |
| `GET` | `/api/work-items/dashboard/summary` | Dashboard aggregates |
| `GET` | `/api/work-items/:id` | Work-item detail |
| `PATCH` | `/api/work-items/:id` | Update work item using version |
| `POST` | `/api/work-items/:id/assign` | Atomic assignment/reassignment |
| `POST` | `/api/work-items/:id/comments` | Add comment + audit event |
| `GET` | `/api/work-items/:id/history` | Retrieve audit history |

### List filters

`GET /api/work-items` supports:

```text
page
limit
search
status
priority
teamId
assigneeId
sort
order
```

## Teams & Users

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/teams` | List accessible teams |
| `GET` | `/api/users` | List team members |

---

# 10. Error Handling

The API uses explicit HTTP responses for important failure modes.

| Situation | Response |
|---|---|
| Missing/invalid authentication | `401 Unauthorized` |
| Forbidden team/resource operation | `403 Forbidden` |
| Inaccessible resource | `404 Not Found` where appropriate |
| Stale version | `409 Conflict` / `STALE_VERSION` |
| Assignment race | `409 Conflict` / `ALREADY_ASSIGNED` |
| Invalid request | `400 Bad Request` |
| Validation failure | Structured validation response |

The frontend treats conflict responses as expected concurrency outcomes rather than generic application failures.

---

# 11. Automated Testing

The test suite uses **Vitest + Supertest** against the application/database.

Run:

```bash
npm test
```

The important behaviours covered include:

1. **Concurrent assignment** — simultaneous assignment requests result in one successful assignment and a conflict for the competing request.
2. **Stale update protection** — a stale version is rejected with `409`.
3. **Authorization** — unauthenticated and unauthorized resource access is rejected.
4. **Idempotency** — repeating a mutation with the same idempotency key does not duplicate the operation.
5. **Audit history** — important mutations create corresponding history events.
6. **End-to-end smoke workflow** — login → dashboard → create → view → assign → update → comment → audit → search/filter.

The test strategy focuses on behaviours that would be particularly dangerous if broken, rather than targeting an arbitrary coverage percentage.

---

# 12. Local Setup

## Prerequisites

- Node.js 18+; Node.js 20+ recommended
- npm 8+
- PostgreSQL 14+

## 1. Install dependencies

From the project root:

```bash
npm run install:all
```

## 2. Configure environment

Copy the template:

```bash
cp server/.env.example server/.env
```

Example development configuration:

```env
DATABASE_URL=postgresql://newtonite:newtonite@localhost:5432/newtonite
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=7d
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
```

Do not commit real secrets.

## 3. Create the database

Example local PostgreSQL setup:

```bash
psql postgres -c "CREATE DATABASE newtonite;"
psql postgres -c "CREATE USER newtonite WITH PASSWORD 'newtonite';"
psql postgres -c "GRANT ALL PRIVILEGES ON DATABASE newtonite TO newtonite;"
```

For PostgreSQL 15+ you may also need:

```bash
psql postgres -c "GRANT ALL ON SCHEMA public TO newtonite;"
```

## 4. Run migrations

```bash
npm run db:migrate
```

## 5. Seed demo data

```bash
npm run db:seed
```

The seed creates demo users, teams, operational work items, comments, and history.

## 6. Start the application

Terminal 1:

```bash
npm run dev:server
```

Terminal 2:

```bash
npm run dev:client
```

Open:

```text
http://localhost:5173
```

---

# 13. Demo Credentials

The seed data provides role-based demo accounts.

| Role | Email | Password |
|---|---|---|
| Admin | `alice@newtonite.com` | `admin123` |
| Manager | `marcus@newtonite.com` | `password123` |
| Agent | `rahul@newtonite.com` | `password123` |
| Agent | `priya@newtonite.com` | `password123` |
| Agent | `sam@newtonite.com` | `password123` |
| Agent | `divya@newtonite.com` | `password123` |

> These credentials are intended only for the local seeded development environment.

---

# 14. Useful Root Commands

```bash
# Install server + client dependencies
npm run install:all

# Start backend
npm run dev:server

# Start frontend
npm run dev:client

# Run database migration
npm run db:migrate

# Seed demo data
npm run db:seed

# Run tests
npm test

# Build server + client
npm run build
```

---

# 15. Project Structure

```text
newtonite-work-management/
├── client/
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── lib/
│   │   ├── pages/
│   │   └── types/
│   ├── package.json
│   └── vite.config.ts
│
├── server/
│   ├── src/
│   │   ├── db/
│   │   ├── middleware/
│   │   ├── routes/
│   │   └── index.ts
│   ├── tests/
│   ├── package.json
│   └── vitest.config.ts
│
├── ENGINEERING_DECISIONS.md
├── README.md
├── package.json
├── package-lock.json
├── tsconfig.json
└── tsconfig.base.json
```

---

# 16. Engineering Decisions

The repository includes [`ENGINEERING_DECISIONS.md`](./ENGINEERING_DECISIONS.md), covering the major architectural trade-offs made during the challenge.

The key themes are:

1. modular monolith instead of premature microservices;
2. PostgreSQL transactions for correctness-sensitive operations;
3. optimistic concurrency for stale clients;
4. server-side resource authorization;
5. transactional audit history;
6. idempotent mutation handling;
7. pagination and targeted queries for scale-aware reads.

---

# 17. Security Considerations

The application is designed with several basic security boundaries:

- passwords are stored as hashes;
- JWTs are verified server-side;
- protected endpoints require authentication;
- authorization is enforced by the backend;
- team membership is checked for resource access;
- SQL uses parameterized queries;
- request payloads are validated at runtime;
- secrets are supplied through environment variables;
- `.env` files are excluded from version control;
- inaccessible resources can return `404` to avoid exposing resource existence.

This is an assessment project, not a production security certification.

---

# 18. Known Limitations

This is intentionally a focused first version rather than a production-complete enterprise platform.

Current limitations include:

- local PostgreSQL setup is required;
- JWT authentication is intentionally simple for the assessment;
- there is no external notification/queue subsystem;
- audit history is stored in the same PostgreSQL system;
- the application is a modular monolith rather than independently deployed services;
- production observability, distributed tracing, and infrastructure automation are outside the challenge scope;
- the seeded credentials are development-only credentials.

These are deliberate scope decisions rather than dependencies required for the core correctness model.

---

# 19. If This Grew Significantly

The current architecture provides a reasonable foundation for growth. If workload increased substantially, the next engineering steps would be driven by measured bottlenecks.

Potential evolution:

```mermaid
flowchart LR
    LB[Load Balancer]
    API1[API Instance]
    API2[API Instance]
    API3[API Instance]
    DB[(Primary PostgreSQL)]
    READ[(Read Replicas)]
    QUEUE[Async Job / Queue]
    WORKER[Background Workers]
    OBS[Observability]

    LB --> API1
    LB --> API2
    LB --> API3

    API1 --> DB
    API2 --> DB
    API3 --> DB

    DB --> READ

    API1 --> QUEUE
    API2 --> QUEUE
    API3 --> QUEUE
    QUEUE --> WORKER

    API1 --> OBS
    API2 --> OBS
    API3 --> OBS
    WORKER --> OBS
```

Possible additions would include:

- horizontally scaled API instances;
- read replicas for read-heavy workloads;
- background workers for notifications/enrichment;
- durable queue processing with retry/dead-letter handling;
- centralized observability;
- stronger production secret/session management;
- archival/partitioning strategy for very large audit history.

The important principle is to introduce these components in response to actual workload and failure requirements rather than adding infrastructure prematurely.

---

# 20. What I Would Build Next With Another Week

If the core system were accepted and another week were available, I would prioritize:

### 1. Stronger workflow enforcement

Make allowed status transitions explicit and enforce them server-side.

### 2. Approval authority

Add a dedicated approval action with explicit manager/admin authorization and a corresponding audit event.

### 3. Stronger idempotency semantics

Reject reuse of an idempotency key with a different request payload instead of replaying the original result.

### 4. Better operational attention

Add explicit views for:

- stale work;
- unassigned critical work;
- items waiting for approval;
- overdue/attention-needed work.

### 5. Production observability

Add structured logging, metrics, request correlation IDs, and tracing around the most important mutation paths.

---

# 21. Challenge Requirement Mapping

| Challenge requirement | Newtonite implementation |
|---|---|
| Create/manage operational work | Work-item CRUD + workflow |
| Understand purpose/state/importance/owner/history | Detail view + status/priority/assignment/history |
| Multiple teams | `teams` + `team_members` |
| Meaningful authorization | JWT + role + resource/team checks |
| Collaboration | Comments + audit events |
| Responsibility/priority/workflow history | Immutable work-item events |
| Simultaneous assignment | Transaction + row locking |
| Stale views | Optimistic version checking |
| Repeated requests | Idempotency keys |
| Useful overview | Dashboard aggregates + personal queue |
| Locate relevant work | Search + filters + pagination |
| Growing dataset | Server-side pagination/filtering + indexes |
| Data modelling | Relational PostgreSQL schema |
| API design | REST endpoints with explicit error semantics |
| Frontend state | TanStack React Query |
| Error handling | Structured HTTP errors + conflict handling |
| Data consistency | PostgreSQL transactions |
| Testing | Integration tests for dangerous behaviours |
| Engineering decisions | `ENGINEERING_DECISIONS.md` |
| Known limitations | Documented above |

---

---

## Built for the Newtonite Software Engineering Challenge

The implementation intentionally prioritizes **correctness, explainability, maintainability, and deliberate engineering trade-offs** over unnecessary infrastructure or decorative complexity.


**Demo:** https://drive.google.com/file/d/1h_g5a87jkjcyte7TVMvA__jnQKz2KXX_/view?usp=sharing
