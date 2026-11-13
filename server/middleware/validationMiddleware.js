/**
 * Express middleware for declarative request payload validation using Zod.
 * Returns standardized HTTP 400 error payloads on validation failure.
 */
export function validateBody(schema) {
  return (req, res, next) => {
    const parseResult = schema.safeParse(req.body);
    if (!parseResult.success) {
      const issues = parseResult.error.issues || parseResult.error.errors || [];
      const fieldErrors = issues.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
        code: err.code,
      }));

      return res.status(400).json({
        error: 'ValidationError',
        code: 'INVALID_REQUEST_BODY',
        message: 'Request payload validation failed.',
        details: fieldErrors,
        timestamp: new Date().toISOString(),
      });
    }

    req.body = parseResult.data;
    next();
  };
}

export default validateBody;

