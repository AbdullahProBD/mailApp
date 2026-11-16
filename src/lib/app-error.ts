export type AppErrorCode =
  | "VALIDATION_ERROR"
  | "AUTHENTICATION_REQUIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

/** An application error with a safe, user-facing message and stable code. */
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly expose: boolean;

  constructor(
    code: AppErrorCode,
    message: string,
    status: number,
    options?: { cause?: unknown; expose?: boolean },
  ) {
    super(message, { cause: options?.cause });
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    this.expose = options?.expose ?? status < 500;
  }
}

export class ValidationError extends AppError {
  constructor(message = "The provided input is invalid") {
    super("VALIDATION_ERROR", message, 400);
  }
}

export class AuthenticationError extends AppError {
  constructor() {
    super("AUTHENTICATION_REQUIRED", "Authentication is required", 401);
  }
}

export class AuthorizationError extends AppError {
  constructor() {
    super("FORBIDDEN", "You are not allowed to perform this action", 403);
  }
}

export class NotFoundError extends AppError {
  constructor() {
    super("NOT_FOUND", "The requested resource was not found", 404);
  }
}

export class ConflictError extends AppError {
  constructor(message = "The request conflicts with the current state") {
    super("CONFLICT", message, 409);
  }
}

export class RateLimitError extends AppError {
  constructor() {
    super("RATE_LIMITED", "Too many requests. Please try again later", 429);
  }
}

export class InternalError extends AppError {
  constructor(cause?: unknown) {
    super("INTERNAL_ERROR", "An unexpected error occurred", 500, {
      cause,
      expose: false,
    });
  }
}
