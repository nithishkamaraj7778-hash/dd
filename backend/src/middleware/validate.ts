import { Request, Response, NextFunction } from 'express';
import { ZodError, ZodType } from 'zod';

export const validate = (schema: ZodType) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        // Format Zod errors nicely
        const formattedErrors = error.issues.map((err) => ({
          field: err.path.slice(1).join('.'), // Remove the first item ('body', 'query', or 'params')
          message: err.message,
        }));

        return res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: formattedErrors,
        });
      }
      return next(error);
    }
  };
};
