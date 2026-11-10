import db from "@/services/db";
import { HttpError, RateLimitError } from "@/services/httpError";
import type { OutboxItem, OutboxOp } from "@/types/music";

export const MAX_ATTEMPTS = 5;
const MAX_BACKOFF_MS = 60_000;

export type OutboxHandler = (item: OutboxItem) => Promise<void>;

export type RunResult = {
  done: number;
  failed: number;
  // Why the run ended early, if it did.
  stoppedBy?: "offline" | "rate-limit" | "auth" | "cancelled";
  // When the next waiting item becomes due, in milliseconds from now.
  waitMs?: number;
};

export type RunOptions = {
  now?: () => number;
  isCancelled?: () => boolean;
  onProgress?: (item: OutboxItem) => void;
};

const keyOf = (op: OutboxOp, trackId: string) => `${op}:${trackId}`;

export const outbox = {
  // Queuing the same step twice does nothing. Returns how many were new.
  async enqueue(
    steps: { op: OutboxOp; trackId: string }[],
    now = Date.now(),
  ): Promise<number> {
    let added = 0;
    for (const [offset, step] of steps.entries()) {
      const id = keyOf(step.op, step.trackId);
      if (await db.outbox.get(id)) continue;
      await db.outbox.add({
        id,
        op: step.op,
        trackId: step.trackId,
        status: "pending",
        attempts: 0,
        nextAttemptAt: 0,
        createdAt: now + offset, // keeps the order they were queued in
      });
      added++;
    }
    return added;
  },

  list: () => db.outbox.orderBy("createdAt").toArray(),

  // After a reload or crash, a step that was running did not finish.
  async resetInterrupted() {
    await db.outbox.where("status").equals("running").modify({ status: "pending" });
  },

  async retryFailed() {
    await db.outbox
      .where("status")
      .equals("failed")
      .modify({ status: "pending", attempts: 0, lastError: undefined, nextAttemptAt: 0 });
  },

  clear: () => db.outbox.clear(),

  async run(handler: OutboxHandler, options: RunOptions = {}): Promise<RunResult> {
    const now = options.now ?? Date.now;
    const result: RunResult = { done: 0, failed: 0 };

    for (;;) {
      if (options.isCancelled?.()) {
        result.stoppedBy = "cancelled";
        return result;
      }

      const pending = (await db.outbox.where("status").equals("pending").sortBy("createdAt"));
      const due = pending.find((item) => item.nextAttemptAt <= now());
      if (!due) {
        if (pending.length > 0) {
          result.waitMs = Math.min(...pending.map((item) => item.nextAttemptAt)) - now();
        }
        return result;
      }

      await db.outbox.update(due.id, { status: "running" });
      options.onProgress?.({ ...due, status: "running" });

      try {
        await handler(due);
        await db.outbox.delete(due.id);
        result.done++;
      } catch (error) {
        const stop = await this.handleFailure(due, error, now());
        if (stop) {
          result.stoppedBy = stop;
          return result;
        }
        if ((await db.outbox.get(due.id))?.status === "failed") result.failed++;
      }
    }
  },

  // Returns a reason to stop the whole run, or undefined to carry on.
  async handleFailure(
    item: OutboxItem,
    error: unknown,
    at: number,
  ): Promise<RunResult["stoppedBy"] | undefined> {
    if (error instanceof RateLimitError) {
      // The limit is account-wide, so every waiting step holds off.
      await db.outbox.update(item.id, { status: "pending" });
      const until = at + error.retryAfterSeconds * 1000;
      await db.outbox
        .where("status")
        .equals("pending")
        .modify((waiting) => {
          waiting.nextAttemptAt = Math.max(waiting.nextAttemptAt, until);
        });
      return "rate-limit";
    }
    if (error instanceof HttpError && error.status === 0) {
      await db.outbox.update(item.id, { status: "pending" });
      return "offline";
    }
    if (error instanceof HttpError && error.status === 401) {
      await db.outbox.update(item.id, { status: "pending" });
      return "auth";
    }

    const attempts = item.attempts + 1;
    const message = error instanceof Error ? error.message : String(error);
    if (attempts >= MAX_ATTEMPTS) {
      await db.outbox.update(item.id, { status: "failed", attempts, lastError: message });
    } else {
      const backoff = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempts);
      await db.outbox.update(item.id, {
        status: "pending",
        attempts,
        lastError: message,
        nextAttemptAt: at + backoff,
      });
    }
    return undefined;
  },
};
