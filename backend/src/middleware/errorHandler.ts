import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const isDevelopment = process.env.NODE_ENV === 'development';

  // Handle known operational AppErrors
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
      ...(isDevelopment && { stack: err.stack })
    });
  }

  // Handle Prisma connection or query errors
  if (err.name === 'PrismaClientInitializationError') {
    console.error('Database connection failed:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Database connection failed. Please contact support.',
      ...(isDevelopment && { details: err.message })
    });
  }

  // Log unexpected errors for debugging
  console.error('Unhandled Error:', err);

  return res.status(500).json({
    status: 'error',
    message: 'Internal Server Error',
    ...(isDevelopment && { stack: err.stack, details: err.message })
  });
};
