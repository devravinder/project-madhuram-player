export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// GitHub asks the client to wait before trying again.
export class RateLimitError extends HttpError {
  readonly retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds: number) {
    super(429, message);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
