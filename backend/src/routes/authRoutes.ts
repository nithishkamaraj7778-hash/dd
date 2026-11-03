import { Router } from 'express';
import { z } from 'zod';
import { AuthController } from '../controllers/authController';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import { rateLimit } from 'express-rate-limit';

const router = Router();
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { status: 'error', message: 'Too many login attempts. Try again later.' },
});

const loginSchema = z.object({
  body: z.object({
    username: z.string().min(1).max(100),
    password: z.string().min(1).max(200),
  }).strict(),
});

const passwordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1).max(200),
    newPassword: z.string().min(12).max(200),
  }).strict(),
});

const profileSchema = z.object({
  body: z.object({
    fullName: z.string().min(2).max(120).optional(),
    phone: z.string().max(40).nullable().optional(),
  }).strict().refine((body) => Object.keys(body).length > 0, 'At least one field is required'),
});

router.post('/login', loginRateLimit, validate(loginSchema), AuthController.login);
router.get('/me', authenticate, AuthController.me);
router.post('/logout', authenticate, AuthController.logout);
router.post('/change-password', authenticate, validate(passwordSchema), AuthController.changePassword);
router.patch('/me', authenticate, validate(profileSchema), AuthController.updateProfile);

export default router;
