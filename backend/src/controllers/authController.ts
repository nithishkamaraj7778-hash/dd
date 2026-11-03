import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/authService';
import { AuthenticatedRequest } from '../middleware/auth';

export class AuthController {
  public static async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { username, password } = req.body;
      const data = await AuthService.login(username, password);
      
      return res.status(200).json({
        status: 'success',
        message: 'Login successful',
        data,
      });
    } catch (error) {
      return next(error);
    }
  }

  public static async register(req: Request, res: Response, next: NextFunction) {
    try {
      const { username, password, fullName, role } = req.body;
      const data = await AuthService.register(username, password, fullName, role);

      return res.status(201).json({
        status: 'success',
        message: 'User registered successfully',
        data,
      });
    } catch (error) {
      return next(error);
    }
  }

  public static async me(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({
          status: 'error',
          message: 'Unauthorized',
        });
      }
      
      const data = await AuthService.getUserById(req.user.id);
      
      return res.status(200).json({
        status: 'success',
        data: {
          user: data,
        },
      });
    } catch (error) {
      return next(error);
    }
  }

  public static async listAdmins(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const admins = await AuthService.listAdmins();
      return res.status(200).json({
        status: 'success',
        data: admins,
      });
    } catch (error) {
      return next(error);
    }
  }

  public static async logout(req: Request, res: Response, next: NextFunction) {
    // JWT is stateless; client should drop the token.
    // Return success to confirm server is happy.
    return res.status(200).json({
      status: 'success',
      message: 'Logged out successfully',
    });
  }
}
