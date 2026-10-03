# Engineering Decisions

## 1. Data Model and Database

**Choice:** PostgreSQL with raw SQL queries (pg driver).

The data model uses a `version` column on `work_items` as the primary mechanism for optimistic concurrency. Each mutation increments `version` atomically inside a transaction. This eliminates stale-write bugs without requiring complex distributed locking.

Foreign keys enforce referential integrity (e.g., `assignee_id` points to a real user, `team_id` to a real team). Cascading deletes are set conservatively: deleting a user nulls `assignee_id` on their work items rather than deleting those items. This preserves historical correctness.

Indexes are placed on the most common query paths: `team_id`, `status`, `priority`, `assignee_id`, and `created_at`/`updated_at` (for sorting). A GIN full-text index is added for the search path, though ILIKE is used for simplicity in the current implementation and could be upgraded to `tsvector` for production scale.

**Trade-off:** Raw SQL was chosen over an ORM (Prisma/Drizzle) to keep migrations simple, make SQL injection prevention explicit, and avoid ORM abstraction overhead. At larger team scale, an ORM would improve developer experience.

---

## 2. Authorization Model

**Choice:** Team membership + role-based access, enforced server-side in each route handler.

Authorization is enforced at **two levels**:

1. **Authentication layer:** JWT is verified before any protected route runs. The user ID is loaded fresh from the database on each request — not trusted from the token payload alone — so a deleted user's token is immediately invalid.

2. **Resource layer:** Each route checks the requesting user's `team_members` record for the specific team owning the resource. Roles are: `ADMIN` (broad), `MANAGER` (team-scoped management), `AGENT` (team-scoped work execution).

Users are never shown resources outside their teams (404 used instead of 403 for team membership to avoid disclosing existence of resources). Agents can only modify status/assignee of items they created or are assigned to.

**Trade-off:** Authorization is spread across route handlers rather than centralized in middleware policies. This is explicit and easy to audit, but harder to enforce consistently as the API grows. A production system would centralize this in a policy engine.

---

## 3. Concurrency and Versioning

**Two distinct problems are solved:**

### Stale Updates (Optimistic Concurrency)
Every `PATCH /work-items/:id` requires the client to supply the current `version`. The server performs:

```sql
UPDATE work_items SET ..., version = version + 1
WHERE id = $1 AND version = $2
```

If `version` doesn't match, zero rows are updated and the server returns `409 CONFLICT` with `code: STALE_VERSION`. The frontend displays a message and automatically refreshes the item.

### Concurrent Assignment
The `POST /work-items/:id/assign` endpoint uses `SELECT FOR UPDATE` inside a transaction to lock the row before checking and updating `assignee_id`. If the row has already been assigned (version changed between client load and update attempt), the server returns `409 CONFLICT` with `code: ALREADY_ASSIGNED` or `CONCURRENT_CONFLICT`. The frontend reconciles by refetching.

Both mechanisms are **database-level** — frontend state is not relied upon for correctness.

---

## 4. Audit History

**Choice:** Append-only `work_item_events` table. Events are created **inside the same transaction** as the mutation.

This guarantees the audit log is always consistent with the data: it is impossible for a work item to change status without a corresponding history event (the transaction rolls back if the event insert fails), and equally impossible to have a history event without the state change.

Events capture `old_value` and `new_value` as strings, along with `actor_id` and `event_type`. Common event types: `CREATED`, `STATUS_CHANGED`, `PRIORITY_CHANGED`, `ASSIGNED`, `COMMENTED`, `TITLE_CHANGED`, `TEAM_CHANGED`.

The history is immutable: there are no delete endpoints for events. History is displayed in chronological order with human-readable descriptions generated client-side from event type + values.

---

## 5. Idempotency

**Choice:** Server-side idempotency key table (`idempotency_keys`), keyed by `(key, user_id)`.

When a client sends `Idempotency-Key: <uuid>` with a mutation:
1. The server looks up `(key, user_id)` inside the same transaction.
2. If found: return the stored response immediately (no re-execution).
3. If not found: execute the operation, store the result, then commit.

This protects against: double-clicks, mobile network retries, uncertain request completion (client timeout but server succeeded). The key is scoped to the user so different users can use the same key value.

**Trade-off:** Idempotency records are never cleaned up in this implementation. A production system would add a background job to purge old keys (e.g., after 24 hours).

---

## Trade-offs and Known Limitations

- **No real-time updates:** The dashboard and item views use polling (30s interval) rather than WebSockets. For a production system with high activity, WebSocket or Server-Sent Events would be preferable.
- **ILIKE search:** Full-text search uses `ILIKE` which doesn't use indexes efficiently at scale. The GIN index exists but `tsvector` matching is not yet implemented.
- **Idempotency key expiry:** Old idempotency keys are never purged. A TTL-based cleanup job is needed for production.
- **No rate limiting beyond Helmet:** There's no per-user rate limiting on mutations. Express-rate-limit is installed but only configured globally.
- **Single region:** No geographic distribution is implemented or needed at this scale.
- **Email/notifications:** No notification system exists. Would be the next feature to add.

---

## What Would Change at Scale

1. **Connection pooling at the application tier** with PgBouncer for 1000+ concurrent users.
2. **Read replicas** for list/dashboard queries, primary only for mutations.
3. **Background jobs** (Bull/BullMQ with Redis) for async operations: email notifications, audit aggregation, idempotency cleanup.
4. **Search** upgrade to dedicated full-text with `tsvector` or Elasticsearch for advanced queries.
5. **Event sourcing** consideration — the current audit log is a simplified event log. A full event-sourced architecture would allow replaying state from events.

---

## What Could Be Built Next (One Week)

1. Real-time notifications via WebSockets (Socket.io)
2. Email notifications for assignment and status changes
3. Work item templates for common issue types
4. SLA tracking and escalation rules
5. Advanced reporting and CSV/PDF export
6. Two-factor authentication
7. Audit log export for compliance
8. Work item linking (parent/child, related, duplicates)