export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode = 500,
    code = "INTERNAL_ERROR",
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, identifier: string) {
    super(`${entity} not found: ${identifier}`, 404, "NOT_FOUND", {
      entity,
      identifier,
    });
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 400, "VALIDATION_ERROR", details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Authentication required") {
    super(message, 401, "AUTHENTICATION_ERROR");
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 409, "CONFLICT", details);
  }
}

export class ExternalServiceError extends AppError {
  constructor(
    service: string,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(`${service}: ${message}`, 502, "EXTERNAL_SERVICE_ERROR", {
      service,
      ...details,
    });
  }
}

export class QueueError extends AppError {
  constructor(
    queue: string,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(`Queue ${queue}: ${message}`, 500, "QUEUE_ERROR", {
      queue,
      ...details,
    });
  }
}
