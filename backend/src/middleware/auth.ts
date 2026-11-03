import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../config/prisma';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';

export type UserRole = 'SUPERADMIN' | 'EMPLOYEE';

export interface AuthUser {
  id: string;
  role: UserRole;
  tokenVersion: number;
  employeeId?: string;
  mustChangePassword: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === 'your_jwt_secret_key_here_change_in_production' || secret.length < 32) {
    throw new Error('JWT_SECRET must be set to a unique secret of at least 32 characters.');
  }
  return secret;
}

export const isSuperAdmin = (user: AuthUser) => user.role === 'SUPERADMIN';

export const authenticate = async (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Authentication token is required'));
  }

  let claims: string | jwt.JwtPayload;
  try {
    claims = jwt.verify(authHeader.slice(7), jwtSecret(), { algorithms: ['HS256'] });
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return next(new UnauthorizedError('Invalid or expired authentication token'));
    }
    return next(error);
  }
  if (
    typeof claims === 'string'
    || typeof claims.id !== 'string'
    || typeof claims.tokenVersion !== 'number'
  ) {
    return next(new UnauthorizedError('Invalid authentication token'));
  }

  let user;
  try {
    user = await prisma.user.findUnique({
      where: { id: claims.id },
      include: { employeeProfile: { select: { id: true, archivedAt: true } } },
    });
  } catch (error) {
    return next(error);
  }

  if (
    !user
    || !user.isActive
    || user.tokenVersion !== claims.tokenVersion
    || (user.role !== 'SUPERADMIN' && (!user.employeeProfile || user.employeeProfile.archivedAt))
  ) {
    return next(new UnauthorizedError('Invalid or expired authentication token'));
  }

  if (user.role !== 'SUPERADMIN' && user.role !== 'EMPLOYEE') {
    return next(new ForbiddenError('Account role is not permitted'));
  }

  req.user = {
    id: user.id,
    role: user.role,
    tokenVersion: user.tokenVersion,
    mustChangePassword: user.mustChangePassword,
    ...(user.employeeProfile ? { employeeId: user.employeeProfile.id } : {}),
  };
  return next();
};

export const authorize = (allowedRoles: UserRole[]) => {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new UnauthorizedError('Authentication required'));
    if (!allowedRoles.includes(req.user.role)) {
      return next(new ForbiddenError('Access denied: Insufficient permissions'));
    }
    return next();
  };
};

export const requireEmployer = authorize(['SUPERADMIN']);
export const requireEmployee = authorize(['EMPLOYEE']);

export const requirePasswordChangeComplete = (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) => {
  if (req.user?.mustChangePassword) {
    return next(new ForbiddenError('Change your temporary password before continuing'));
  }
  return next();
};
