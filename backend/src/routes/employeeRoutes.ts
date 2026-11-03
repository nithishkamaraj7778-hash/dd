import { Router } from 'express';
import { z } from 'zod';
import { EmployeeController } from '../controllers/employeeController';
import { authenticate, requireEmployer, requirePasswordChangeComplete } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

const employeeIdSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

const createSchema = z.object({
  body: z.object({
    username: z.string().min(3).max(100),
    fullName: z.string().min(2).max(120),
    phone: z.string().max(40).optional(),
    title: z.string().max(80).optional(),
  }).strict(),
});

const updateSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    username: z.string().min(3).max(100).optional(),
    fullName: z.string().min(2).max(120).optional(),
    phone: z.string().max(40).nullable().optional(),
    title: z.string().max(80).nullable().optional(),
  }).strict().refine((body) => Object.keys(body).length > 0, 'At least one field is required'),
});

const activeSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({ isActive: z.boolean() }).strict(),
});

router.use(authenticate, requirePasswordChangeComplete, requireEmployer);
router.get('/', EmployeeController.list);
router.post('/', validate(createSchema), EmployeeController.create);
router.get('/:id/report', validate(employeeIdSchema), EmployeeController.report);
router.patch('/:id', validate(updateSchema), EmployeeController.update);
router.patch('/:id/status', validate(activeSchema), EmployeeController.setActive);
router.post('/:id/reset-password', validate(employeeIdSchema), EmployeeController.resetPassword);
router.delete('/:id', validate(employeeIdSchema), EmployeeController.archive);

export default router;
