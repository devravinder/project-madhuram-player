import { QueryClient } from "@tanstack/react-query";
import { HttpError } from "@/services/httpError";

const RATE_LIMIT_STATUS = 403;

// Client errors will not succeed on retry, except a rate limit.
const shouldRetry = (failureCount: number, error: unknown) => {
  if (error instanceof HttpError) {
    const isClientError = error.status >= 400 && error.status < 500;
    if (isClientError && error.status !== RATE_LIMIT_STATUS) return false;
  }
  return failureCount < 2;
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: shouldRetry, refetchOnWindowFocus: false },
  },
});
