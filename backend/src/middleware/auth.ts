import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';

export interface AuthUser {
  id: string;
  role: 'SUPERADMIN' | 'ADMIN' | 'MANAGER' | 'EMPLOYEE';
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export const isSuperAdmin = (user: AuthUser) => user.role === 'SUPERADMIN';


export const authenticate = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Authentication token is required'));
  }

  const token = authHeader.split(' ')[1];
  const jwtSecret = process.env.JWT_SECRET || 'your_jwt_secret_key_here_change_in_production';

  try {
    const decoded = jwt.verify(token, jwtSecret) as AuthUser;
    req.user = decoded;
    next();
  } catch (error) {
    next(new UnauthorizedError('Invalid or expired authentication token'));
  }
};

export const authorize = (allowedRoles: ('SUPERADMIN' | 'ADMIN' | 'MANAGER' | 'EMPLOYEE')[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new ForbiddenError('Access denied: Insufficient permissions'));
    }

    next();
  };
};

