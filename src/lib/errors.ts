export class DomainError extends Error {
  readonly statusCode: number;
  readonly code?: string;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode = 400,
    options?: {
      code?: string;
      details?: Record<string, unknown>;
    },
  ) {
    super(message);
    this.name = 'DomainError';
    this.statusCode = statusCode;
    this.code = options?.code;
    this.details = options?.details;
  }
}
