import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { queryOne } from '../db/pool';
import { validateBody } from '../middleware/validate';

const router = Router();

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/login', validateBody(LoginSchema), async (req: Request, res: Response) => {
  const { email, password } = req.body;

  try {
    const user = await queryOne<{
      id: string;
      name: string;
      email: string;
      password_hash: string;
      is_admin: boolean;
    }>('SELECT id, name, email, password_hash, is_admin FROM users WHERE email = $1', [email]);

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const token = jwt.sign({ userId: user.id }, secret, {
      expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as any,
    });

    // Get user's team memberships
    const memberships = await queryOne<{ teams: any }>(`
      SELECT json_agg(json_build_object(
        'teamId', t.id,
        'teamName', t.name,
        'role', tm.role
      )) as teams
      FROM team_members tm
      JOIN teams t ON t.id = tm.team_id
      WHERE tm.user_id = $1
    `, [user.id]);

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        isAdmin: user.is_admin,
        teams: memberships?.teams || [],
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.get('/me', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.slice(7);
  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(500).json({ error: 'Server configuration error' });

  try {
    const payload = jwt.verify(token, secret) as { userId: string };
    const user = await queryOne<{ id: string; name: string; email: string; is_admin: boolean }>(
      'SELECT id, name, email, is_admin FROM users WHERE id = $1',
      [payload.userId]
    );
    if (!user) return res.status(401).json({ error: 'User not found' });

    const memberships = await queryOne<{ teams: any }>(`
      SELECT json_agg(json_build_object(
        'teamId', t.id,
        'teamName', t.name,
        'role', tm.role
      )) as teams
      FROM team_members tm
      JOIN teams t ON t.id = tm.team_id
      WHERE tm.user_id = $1
    `, [user.id]);

    return res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      isAdmin: user.is_admin,
      teams: memberships?.teams || [],
    });
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
});

export default router;
