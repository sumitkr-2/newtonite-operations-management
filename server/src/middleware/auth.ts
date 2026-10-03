import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { queryOne } from '../db/pool';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.slice(7);
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const payload = jwt.verify(token, secret) as { userId: string };
    // Load user from DB to ensure they still exist and get fresh data
    queryOne<{ id: string; name: string; email: string; is_admin: boolean }>(
      'SELECT id, name, email, is_admin FROM users WHERE id = $1',
      [payload.userId]
    ).then((user) => {
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }
      req.user = {
        id: user.id,
        name: user.name,
        email: user.email,
        isAdmin: user.is_admin,
      };
      next();
    }).catch((err) => {
      console.error('Auth middleware DB error:', err);
      return res.status(500).json({ error: 'Server error' });
    });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
