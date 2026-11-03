import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/authService';
import { AuthenticatedRequest } from '../middleware/auth';
import { UnauthorizedError } from '../utils/errors';

export class AuthController {
  public static async login(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await AuthService.login(req.body.username, req.body.password);
      return res.status(200).json({ status: 'success', message: 'Login successful', data });
    } catch (error) {
      return next(error);
    }
  }

  public static async me(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const data = await AuthService.getUserById(req.user.id);
      return res.status(200).json({ status: 'success', data: { user: data } });
    } catch (error) {
      return next(error);
    }
  }

  public static async changePassword(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const data = await AuthService.changePassword(
        req.user.id,
        req.body.currentPassword,
        req.body.newPassword
      );
      return res.json({ status: 'success', data });
    } catch (error) {
      return next(error);
    }
  }

  public static async updateProfile(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const data = await AuthService.updateProfile(req.user.id, req.body);
      return res.json({ status: 'success', data });
    } catch (error) {
      return next(error);
    }
  }

  public static async logout(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      await AuthService.logout(req.user.id);
      return res.json({ status: 'success', message: 'Logged out successfully', data: null });
    } catch (error) {
      return next(error);
    }
  }
}
