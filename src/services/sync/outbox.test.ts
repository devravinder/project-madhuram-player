import db from "@/services/db";
import { HttpError, RateLimitError } from "@/services/httpError";
import { beforeEach, describe, expect, it } from "vitest";
import { MAX_ATTEMPTS, outbox } from "./outbox";

let clock = 1_000_000;
const now = () => clock;

beforeEach(async () => {
  clock = 1_000_000;
  await db.outbox.clear();
});

const run = (handler: Parameters<typeof outbox.run>[0], extra = {}) =>
  outbox.run(handler, { now, ...extra });

describe("outbox", () => {
  it("queues a step once", async () => {
    expect(await outbox.enqueue([{ op: "push", trackId: "a", library: "lib" }], clock)).toBe(1);
    expect(await outbox.enqueue([{ op: "push", trackId: "a", library: "lib" }], clock)).toBe(0);
    expect(await outbox.enqueue([{ op: "pull", trackId: "a", library: "lib" }], clock)).toBe(1);
    expect(await db.outbox.count()).toBe(2);
  });

  it("runs steps in the order they were queued and removes them when done", async () => {
    await outbox.enqueue(
      [
        { op: "push", trackId: "a", library: "lib" },
        { op: "pull", trackId: "b", library: "lib" },
        { op: "delete-remote", trackId: "c", library: "lib" },
      ],
      clock,
    );
    const seen: string[] = [];

    const result = await run(async (item) => void seen.push(item.id));

    expect(seen).toEqual(["push:a", "pull:b", "delete-remote:c"]);
    expect(result).toEqual({ done: 3, failed: 0 });
    expect(await db.outbox.count()).toBe(0);
  });

  it("retries a failing step with a growing delay, then marks it failed", async () => {
    await outbox.enqueue([{ op: "push", trackId: "a", library: "lib" }], clock);
    let calls = 0;
    const failing = async () => {
      calls++;
      throw new Error("boom");
    };

    let waits: number[] = [];
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const result = await run(failing);
      if (result.waitMs) waits.push(result.waitMs);
      clock += 120_000; // past any backoff
    }

    expect(calls).toBe(MAX_ATTEMPTS);
    expect(waits).toEqual([2000, 4000, 8000, 16000]);
    const item = (await outbox.list())[0];
    expect(item.status).toBe("failed");
    expect(item.lastError).toBe("boom");

    // A failed step is left alone until the user retries it.
    expect((await run(failing)).done).toBe(0);
    expect(calls).toBe(MAX_ATTEMPTS);

    await outbox.retryFailed();
    expect((await run(async () => {})).done).toBe(1);
  });

  it("keeps going after one step fails", async () => {
    await outbox.enqueue(
      [
        { op: "push", trackId: "bad", library: "lib" },
        { op: "push", trackId: "good", library: "lib" },
      ],
      clock,
    );
    const seen: string[] = [];

    const result = await run(async (item) => {
      seen.push(item.trackId);
      if (item.trackId === "bad") throw new Error("nope");
    });

    expect(seen).toEqual(["bad", "good"]);
    expect(result.done).toBe(1);
  });

  it("stops on a rate limit and waits as long as GitHub asked", async () => {
    await outbox.enqueue(
      [
        { op: "push", trackId: "a", library: "lib" },
        { op: "push", trackId: "b", library: "lib" },
      ],
      clock,
    );
    const seen: string[] = [];
    const limited = async (item: { trackId: string }) => {
      seen.push(item.trackId);
      throw new RateLimitError("slow down", 30);
    };

    const first = await run(limited);
    expect(first.stoppedBy).toBe("rate-limit");
    expect(first.waitMs).toBe(30_000);
    expect(seen).toEqual(["a"]);
    expect((await outbox.list())[0].attempts).toBe(0); // not the step's fault

    const early = await run(async () => {});
    expect(early.done).toBe(0);
    expect(early.waitMs).toBe(30_000);

    clock += 30_000;
    expect((await run(async () => {})).done).toBe(2);
  });

  it("stops when offline without counting an attempt", async () => {
    await outbox.enqueue([{ op: "push", trackId: "a", library: "lib" }], clock);

    const result = await run(async () => {
      throw new HttpError(0, "offline");
    });

    expect(result.stoppedBy).toBe("offline");
    const item = (await outbox.list())[0];
    expect(item.status).toBe("pending");
    expect(item.attempts).toBe(0);
  });

  it("stops on a rejected token and keeps the step", async () => {
    await outbox.enqueue([{ op: "push", trackId: "a", library: "lib" }], clock);

    const result = await run(async () => {
      throw new HttpError(401, "Bad credentials");
    });

    expect(result.stoppedBy).toBe("auth");
    expect((await outbox.list())[0].status).toBe("pending");
  });

  it("resumes steps that were running when the page closed", async () => {
    await outbox.enqueue([{ op: "push", trackId: "a", library: "lib" }], clock);
    await db.outbox.update("push:a", { status: "running" });

    expect((await run(async () => {})).done).toBe(0); // running is not picked up
    await outbox.resetInterrupted();
    expect((await run(async () => {})).done).toBe(1);
  });

  it("stops between steps when cancelled", async () => {
    await outbox.enqueue(
      [
        { op: "push", trackId: "a", library: "lib" },
        { op: "push", trackId: "b", library: "lib" },
      ],
      clock,
    );
    let cancelled = false;

    const result = await run(async () => void (cancelled = true), {
      isCancelled: () => cancelled,
    });

    expect(result).toEqual({ done: 1, failed: 0, stoppedBy: "cancelled" });
    expect(await db.outbox.count()).toBe(1);
  });
});
