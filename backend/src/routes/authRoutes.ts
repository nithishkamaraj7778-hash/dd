import { Router } from 'express';
import { z } from 'zod';
import { AuthController } from '../controllers/authController';
import { validate } from '../middleware/validate';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

const loginSchema = z.object({
  body: z.object({
    username: z.string().min(1, 'Username is required'),
    password: z.string().min(1, 'Password is required'),
  }),
});

const registerSchema = z.object({
  body: z.object({
    username: z.string().min(3, 'Username must be at least 3 characters'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    fullName: z.string().min(1, 'Full name is required'),
    role: z.enum(['SUPERADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE'], {
      errorMap: () => ({ message: 'Role must be SUPERADMIN, ADMIN, MANAGER, or EMPLOYEE' }),
    }),
  }),
});

router.post('/login', validate(loginSchema), AuthController.login);
router.post('/register', validate(registerSchema), AuthController.register);
router.post('/logout', AuthController.logout);
router.get('/me', authenticate, AuthController.me);
router.get('/admins', authenticate, authorize(['SUPERADMIN']), AuthController.listAdmins);

export default router;

