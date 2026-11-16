import { describe, expect, it } from "vitest";
import {
  AppError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  InternalError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from "@/lib/app-error";

describe("application errors", () => {
  it("provides stable safe status, code and message values", () => {
    const error = new ValidationError("Invalid input");
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.status).toBe(400);
    expect(error.expose).toBe(true);
    expect(error.message).toBe("Invalid input");
  });

  it("maps authorization errors to appropriate HTTP statuses", () => {
    expect(new AuthenticationError().status).toBe(401);
    expect(new AuthorizationError().status).toBe(403);
    expect(new NotFoundError().status).toBe(404);
    expect(new ConflictError().status).toBe(409);
    expect(new RateLimitError().status).toBe(429);
  });

  it("hides internal error details but retains its cause", () => {
    const cause = new Error("private details");
    const error = new InternalError(cause);
    expect(error.expose).toBe(false);
    expect(error.message).not.toContain("private details");
    expect(error.cause).toBe(cause);
  });
});
