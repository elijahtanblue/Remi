import { describe, it, expect } from 'vitest';
import {
  AppError,
  NotFoundError,
  ValidationError,
  AuthenticationError,
  ConflictError,
  ExternalServiceError,
  QueueError,
} from '../../packages/shared/src/errors.js';

describe('AppError', () => {
  it('sets message, statusCode, code, and name', () => {
    const err = new AppError('something broke', 500, 'INTERNAL_ERROR');
    expect(err.message).toBe('something broke');
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.name).toBe('AppError');
    expect(err instanceof Error).toBe(true);
  });

  it('defaults to statusCode 500 and code INTERNAL_ERROR', () => {
    const err = new AppError('oops');
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
  });

  it('stores optional details', () => {
    const err = new AppError('oops', 500, 'INTERNAL_ERROR', { field: 'x' });
    expect(err.details).toEqual({ field: 'x' });
  });
});

describe('NotFoundError', () => {
  it('returns 404 with NOT_FOUND code', () => {
    const err = new NotFoundError('Issue', 'PROJ-123');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toContain('Issue');
    expect(err.message).toContain('PROJ-123');
  });

  it('is instanceof AppError', () => {
    expect(new NotFoundError('X', 'y') instanceof AppError).toBe(true);
  });
});

describe('ValidationError', () => {
  it('returns 400 with VALIDATION_ERROR code', () => {
    const err = new ValidationError('bad input');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('accepts details', () => {
    const err = new ValidationError('bad input', { field: 'email' });
    expect(err.details).toEqual({ field: 'email' });
  });
});

describe('AuthenticationError', () => {
  it('returns 401 with AUTHENTICATION_ERROR code', () => {
    const err = new AuthenticationError();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('AUTHENTICATION_ERROR');
  });

  it('uses default message when none provided', () => {
    const err = new AuthenticationError();
    expect(err.message).toBe('Authentication required');
  });

  it('accepts custom message', () => {
    const err = new AuthenticationError('token expired');
    expect(err.message).toBe('token expired');
  });
});

describe('ConflictError', () => {
  it('returns 409 with CONFLICT code', () => {
    const err = new ConflictError('duplicate key');
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('CONFLICT');
  });
});

describe('ExternalServiceError', () => {
  it('returns 502 with service name in message', () => {
    const err = new ExternalServiceError('Slack', 'rate limited');
    expect(err.statusCode).toBe(502);
    expect(err.code).toBe('EXTERNAL_SERVICE_ERROR');
    expect(err.message).toContain('Slack');
    expect(err.message).toContain('rate limited');
  });

  it('stores service in details', () => {
    const err = new ExternalServiceError('Jira', 'timeout');
    expect(err.details?.service).toBe('Jira');
  });
});

describe('QueueError', () => {
  it('returns 500 with QUEUE_ERROR code', () => {
    const err = new QueueError('slack-events', 'connection refused');
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('QUEUE_ERROR');
    expect(err.message).toContain('slack-events');
    expect(err.message).toContain('connection refused');
  });

  it('stores queue name in details', () => {
    const err = new QueueError('summary-jobs', 'timeout');
    expect(err.details?.queue).toBe('summary-jobs');
  });
});
