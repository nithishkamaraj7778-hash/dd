import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { errorHandler } from './middleware/errorHandler';
import prisma from './config/prisma';
import apiRouter from './routes';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

const app = express();
const PORT = process.env.PORT || 5001;

// Prefer the built React app; retain the static app as a fallback for API-only builds.
const frontendDistDir = path.resolve(__dirname, '../../frontend/dist');
const publicDir = path.resolve(__dirname, '../../public');
const staticDir = fs.existsSync(frontendDistDir) ? frontendDistDir : publicDir;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

if (fs.existsSync(staticDir)) {
  app.use(express.static(staticDir));
}

// Register API Routes
app.use('/api', apiRouter);

// Health Check Endpoint
app.get('/api/health', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [settingsCount, usersCount, customersCount, accountsCount] = await Promise.all([
      prisma.systemSetting.count(),
      prisma.user.count(),
      prisma.customer.count(),
      prisma.account.count(),
    ]);

    res.json({
      status: 'ok',
      message: 'DD Enterprises Finance Management API is running.',
      databaseConnected: true,
      stats: {
        users: usersCount,
        customers: customersCount,
        accounts: accountsCount,
        settings: settingsCount,
      },
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
  const indexPath = path.join(staticDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  next();
});

// Global Error Handler
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Frontend accessible at http://localhost:${PORT}`);
});

export default app;
