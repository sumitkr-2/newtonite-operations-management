import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { requireAuth } from '../middleware/auth';
import { query, queryOne, withTransaction } from '../db/pool';
import { validateBody } from '../middleware/validate';

const router = Router();
router.use(requireAuth);

// Authorization helper: check if user can access a work item's team
async function getUserTeamRole(userId: string, teamId: string): Promise<string | null> {
  const member = await queryOne<{ role: string }>(
    'SELECT role FROM team_members WHERE user_id = $1 AND team_id = $2',
    [userId, teamId]
  );
  return member?.role ?? null;
}

async function canAccessTeam(user: { id: string; isAdmin: boolean }, teamId: string): Promise<boolean> {
  if (user.isAdmin) return true;
  const role = await getUserTeamRole(user.id, teamId);
  return role !== null;
}

async function canManageTeam(user: { id: string; isAdmin: boolean }, teamId: string): Promise<boolean> {
  if (user.isAdmin) return true;
  const role = await getUserTeamRole(user.id, teamId);
  return role === 'ADMIN' || role === 'MANAGER';
}

// Idempotency helper
async function checkIdempotency(client: any, key: string, userId: string, requestHash: string): Promise<{ found: boolean; response?: any }> {
  const existing = await client.query(
    'SELECT response FROM idempotency_keys WHERE key = $1 AND user_id = $2',
    [key, userId]
  );
  if (existing.rows.length > 0) {
    return { found: true, response: existing.rows[0].response };
  }
  return { found: false };
}

async function saveIdempotency(client: any, key: string, userId: string, requestHash: string, response: any): Promise<void> {
  await client.query(
    'INSERT INTO idempotency_keys (key, user_id, request_hash, response) VALUES ($1, $2, $3, $4) ON CONFLICT (key, user_id) DO NOTHING',
    [key, userId, requestHash, JSON.stringify(response)]
  );
}

function hashRequest(data: any): string {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

// Work item shape helper
function formatWorkItem(row: any) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    teamId: row.team_id,
    teamName: row.team_name,
    assigneeId: row.assignee_id,
    assigneeName: row.assignee_name,
    createdById: row.created_by_id,
    createdByName: row.created_by_name,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/work-items
const ListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.enum(['OPEN', 'INVESTIGATING', 'IN_PROGRESS', 'WAITING_APPROVAL', 'RESOLVED', 'CLOSED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  teamId: z.string().uuid().optional(),
  assigneeId: z.string().optional(), // support 'unassigned' as value
  sort: z.enum(['createdAt', 'updatedAt', 'priority', 'status']).default('updatedAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const parsed = ListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid query parameters', details: parsed.error.flatten() });
    }

    const { page, limit, search, status, priority, teamId, assigneeId, sort, order } = parsed.data;
    const user = req.user!;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    // Authorization: non-admins can only see work items for their teams
    if (!user.isAdmin) {
      conditions.push(`wi.team_id IN (SELECT team_id FROM team_members WHERE user_id = $${paramIdx})`);
      params.push(user.id);
      paramIdx++;
    }

    if (search) {
      conditions.push(`(wi.title ILIKE $${paramIdx} OR wi.description ILIKE $${paramIdx})`);
      params.push(`%${search}%`);
      paramIdx++;
    }

    if (status) {
      conditions.push(`wi.status = $${paramIdx}::work_status`);
      params.push(status);
      paramIdx++;
    }

    if (priority) {
      conditions.push(`wi.priority = $${paramIdx}::work_priority`);
      params.push(priority);
      paramIdx++;
    }

    if (teamId) {
      conditions.push(`wi.team_id = $${paramIdx}`);
      params.push(teamId);
      paramIdx++;
    }

    if (assigneeId === 'unassigned') {
      conditions.push('wi.assignee_id IS NULL');
    } else if (assigneeId) {
      conditions.push(`wi.assignee_id = $${paramIdx}`);
      params.push(assigneeId);
      paramIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Sort mapping
    const sortMap: Record<string, string> = {
      createdAt: 'wi.created_at',
      updatedAt: 'wi.updated_at',
      priority: `CASE wi.priority WHEN 'CRITICAL' THEN 4 WHEN 'HIGH' THEN 3 WHEN 'MEDIUM' THEN 2 WHEN 'LOW' THEN 1 END`,
      status: 'wi.status',
    };
    const sortCol = sortMap[sort] || 'wi.updated_at';
    const sortOrder = order.toUpperCase();

    const countResult = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM work_items wi ${whereClause}`,
      params
    );
    const total = parseInt(countResult?.count || '0', 10);

    const items = await query(
      `SELECT wi.id, wi.title, wi.description, wi.status, wi.priority,
              wi.team_id, t.name as team_name,
              wi.assignee_id, ua.name as assignee_name,
              wi.created_by_id, uc.name as created_by_name,
              wi.version, wi.created_at, wi.updated_at
       FROM work_items wi
       JOIN teams t ON t.id = wi.team_id
       LEFT JOIN users ua ON ua.id = wi.assignee_id
       JOIN users uc ON uc.id = wi.created_by_id
       ${whereClause}
       ORDER BY ${sortCol} ${sortOrder}
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    );

    return res.json({
      items: items.map(formatWorkItem),
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('List work items error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/work-items
const CreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(10000).default(''),
  teamId: z.string().uuid(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  assigneeId: z.string().uuid().nullish(),
});

router.post('/', validateBody(CreateSchema), async (req: Request, res: Response) => {
  const user = req.user!;
  const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
  const { title, description, teamId, priority, assigneeId } = req.body;

  try {
    // Authorization: user must be member of the team
    const canAccess = await canAccessTeam(user, teamId);
    if (!canAccess) {
      return res.status(403).json({ error: 'You do not have access to this team' });
    }

    // If assignee provided, check they're in the team
    if (assigneeId) {
      const assigneeInTeam = await queryOne(
        'SELECT 1 FROM team_members WHERE user_id = $1 AND team_id = $2',
        [assigneeId, teamId]
      );
      if (!assigneeInTeam) {
        return res.status(400).json({ error: 'Assignee must be a member of the team' });
      }
    }

    return await withTransaction(async (client) => {
      // Idempotency check
      if (idempotencyKey) {
        const requestHash = hashRequest({ title, description, teamId, priority, assigneeId });
        const idempotent = await checkIdempotency(client, idempotencyKey, user.id, requestHash);
        if (idempotent.found) {
          return res.status(200).json(idempotent.response);
        }
      }

      const insertResult = await client.query(
        `INSERT INTO work_items (title, description, priority, team_id, assignee_id, created_by_id)
         VALUES ($1, $2, $3::work_priority, $4, $5, $6)
         RETURNING id`,
        [title, description, priority, teamId, assigneeId || null, user.id]
      );
      const newId = insertResult.rows[0].id;

      // Audit event
      await client.query(
        `INSERT INTO work_item_events (work_item_id, actor_id, event_type, new_value)
         VALUES ($1, $2, 'CREATED', $3)`,
        [newId, user.id, title]
      );

      if (assigneeId) {
        const assignee = await queryOne<{ name: string }>('SELECT name FROM users WHERE id = $1', [assigneeId]);
        await client.query(
          `INSERT INTO work_item_events (work_item_id, actor_id, event_type, old_value, new_value)
           VALUES ($1, $2, 'ASSIGNED', NULL, $3)`,
          [newId, user.id, assignee?.name]
        );
      }

      // Fetch full result
      const workItem = await client.query(
        `SELECT wi.id, wi.title, wi.description, wi.status, wi.priority,
                wi.team_id, t.name as team_name,
                wi.assignee_id, ua.name as assignee_name,
                wi.created_by_id, uc.name as created_by_name,
                wi.version, wi.created_at, wi.updated_at
         FROM work_items wi
         JOIN teams t ON t.id = wi.team_id
         LEFT JOIN users ua ON ua.id = wi.assignee_id
         JOIN users uc ON uc.id = wi.created_by_id
         WHERE wi.id = $1`,
        [newId]
      );
      const response = formatWorkItem(workItem.rows[0]);

      if (idempotencyKey) {
        const requestHash = hashRequest({ title, description, teamId, priority, assigneeId });
        await saveIdempotency(client, idempotencyKey, user.id, requestHash, response);
      }

      return res.status(201).json(response);
    });
  } catch (err) {
    console.error('Create work item error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/work-items/dashboard/summary — MUST be before /:id
router.get('/dashboard/summary', async (req: Request, res: Response) => {
  const user = req.user!;
  try {
    let statusCounts, priorityCounts;

    if (user.isAdmin) {
      statusCounts = await query(`SELECT status, COUNT(*) as count FROM work_items GROUP BY status`);
      priorityCounts = await query(`SELECT priority, COUNT(*) as count FROM work_items GROUP BY priority`);
    } else {
      statusCounts = await query(
        `SELECT status, COUNT(*) as count FROM work_items
         WHERE team_id IN (SELECT team_id FROM team_members WHERE user_id = $1)
         GROUP BY status`,
        [user.id]
      );
      priorityCounts = await query(
        `SELECT priority, COUNT(*) as count FROM work_items
         WHERE team_id IN (SELECT team_id FROM team_members WHERE user_id = $1)
         GROUP BY priority`,
        [user.id]
      );
    }

    const myItems = await query(
      `SELECT wi.id, wi.title, wi.status, wi.priority, wi.updated_at, t.name as team_name
       FROM work_items wi JOIN teams t ON t.id = wi.team_id
       WHERE wi.assignee_id = $1 AND wi.status NOT IN ('RESOLVED', 'CLOSED')
       ORDER BY wi.updated_at DESC LIMIT 5`,
      [user.id]
    );

    let recentActivity;
    if (user.isAdmin) {
      recentActivity = await query(
        `SELECT e.id, e.event_type, e.old_value, e.new_value, e.created_at,
                u.name as actor_name, wi.id as work_item_id, wi.title as work_item_title
         FROM work_item_events e
         JOIN users u ON u.id = e.actor_id
         JOIN work_items wi ON wi.id = e.work_item_id
         ORDER BY e.created_at DESC LIMIT 10`
      );
    } else {
      recentActivity = await query(
        `SELECT e.id, e.event_type, e.old_value, e.new_value, e.created_at,
                u.name as actor_name, wi.id as work_item_id, wi.title as work_item_title
         FROM work_item_events e
         JOIN users u ON u.id = e.actor_id
         JOIN work_items wi ON wi.id = e.work_item_id
         WHERE wi.team_id IN (SELECT team_id FROM team_members WHERE user_id = $1)
         ORDER BY e.created_at DESC LIMIT 10`,
        [user.id]
      );
    }

    return res.json({
      statusCounts: statusCounts.map((r) => ({ status: r.status, count: parseInt(r.count) })),
      priorityCounts: priorityCounts.map((r) => ({ priority: r.priority, count: parseInt(r.count) })),
      myItems,
      recentActivity: recentActivity.map((a) => ({
        id: a.id,
        eventType: a.event_type,
        oldValue: a.old_value,
        newValue: a.new_value,
        createdAt: a.created_at,
        actorName: a.actor_name,
        workItemId: a.work_item_id,
        workItemTitle: a.work_item_title,
      })),
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/work-items/:id
router.get('/:id', async (req: Request, res: Response) => {
  const user = req.user!;
  const { id } = req.params;

  try {
    const workItem = await queryOne<any>(
      `SELECT wi.id, wi.title, wi.description, wi.status, wi.priority,
              wi.team_id, t.name as team_name,
              wi.assignee_id, ua.name as assignee_name,
              wi.created_by_id, uc.name as created_by_name,
              wi.version, wi.created_at, wi.updated_at
       FROM work_items wi
       JOIN teams t ON t.id = wi.team_id
       LEFT JOIN users ua ON ua.id = wi.assignee_id
       JOIN users uc ON uc.id = wi.created_by_id
       WHERE wi.id = $1`,
      [id]
    );

    if (!workItem) {
      return res.status(404).json({ error: 'Work item not found' });
    }

    // Authorization
    const canAccess = await canAccessTeam(user, workItem.team_id);
    if (!canAccess) {
      return res.status(404).json({ error: 'Work item not found' });
    }

    // Fetch comments
    const comments = await query(
      `SELECT c.id, c.work_item_id, c.user_id, u.name as user_name, c.body, c.created_at
       FROM comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.work_item_id = $1
       ORDER BY c.created_at ASC`,
      [id]
    );

    // Fetch history
    const history = await query(
      `SELECT e.id, e.work_item_id, e.actor_id, u.name as actor_name,
              e.event_type, e.old_value, e.new_value, e.metadata, e.created_at
       FROM work_item_events e
       JOIN users u ON u.id = e.actor_id
       WHERE e.work_item_id = $1
       ORDER BY e.created_at ASC`,
      [id]
    );

    return res.json({
      ...formatWorkItem(workItem),
      comments: comments.map((c) => ({
        id: c.id,
        workItemId: c.work_item_id,
        userId: c.user_id,
        userName: c.user_name,
        body: c.body,
        createdAt: c.created_at,
      })),
      history: history.map((e) => ({
        id: e.id,
        workItemId: e.work_item_id,
        actorId: e.actor_id,
        actorName: e.actor_name,
        eventType: e.event_type,
        oldValue: e.old_value,
        newValue: e.new_value,
        metadata: e.metadata,
        createdAt: e.created_at,
      })),
    });
  } catch (err) {
    console.error('Get work item error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/work-items/:id — optimistic concurrency
const UpdateSchema = z.object({
  version: z.number().int().min(1),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(10000).optional(),
  status: z.enum(['OPEN', 'INVESTIGATING', 'IN_PROGRESS', 'WAITING_APPROVAL', 'RESOLVED', 'CLOSED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  teamId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().nullish(),
});

router.patch('/:id', validateBody(UpdateSchema), async (req: Request, res: Response) => {
  const user = req.user!;
  const { id } = req.params;
  const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
  const { version, title, description, status, priority, teamId, assigneeId } = req.body;

  try {
    return await withTransaction(async (client) => {
      // Idempotency check
      if (idempotencyKey) {
        const requestHash = hashRequest({ id, version, title, description, status, priority, teamId, assigneeId });
        const idempotent = await checkIdempotency(client, idempotencyKey, user.id, requestHash);
        if (idempotent.found) {
          return res.status(200).json(idempotent.response);
        }
      }

      // Lock the row
      const current = await client.query(
        `SELECT wi.*, t.name as team_name FROM work_items wi JOIN teams t ON t.id = wi.team_id WHERE wi.id = $1 FOR UPDATE`,
        [id]
      );

      if (current.rows.length === 0) {
        return res.status(404).json({ error: 'Work item not found' });
      }

      const wi = current.rows[0];

      // Authorization
      const canAccess = user.isAdmin || await getUserTeamRole(user.id, wi.team_id);
      if (!canAccess) {
        return res.status(404).json({ error: 'Work item not found' });
      }

      // Non-managers/admins can only update status/assignee of items assigned to them
      const role = user.isAdmin ? 'ADMIN' : await getUserTeamRole(user.id, wi.team_id);
      if (role === 'AGENT') {
        const isAssigned = wi.assignee_id === user.id;
        const isCreator = wi.created_by_id === user.id;
        if (!isAssigned && !isCreator && (title || description || priority || teamId)) {
          return res.status(403).json({ error: 'Agents can only update status and assignee on items assigned to them' });
        }
      }

      // Optimistic concurrency check
      if (wi.version !== version) {
        return res.status(409).json({
          error: 'This item was modified by another user. Refresh and try again.',
          code: 'STALE_VERSION',
          currentVersion: wi.version,
        });
      }

      // Build update fields and audit events
      const events: { eventType: string; oldValue: any; newValue: any }[] = [];
      const setClauses: string[] = ['version = version + 1', 'updated_at = NOW()'];
      const updateParams: any[] = [];
      let paramIdx = 1;

      if (title !== undefined && title !== wi.title) {
        setClauses.push(`title = $${paramIdx}`);
        updateParams.push(title);
        paramIdx++;
        events.push({ eventType: 'TITLE_CHANGED', oldValue: wi.title, newValue: title });
      }

      if (description !== undefined && description !== wi.description) {
        setClauses.push(`description = $${paramIdx}`);
        updateParams.push(description);
        paramIdx++;
        events.push({ eventType: 'DESCRIPTION_CHANGED', oldValue: null, newValue: null }); // don't log full desc
      }

      if (status !== undefined && status !== wi.status) {
        setClauses.push(`status = $${paramIdx}::work_status`);
        updateParams.push(status);
        paramIdx++;
        events.push({ eventType: 'STATUS_CHANGED', oldValue: wi.status, newValue: status });
      }

      if (priority !== undefined && priority !== wi.priority) {
        setClauses.push(`priority = $${paramIdx}::work_priority`);
        updateParams.push(priority);
        paramIdx++;
        events.push({ eventType: 'PRIORITY_CHANGED', oldValue: wi.priority, newValue: priority });
      }

      if (teamId !== undefined && teamId !== wi.team_id) {
        // Must be manager/admin of both teams
        const canManageDest = await canManageTeam(user, teamId);
        if (!canManageDest) {
          return res.status(403).json({ error: 'You cannot move items to a team you do not manage' });
        }
        setClauses.push(`team_id = $${paramIdx}`);
        updateParams.push(teamId);
        paramIdx++;
        const newTeam = await client.query('SELECT name FROM teams WHERE id = $1', [teamId]);
        events.push({ eventType: 'TEAM_CHANGED', oldValue: wi.team_name, newValue: newTeam.rows[0]?.name });
      }

      const finalTeamId = teamId || wi.team_id;

      if (assigneeId !== undefined) {
        const newAssigneeId = assigneeId || null;
        if (newAssigneeId !== wi.assignee_id) {
          if (newAssigneeId) {
            const inTeam = await client.query(
              'SELECT 1 FROM team_members WHERE user_id = $1 AND team_id = $2',
              [newAssigneeId, finalTeamId]
            );
            if (inTeam.rows.length === 0) {
              return res.status(400).json({ error: 'Assignee must be a member of the team' });
            }
          }
          setClauses.push(`assignee_id = $${paramIdx}`);
          updateParams.push(newAssigneeId);
          paramIdx++;

          const oldAssignee = wi.assignee_id ? await client.query('SELECT name FROM users WHERE id = $1', [wi.assignee_id]) : null;
          const newAssignee = newAssigneeId ? await client.query('SELECT name FROM users WHERE id = $1', [newAssigneeId]) : null;
          events.push({
            eventType: 'ASSIGNED',
            oldValue: oldAssignee?.rows[0]?.name || null,
            newValue: newAssignee?.rows[0]?.name || null,
          });
        }
      }

      if (setClauses.length === 2) {
        // Nothing changed except version/timestamp - still return current
        const unchanged = await client.query(
          `SELECT wi.id, wi.title, wi.description, wi.status, wi.priority,
                  wi.team_id, t.name as team_name,
                  wi.assignee_id, ua.name as assignee_name,
                  wi.created_by_id, uc.name as created_by_name,
                  wi.version, wi.created_at, wi.updated_at
           FROM work_items wi
           JOIN teams t ON t.id = wi.team_id
           LEFT JOIN users ua ON ua.id = wi.assignee_id
           JOIN users uc ON uc.id = wi.created_by_id
           WHERE wi.id = $1`,
          [id]
        );
        return res.json(formatWorkItem(unchanged.rows[0]));
      }

      // Execute update
      updateParams.push(id);
      await client.query(
        `UPDATE work_items SET ${setClauses.join(', ')} WHERE id = $${paramIdx}`,
        updateParams
      );

      // Create audit events
      for (const event of events) {
        await client.query(
          `INSERT INTO work_item_events (work_item_id, actor_id, event_type, old_value, new_value)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, user.id, event.eventType, event.oldValue, event.newValue]
        );
      }

      // Fetch updated item
      const updated = await client.query(
        `SELECT wi.id, wi.title, wi.description, wi.status, wi.priority,
                wi.team_id, t.name as team_name,
                wi.assignee_id, ua.name as assignee_name,
                wi.created_by_id, uc.name as created_by_name,
                wi.version, wi.created_at, wi.updated_at
         FROM work_items wi
         JOIN teams t ON t.id = wi.team_id
         LEFT JOIN users ua ON ua.id = wi.assignee_id
         JOIN users uc ON uc.id = wi.created_by_id
         WHERE wi.id = $1`,
        [id]
      );
      const response = formatWorkItem(updated.rows[0]);

      if (idempotencyKey) {
        const requestHash = hashRequest({ id, version, title, description, status, priority, teamId, assigneeId });
        await saveIdempotency(client, idempotencyKey, user.id, requestHash, response);
      }

      return res.json(response);
    });
  } catch (err) {
    console.error('Update work item error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/work-items/:id/assign — concurrent assignment protection
const AssignSchema = z.object({
  version: z.number().int().min(1),
  assigneeId: z.string().uuid().nullish(),
});

router.post('/:id/assign', validateBody(AssignSchema), async (req: Request, res: Response) => {
  const user = req.user!;
  const { id } = req.params;
  const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
  const { version, assigneeId } = req.body;

  try {
    return await withTransaction(async (client) => {
      // Idempotency check
      if (idempotencyKey) {
        const requestHash = hashRequest({ id, version, assigneeId });
        const idempotent = await checkIdempotency(client, idempotencyKey, user.id, requestHash);
        if (idempotent.found) {
          return res.status(200).json(idempotent.response);
        }
      }

      // Lock the row with SELECT FOR UPDATE
      const current = await client.query(
        `SELECT wi.* FROM work_items wi WHERE wi.id = $1 FOR UPDATE`,
        [id]
      );

      if (current.rows.length === 0) {
        return res.status(404).json({ error: 'Work item not found' });
      }

      const wi = current.rows[0];

      // Authorization
      const canAccess = user.isAdmin || await getUserTeamRole(user.id, wi.team_id);
      if (!canAccess) {
        return res.status(404).json({ error: 'Work item not found' });
      }

      // Optimistic concurrency
      if (wi.version !== version) {
        return res.status(409).json({
          error: 'This item was modified by another user. Refresh and try again.',
          code: 'STALE_VERSION',
          currentVersion: wi.version,
        });
      }

      const newAssigneeId = assigneeId || null;

      // CRITICAL: Concurrent assignment protection
      // If trying to assign to someone (not unassign), and item is already assigned, reject
      if (newAssigneeId !== null && wi.assignee_id !== null && wi.assignee_id !== newAssigneeId) {
        return res.status(409).json({
          error: 'This work item is already assigned to someone else.',
          code: 'ALREADY_ASSIGNED',
        });
      }

      // Check assignee is in team
      if (newAssigneeId) {
        const inTeam = await client.query(
          'SELECT 1 FROM team_members WHERE user_id = $1 AND team_id = $2',
          [newAssigneeId, wi.team_id]
        );
        if (inTeam.rows.length === 0) {
          return res.status(400).json({ error: 'Assignee must be a member of the team' });
        }
      }

      // Atomic conditional update: only update if still same version
      const updateResult = await client.query(
        `UPDATE work_items
         SET assignee_id = $1, version = version + 1, updated_at = NOW()
         WHERE id = $2 AND version = $3
         RETURNING id`,
        [newAssigneeId, id, version]
      );

      if (updateResult.rows.length === 0) {
        // Race condition: version changed between our check and update
        return res.status(409).json({
          error: 'This item was modified by another user. Refresh and try again.',
          code: 'CONCURRENT_CONFLICT',
        });
      }

      // Audit event
      const oldAssignee = wi.assignee_id ? await client.query('SELECT name FROM users WHERE id = $1', [wi.assignee_id]) : null;
      const newAssignee = newAssigneeId ? await client.query('SELECT name FROM users WHERE id = $1', [newAssigneeId]) : null;
      await client.query(
        `INSERT INTO work_item_events (work_item_id, actor_id, event_type, old_value, new_value)
         VALUES ($1, $2, 'ASSIGNED', $3, $4)`,
        [id, user.id, oldAssignee?.rows[0]?.name || null, newAssignee?.rows[0]?.name || null]
      );

      const updated = await client.query(
        `SELECT wi.id, wi.title, wi.description, wi.status, wi.priority,
                wi.team_id, t.name as team_name,
                wi.assignee_id, ua.name as assignee_name,
                wi.created_by_id, uc.name as created_by_name,
                wi.version, wi.created_at, wi.updated_at
         FROM work_items wi
         JOIN teams t ON t.id = wi.team_id
         LEFT JOIN users ua ON ua.id = wi.assignee_id
         JOIN users uc ON uc.id = wi.created_by_id
         WHERE wi.id = $1`,
        [id]
      );
      const response = formatWorkItem(updated.rows[0]);

      if (idempotencyKey) {
        const requestHash = hashRequest({ id, version, assigneeId });
        await saveIdempotency(client, idempotencyKey, user.id, requestHash, response);
      }

      return res.json(response);
    });
  } catch (err) {
    console.error('Assign work item error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/work-items/:id/comments
const CommentSchema = z.object({
  body: z.string().min(1).max(5000),
});

router.post('/:id/comments', validateBody(CommentSchema), async (req: Request, res: Response) => {
  const user = req.user!;
  const { id } = req.params;
  const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
  const { body } = req.body;

  try {
    // Check work item exists and user has access
    const wi = await queryOne<{ team_id: string }>('SELECT team_id FROM work_items WHERE id = $1', [id]);
    if (!wi) return res.status(404).json({ error: 'Work item not found' });

    const canAccess = await canAccessTeam(user, wi.team_id);
    if (!canAccess) return res.status(404).json({ error: 'Work item not found' });

    return await withTransaction(async (client) => {
      if (idempotencyKey) {
        const requestHash = hashRequest({ id, body });
        const idempotent = await checkIdempotency(client, idempotencyKey, user.id, requestHash);
        if (idempotent.found) {
          return res.status(200).json(idempotent.response);
        }
      }

      const result = await client.query(
        'INSERT INTO comments (work_item_id, user_id, body) VALUES ($1, $2, $3) RETURNING id, created_at',
        [id, user.id, body]
      );
      const comment = result.rows[0];

      await client.query(
        `INSERT INTO work_item_events (work_item_id, actor_id, event_type, new_value)
         VALUES ($1, $2, 'COMMENTED', $3)`,
        [id, user.id, body.substring(0, 100)]
      );

      const response = {
        id: comment.id,
        workItemId: id,
        userId: user.id,
        userName: user.name,
        body,
        createdAt: comment.created_at,
      };

      if (idempotencyKey) {
        const requestHash = hashRequest({ id, body });
        await saveIdempotency(client, idempotencyKey, user.id, requestHash, response);
      }

      return res.status(201).json(response);
    });
  } catch (err) {
    console.error('Add comment error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/work-items/:id/history
router.get('/:id/history', async (req: Request, res: Response) => {
  const user = req.user!;
  const { id } = req.params;

  try {
    const wi = await queryOne<{ team_id: string }>('SELECT team_id FROM work_items WHERE id = $1', [id]);
    if (!wi) return res.status(404).json({ error: 'Work item not found' });

    const canAccess = await canAccessTeam(user, wi.team_id);
    if (!canAccess) return res.status(404).json({ error: 'Work item not found' });

    const history = await query(
      `SELECT e.id, e.work_item_id, e.actor_id, u.name as actor_name,
              e.event_type, e.old_value, e.new_value, e.metadata, e.created_at
       FROM work_item_events e
       JOIN users u ON u.id = e.actor_id
       WHERE e.work_item_id = $1
       ORDER BY e.created_at ASC`,
      [id]
    );

    return res.json(history.map((e) => ({
      id: e.id,
      workItemId: e.work_item_id,
      actorId: e.actor_id,
      actorName: e.actor_name,
      eventType: e.event_type,
      oldValue: e.old_value,
      newValue: e.new_value,
      metadata: e.metadata,
      createdAt: e.created_at,
    })));
  } catch (err) {
    console.error('Get history error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});


export default router;

