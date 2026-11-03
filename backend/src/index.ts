import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import { errorHandler } from './middleware/errorHandler';
import prisma from './config/prisma';
import apiRouter from './routes';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

const app = express();
const PORT = process.env.PORT || 5001;

// Serve the current portal only after its frontend build is available.
const frontendDistDir = path.resolve(__dirname, '../../frontend/dist');

const allowedOrigins = new Set([
  ...(process.env.ALLOWED_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean),
  ...(process.env.NODE_ENV === 'production'
    ? []
    : ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:5001']),
]);

app.use(helmet());
app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS'));
  },
}));
app.use(express.json({ limit: '1mb' }));

if (fs.existsSync(frontendDistDir)) {
  app.use(express.static(frontendDistDir));
}

// Register API Routes
app.use('/api', apiRouter);

// Health Check Endpoint
app.get('/api/health', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.json({
      status: 'ok',
      message: 'DD Enterprises Finance Management API is running.',
      databaseConnected: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// Fallback to index.html for frontend single-page navigation
app.get('*', (req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  const indexPath = path.join(frontendDistDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  next();
});

// Global Error Handler
app.use(errorHandler);

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Frontend accessible at http://localhost:${PORT}`);
  });
}

export default app;
