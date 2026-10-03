import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { query } from '../db/pool';
import { z } from 'zod';

const router = Router();
router.use(requireAuth);

const ListUsersQuerySchema = z.object({
  teamId: z.string().uuid().optional(),
});

// GET /api/users
router.get('/', async (req: Request, res: Response) => {
  try {
    const parsed = ListUsersQuerySchema.safeParse(req.query);
    const teamId = parsed.success ? parsed.data.teamId : undefined;

    let users;
    if (teamId) {
      users = await query(
        `SELECT u.id, u.name, u.email, tm.role
         FROM users u
         JOIN team_members tm ON tm.user_id = u.id
         WHERE tm.team_id = $1
         ORDER BY u.name`,
        [teamId]
      );
    } else {
      // Admin gets all, others get users in their teams
      const user = req.user!;
      if (user.isAdmin) {
        users = await query(`
          SELECT DISTINCT u.id, u.name, u.email,
            COALESCE((
              SELECT tm.role FROM team_members tm WHERE tm.user_id = u.id LIMIT 1
            ), 'AGENT') as role
          FROM users u
          ORDER BY u.name
        `);
      } else {
        users = await query(
          `SELECT DISTINCT u.id, u.name, u.email, tm.role
           FROM users u
           JOIN team_members tm ON tm.user_id = u.id
           WHERE tm.team_id IN (
             SELECT team_id FROM team_members WHERE user_id = $1
           )
           ORDER BY u.name`,
          [user.id]
        );
      }
    }

    return res.json(users);
  } catch (err) {
    console.error('List users error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
