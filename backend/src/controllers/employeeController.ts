import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { AuthService } from '../services/authService';
import { UnauthorizedError } from '../utils/errors';

export class EmployeeController {
  public static async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
      return res.json({ status: 'success', data: await AuthService.listEmployees(search) });
    } catch (error) {
      return next(error);
    }
  }

  public static async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const data = await AuthService.createEmployee(req.user.id, req.body);
      return res.status(201).json({ status: 'success', data });
    } catch (error) {
      return next(error);
    }
  }

  public static async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const data = await AuthService.updateEmployee(req.user.id, req.params.id, req.body);
      return res.json({ status: 'success', data });
    } catch (error) {
      return next(error);
    }
  }

  public static async setActive(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const data = await AuthService.setEmployeeActive(
        req.user.id,
        req.params.id,
        req.body.isActive
      );
      return res.json({ status: 'success', data });
    } catch (error) {
      return next(error);
    }
  }

  public static async archive(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const data = await AuthService.archiveEmployee(req.user.id, req.params.id);
      return res.json({ status: 'success', data });
    } catch (error) {
      return next(error);
    }
  }

  public static async resetPassword(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const data = await AuthService.resetEmployeePassword(req.user.id, req.params.id);
      return res.json({ status: 'success', data });
    } catch (error) {
      return next(error);
    }
  }

  public static async report(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const data = await AuthService.employeeReport(req.params.id);
      return res.json({ status: 'success', data });
    } catch (error) {
      return next(error);
    }
  }
}
