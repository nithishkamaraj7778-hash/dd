import { Router } from 'express';
import authRoutes from './authRoutes';
import employeeRoutes from './employeeRoutes';
import financeRoutes from './financeRoutes';

const router = Router();

// Hook authentication endpoints under /auth
router.use('/auth', authRoutes);
router.use('/employees', employeeRoutes);
router.use('/finance', financeRoutes);

export default router;
