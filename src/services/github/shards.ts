import { realSleep, waitForHead, writeTextFile, type Sleep } from "./discovery";
import { APP_MARKER, type LibraryIndex, type RepoInfo } from "./indexTypes";
import { LibraryRepo } from "./library";

export const SHARD_MARKER_PATH = "shard.json";

const MAX_NAME_TRIES = 50;

type ShardMarker = { app: typeof APP_MARKER; role: "shard"; library: string };

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const shardPattern = (primary: string) =>
  new RegExp(`^${escapeRegExp(primary)}-(\\d+)$`);

export const shardName = (primary: string, n: number) => `${primary}-${n}`;

export function nextShardNumber(index: LibraryIndex): number {
  const pattern = shardPattern(index.repos[0].name);
  const numbers = index.repos.map((repo) => Number(pattern.exec(repo.name)?.[1] ?? 0));
  return Math.max(0, ...numbers) + 1;
}

async function readMarker(
  library: LibraryRepo,
  repo: string,
): Promise<ShardMarker | undefined> {
  const file = await library.api.getFile(library.owner, repo, SHARD_MARKER_PATH);
  if (!file) return undefined;
  try {
    return JSON.parse(file.text) as ShardMarker;
  } catch {
    return undefined;
  }
}

const isOurShard = (marker: ShardMarker | undefined, primary: string) =>
  marker?.app === APP_MARKER &&
  marker.role === "shard" &&
  marker.library === primary;

const sizeEstimate = (kib: number | undefined) => Math.round((kib ?? 0) * 1024);

// Makes the next shard repo, or adopts one left behind by a lost index update.
async function createShard(
  library: LibraryRepo,
  primary: string,
  startAt: number,
  sleep: Sleep,
): Promise<RepoInfo> {
  const { api, owner } = library;

  for (let n = startAt; n < startAt + MAX_NAME_TRIES; n++) {
    const name = shardName(primary, n);
    const existing = await api.getRepo(owner, name);

    if (existing) {
      if (isOurShard(await readMarker(library, name), primary)) {
        return { name, usedBytes: sizeEstimate(existing.size), full: false };
      }
      continue; // the name belongs to something else
    }

    const created = await api.createRepo(name, `Madhuram music library, part ${n}`);
    await waitForHead(api, owner, name, created.default_branch, sleep);
    const marker: ShardMarker = { app: APP_MARKER, role: "shard", library: primary };
    await writeTextFile(
      api,
      owner,
      name,
      created.default_branch,
      SHARD_MARKER_PATH,
      `${JSON.stringify(marker, null, 2)}\n`,
      "Mark as library shard",
    );
    return { name, usedBytes: 0, full: false };
  }
  throw new Error("Could not find a free repository name.");
}

// Called when the current repository has no room: starts the next one.
export async function rolloverRepo(
  library: LibraryRepo,
  sleep: Sleep = realSleep,
): Promise<string> {
  const { index } = await library.read();
  const full = index.currentRepo;
  const shard = await createShard(
    library,
    index.repos[0].name,
    nextShardNumber(index),
    sleep,
  );

  await library.update((current) => {
    // Another device may have rolled over already; keep its choice.
    if (current.currentRepo !== full) {
      return { message: "Keep current repository", index: current };
    }
    // Keep it open while it can still take a part, so its space is not wasted.
    const repos = current.repos.map((repo) =>
      repo.name === full &&
      current.config.maxRepoBytes - repo.usedBytes < current.config.maxFileBytes
        ? { ...repo, full: true }
        : repo,
    );
    if (!repos.some((repo) => repo.name === shard.name)) repos.push(shard);
    return {
      message: `Add repository ${shard.name}`,
      index: { ...current, repos, currentRepo: shard.name },
    };
  });
  return shard.name;
}

// Finds shard repos that exist on GitHub but are missing from the index.
export async function recoverShards(library: LibraryRepo): Promise<string[]> {
  const { index } = await library.read();
  const primary = index.repos[0].name;
  const pattern = shardPattern(primary);
  const known = new Set(index.repos.map((repo) => repo.name));

  const candidates = (await library.api.listOwnRepos()).filter(
    (repo) => pattern.test(repo.name) && !known.has(repo.name),
  );

  const found: RepoInfo[] = [];
  for (const repo of candidates) {
    if (isOurShard(await readMarker(library, repo.name), primary)) {
      found.push({ name: repo.name, usedBytes: sizeEstimate(repo.size), full: false });
    }
  }
  if (found.length === 0) return [];

  await library.update((current) => {
    const have = new Set(current.repos.map((repo) => repo.name));
    const added = found.filter((repo) => !have.has(repo.name));
    return {
      message: "Recover repositories",
      index: { ...current, repos: [...current.repos, ...added] },
    };
  });
  return found.map((repo) => repo.name);
}
