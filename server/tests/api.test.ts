import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import app from '../src/index';
import { pool, query } from '../src/db/pool';

let alice: any, marcus: any, rahul: any, priya: any;
let aliceToken: string, marcusToken: string, rahulToken: string, priyaToken: string;
let platform: any, support: any;

async function setupTestData() {
  await pool.query('BEGIN');
  try {
    // Clear test data
    await pool.query(`DELETE FROM idempotency_keys`);
    await pool.query(`DELETE FROM work_item_events`);
    await pool.query(`DELETE FROM comments`);
    await pool.query(`DELETE FROM work_items`);
    await pool.query(`DELETE FROM team_members`);
    await pool.query(`DELETE FROM teams`);
    await pool.query(`DELETE FROM users`);

    const hash = await bcrypt.hash('password123', 10);
    const adminHash = await bcrypt.hash('admin123', 10);

    const usersRes = await pool.query(`
      INSERT INTO users (name, email, password_hash, is_admin) VALUES
      ('Alice Admin', 'alice.test@test.com', $1, true),
      ('Marcus Manager', 'marcus.test@test.com', $2, false),
      ('Rahul Agent', 'rahul.test@test.com', $2, false),
      ('Priya Agent', 'priya.test@test.com', $2, false)
      RETURNING id, name, email
    `, [adminHash, hash]);

    [alice, marcus, rahul, priya] = usersRes.rows;

    const teamsRes = await pool.query(`
      INSERT INTO teams (name) VALUES ('Test Platform'), ('Test Support')
      RETURNING id, name
    `);
    [platform, support] = teamsRes.rows;

    await pool.query(`
      INSERT INTO team_members (user_id, team_id, role) VALUES
      ($1, $3, 'ADMIN'), ($1, $4, 'ADMIN'),
      ($2, $3, 'MANAGER'), ($2, $4, 'MANAGER'),
      ($5, $3, 'AGENT'),
      ($6, $3, 'AGENT')
    `, [alice.id, marcus.id, platform.id, support.id, rahul.id, priya.id]);

    await pool.query('COMMIT');
  } catch (err) {
    await pool.query('ROLLBACK');
    throw err;
  }
}

async function getToken(email: string, password: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token;
}

beforeAll(async () => {
  await setupTestData();
  aliceToken = await getToken('alice.test@test.com', 'admin123');
  marcusToken = await getToken('marcus.test@test.com', 'password123');
  rahulToken = await getToken('rahul.test@test.com', 'password123');
  priyaToken = await getToken('priya.test@test.com', 'password123');
});

afterAll(async () => {
  await pool.end();
});

// ============================================================
// TEST 1: Concurrent assignment — only one user should succeed
// ============================================================
describe('TEST 1: Concurrent Assignment', () => {
  it('only one of two concurrent assignments should succeed, the other gets 409', async () => {
    // Create unassigned work item
    const createRes = await request(app)
      .post('/api/work-items')
      .set('Authorization', `Bearer ${marcusToken}`)
      .set('Idempotency-Key', `create-assign-test-${uuidv4()}`)
      .send({
        title: 'Concurrent Assignment Test',
        description: 'Test concurrent assignment',
        teamId: platform.id,
        priority: 'MEDIUM',
      });
    expect(createRes.status).toBe(201);
    const itemId = createRes.body.id;
    const version = createRes.body.version;

    // Both users try to assign at the same time (simulated)
    const [res1, res2] = await Promise.all([
      request(app)
        .post(`/api/work-items/${itemId}/assign`)
        .set('Authorization', `Bearer ${rahulToken}`)
        .set('Idempotency-Key', `assign-rahul-${uuidv4()}`)
        .send({ version, assigneeId: rahul.id }),
      request(app)
        .post(`/api/work-items/${itemId}/assign`)
        .set('Authorization', `Bearer ${priyaToken}`)
        .set('Idempotency-Key', `assign-priya-${uuidv4()}`)
        .send({ version, assigneeId: priya.id }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toContain(200);
    expect(statuses).toContain(409);
  });
});

// ============================================================
// TEST 2: Stale update rejection
// ============================================================
describe('TEST 2: Stale Update Rejection', () => {
  it('first update succeeds, second with same version gets 409', async () => {
    const createRes = await request(app)
      .post('/api/work-items')
      .set('Authorization', `Bearer ${marcusToken}`)
      .set('Idempotency-Key', `create-stale-test-${uuidv4()}`)
      .send({
        title: 'Stale Update Test Item',
        description: 'Test stale update',
        teamId: platform.id,
        priority: 'LOW',
      });
    expect(createRes.status).toBe(201);
    const itemId = createRes.body.id;
    const version = createRes.body.version;

    // First update succeeds
    const update1 = await request(app)
      .patch(`/api/work-items/${itemId}`)
      .set('Authorization', `Bearer ${marcusToken}`)
      .set('Idempotency-Key', `update1-${uuidv4()}`)
      .send({ version, status: 'INVESTIGATING' });
    expect(update1.status).toBe(200);
    expect(update1.body.version).toBe(version + 1);

    // Second update with old version gets 409
    const update2 = await request(app)
      .patch(`/api/work-items/${itemId}`)
      .set('Authorization', `Bearer ${rahulToken}`)
      .set('Idempotency-Key', `update2-${uuidv4()}`)
      .send({ version, status: 'IN_PROGRESS' });
    expect(update2.status).toBe(409);
    expect(update2.body.code).toBe('STALE_VERSION');

    // Verify the item still has the first update's data
    const getRes = await request(app)
      .get(`/api/work-items/${itemId}`)
      .set('Authorization', `Bearer ${marcusToken}`);
    expect(getRes.body.status).toBe('INVESTIGATING');
    expect(getRes.body.version).toBe(version + 1);
  });
});

// ============================================================
// TEST 3: Unauthorized user cannot access protected resources
// ============================================================
describe('TEST 3: Authorization', () => {
  it('unauthenticated request returns 401', async () => {
    const res = await request(app).get('/api/work-items');
    expect(res.status).toBe(401);
  });

  it('user cannot access work items from a team they do not belong to', async () => {
    // Create work item in support team (priya is not in support)
    const createRes = await request(app)
      .post('/api/work-items')
      .set('Authorization', `Bearer ${marcusToken}`)
      .set('Idempotency-Key', `create-auth-test-${uuidv4()}`)
      .send({
        title: 'Support Team Item',
        description: 'Test authorization',
        teamId: support.id,
        priority: 'LOW',
      });
    expect(createRes.status).toBe(201);
    const itemId = createRes.body.id;

    // Priya (only in platform, not support) should not see this item
    const getRes = await request(app)
      .get(`/api/work-items/${itemId}`)
      .set('Authorization', `Bearer ${priyaToken}`);
    expect(getRes.status).toBe(404);
  });

  it('agent cannot create work item for team they are not in', async () => {
    const res = await request(app)
      .post('/api/work-items')
      .set('Authorization', `Bearer ${rahulToken}`)
      .set('Idempotency-Key', `create-forbidden-${uuidv4()}`)
      .send({
        title: 'Unauthorized Item',
        description: 'Should fail',
        teamId: support.id, // rahul is not in support
        priority: 'LOW',
      });
    expect(res.status).toBe(403);
  });
});

// ============================================================
// TEST 4: Idempotency — same mutation twice only executes once
// ============================================================
describe('TEST 4: Idempotency', () => {
  it('same create with same idempotency key only creates one item', async () => {
    const key = `idempotent-create-${uuidv4()}`;
    const payload = {
      title: 'Idempotent Create Test',
      description: 'Test idempotency',
      teamId: platform.id,
      priority: 'MEDIUM',
    };

    const res1 = await request(app)
      .post('/api/work-items')
      .set('Authorization', `Bearer ${marcusToken}`)
      .set('Idempotency-Key', key)
      .send(payload);
    expect(res1.status).toBe(201);
    const id1 = res1.body.id;

    const res2 = await request(app)
      .post('/api/work-items')
      .set('Authorization', `Bearer ${marcusToken}`)
      .set('Idempotency-Key', key)
      .send(payload);
    // Should return 200 (cached) not 201
    expect(res2.body.id).toBe(id1);

    // Verify only 1 item was created
    const countRes = await pool.query(
      `SELECT COUNT(*) as count FROM work_items WHERE title = 'Idempotent Create Test' AND created_by_id = $1`,
      [marcus.id]
    );
    expect(parseInt(countRes.rows[0].count)).toBe(1);

    // Verify only 1 CREATED event
    const eventsRes = await pool.query(
      `SELECT COUNT(*) as count FROM work_item_events WHERE work_item_id = $1 AND event_type = 'CREATED'`,
      [id1]
    );
    expect(parseInt(eventsRes.rows[0].count)).toBe(1);
  });
});

// ============================================================
// TEST 5: Important mutations create audit history
// ============================================================
describe('TEST 5: Audit History', () => {
  it('status change creates correct audit event', async () => {
    const createRes = await request(app)
      .post('/api/work-items')
      .set('Authorization', `Bearer ${marcusToken}`)
      .set('Idempotency-Key', `create-audit-test-${uuidv4()}`)
      .send({
        title: 'Audit Test Item',
        description: 'Test audit history',
        teamId: platform.id,
        priority: 'HIGH',
      });
    expect(createRes.status).toBe(201);
    const itemId = createRes.body.id;
    const version = createRes.body.version;

    // Change status
    await request(app)
      .patch(`/api/work-items/${itemId}`)
      .set('Authorization', `Bearer ${marcusToken}`)
      .set('Idempotency-Key', `status-change-${uuidv4()}`)
      .send({ version, status: 'INVESTIGATING' });

    // Verify history
    const historyRes = await request(app)
      .get(`/api/work-items/${itemId}/history`)
      .set('Authorization', `Bearer ${marcusToken}`);
    expect(historyRes.status).toBe(200);

    const events = historyRes.body;
    const createdEvent = events.find((e: any) => e.eventType === 'CREATED');
    const statusEvent = events.find((e: any) => e.eventType === 'STATUS_CHANGED');

    expect(createdEvent).toBeDefined();
    expect(statusEvent).toBeDefined();
    expect(statusEvent.oldValue).toBe('OPEN');
    expect(statusEvent.newValue).toBe('INVESTIGATING');
    expect(statusEvent.actorId).toBe(marcus.id);
  });

  it('comment adds COMMENTED event to history', async () => {
    const createRes = await request(app)
      .post('/api/work-items')
      .set('Authorization', `Bearer ${marcusToken}`)
      .set('Idempotency-Key', `create-comment-test-${uuidv4()}`)
      .send({
        title: 'Comment Audit Test',
        description: 'Test comment audit',
        teamId: platform.id,
        priority: 'LOW',
      });
    const itemId = createRes.body.id;

    await request(app)
      .post(`/api/work-items/${itemId}/comments`)
      .set('Authorization', `Bearer ${rahulToken}`)
      .set('Idempotency-Key', `comment-${uuidv4()}`)
      .send({ body: 'This is a test comment' });

    const historyRes = await request(app)
      .get(`/api/work-items/${itemId}/history`)
      .set('Authorization', `Bearer ${marcusToken}`);

    const commentEvent = historyRes.body.find((e: any) => e.eventType === 'COMMENTED');
    expect(commentEvent).toBeDefined();
    expect(commentEvent.actorId).toBe(rahul.id);
  });

  it('smoke test: full workflow works end-to-end', async () => {
    // Login
    const loginRes = await request(app).post('/api/auth/login').send({ email: 'alice.test@test.com', password: 'admin123' });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toBeDefined();
    const token = loginRes.body.token;

    // Dashboard
    const dashRes = await request(app).get('/api/work-items/dashboard/summary').set('Authorization', `Bearer ${token}`);
    expect(dashRes.status).toBe(200);

    // Create item
    const createRes = await request(app)
      .post('/api/work-items')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `smoke-create-${uuidv4()}`)
      .send({ title: 'Smoke Test Item', description: 'E2E smoke test', teamId: platform.id, priority: 'HIGH' });
    expect(createRes.status).toBe(201);
    const itemId = createRes.body.id;
    let version = createRes.body.version;

    // View item
    const getRes = await request(app).get(`/api/work-items/${itemId}`).set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(200);

    // Assign
    const assignRes = await request(app)
      .post(`/api/work-items/${itemId}/assign`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `smoke-assign-${uuidv4()}`)
      .send({ version, assigneeId: alice.id });
    expect(assignRes.status).toBe(200);
    version = assignRes.body.version;

    // Change status
    const statusRes = await request(app)
      .patch(`/api/work-items/${itemId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `smoke-status-${uuidv4()}`)
      .send({ version, status: 'IN_PROGRESS' });
    expect(statusRes.status).toBe(200);
    version = statusRes.body.version;

    // Change priority
    const priorityRes = await request(app)
      .patch(`/api/work-items/${itemId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `smoke-priority-${uuidv4()}`)
      .send({ version, priority: 'CRITICAL' });
    expect(priorityRes.status).toBe(200);
    version = priorityRes.body.version;

    // Add comment
    const commentRes = await request(app)
      .post(`/api/work-items/${itemId}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `smoke-comment-${uuidv4()}`)
      .send({ body: 'Smoke test comment' });
    expect(commentRes.status).toBe(201);

    // View history
    const histRes = await request(app).get(`/api/work-items/${itemId}/history`).set('Authorization', `Bearer ${token}`);
    expect(histRes.status).toBe(200);
    expect(histRes.body.length).toBeGreaterThanOrEqual(4); // CREATED, ASSIGNED, STATUS, PRIORITY, COMMENTED

    // Search and filter
    const searchRes = await request(app)
      .get('/api/work-items?search=Smoke&status=IN_PROGRESS')
      .set('Authorization', `Bearer ${token}`);
    expect(searchRes.status).toBe(200);
    expect(searchRes.body.items.some((i: any) => i.id === itemId)).toBe(true);
  });
});
