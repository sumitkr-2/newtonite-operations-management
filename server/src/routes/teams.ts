import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { query, queryOne } from '../db/pool';

const router = Router();
router.use(requireAuth);

// GET /api/teams
router.get('/', async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    let teams;

    if (user.isAdmin) {
      teams = await query('SELECT id, name FROM teams ORDER BY name');
    } else {
      // Return only teams the user belongs to
      teams = await query(
        `SELECT t.id, t.name FROM teams t
         JOIN team_members tm ON tm.team_id = t.id
         WHERE tm.user_id = $1
         ORDER BY t.name`,
        [user.id]
      );
    }

    return res.json(teams);
  } catch (err) {
    console.error('List teams error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/teams/all - all teams (for admin)
router.get('/all', async (req: Request, res: Response) => {
  try {
    const teams = await query('SELECT id, name FROM teams ORDER BY name');
    return res.json(teams);
  } catch (err) {
    console.error('List all teams error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
