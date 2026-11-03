import { Router } from 'express';
import authRoutes from './authRoutes';
import financeRoutes from './financeRoutes';

const router = Router();

// Hook authentication endpoints under /auth
router.use('/auth', authRoutes);
router.use('/finance', financeRoutes);

export default router;
