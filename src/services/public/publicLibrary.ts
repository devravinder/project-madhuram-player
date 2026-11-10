import { retryInBackground, type RetryOptions } from "@/services/backgroundRetry";
import {
  NotLibraryIndexError,
  parseIndex,
  UnsupportedIndexVersionError,
  type LibraryIndex,
  type Manifest,
  type PartRef,
} from "@/services/github/indexTypes";
import { HttpError } from "@/services/httpError";

const RAW = "https://raw.githubusercontent.com";

export type PublicAddress = { owner: string; repo: string };

// Why a library could not be opened, in words a listener understands.
export class PublicLibraryError extends Error {
  readonly reason: "not-found" | "not-library" | "unsupported" | "offline";

  constructor(reason: PublicLibraryError["reason"], message: string) {
    super(message);
    this.reason = reason;
  }
}

export class TrackFileMissingError extends Error {
  constructor() {
    super("File not found, unable to play");
  }
}

const NAME = /^[A-Za-z0-9._-]+$/;

// Accepts owner/repo or a github.com link to the repository.
export function parseAddress(input: string): PublicAddress | undefined {
  const text = input.trim().replace(/^(https?:\/\/)?(www\.)?github\.com\//i, "");
  const [owner, rawRepo] = text.split("/");
  const repo = rawRepo?.replace(/\.git$/i, "");
  if (!owner || !repo || !NAME.test(owner) || !NAME.test(repo)) return undefined;
  return { owner, repo };
}

export const addressKey = ({ owner, repo }: PublicAddress) => `${owner}/${repo}`;

const encode = (path: string) => path.split("/").map(encodeURIComponent).join("/");

export const rawUrl = (owner: string, repo: string, path: string) =>
  `${RAW}/${owner}/${repo}/HEAD/${encode(path)}`;

export class PublicLibrary {
  readonly owner: string;
  readonly repo: string;
  private readonly fetchFn: typeof fetch;
  private readonly retry: RetryOptions;

  // `retry` is for tests; the app uses the real page visibility.
  constructor(
    address: PublicAddress,
    fetchFn: typeof fetch = (...a) => fetch(...a),
    retry: RetryOptions = {},
  ) {
    this.owner = address.owner;
    this.repo = address.repo;
    this.fetchFn = fetchFn;
    this.retry = retry;
  }

  // A request cut off by switching apps is tried again once the app is back.
  private get(url: string, init?: RequestInit) {
    return retryInBackground(
      async () => {
        try {
          return await this.fetchFn(url, init);
        } catch {
          throw new PublicLibraryError("offline", "Cannot reach GitHub. Check your connection.");
        }
      },
      (error) => error instanceof PublicLibraryError && error.reason === "offline",
      this.retry,
    );
  }

  // Always asks GitHub whether the index changed, so removed tracks drop off.
  async loadIndex(): Promise<LibraryIndex> {
    const response = await this.get(rawUrl(this.owner, this.repo, "index.json"), {
      cache: "no-cache",
    });
    if (response.status === 404) {
      throw new PublicLibraryError(
        "not-found",
        `No music library found at ${this.owner}/${this.repo}. It may be private or not exist.`,
      );
    }
    if (!response.ok) throw new HttpError(response.status, `GitHub returned ${response.status}.`);

    try {
      return parseIndex(await response.text());
    } catch (error) {
      if (error instanceof UnsupportedIndexVersionError) {
        throw new PublicLibraryError("unsupported", error.message);
      }
      if (error instanceof NotLibraryIndexError) {
        throw new PublicLibraryError("not-library", `${this.owner}/${this.repo} is not a Madhuram library.`);
      }
      throw error;
    }
  }

  async loadManifest(path: string): Promise<Manifest> {
    const response = await this.get(rawUrl(this.owner, this.repo, path), { cache: "no-cache" });
    if (response.status === 404) throw new TrackFileMissingError();
    if (!response.ok) throw new HttpError(response.status, `GitHub returned ${response.status}.`);
    return (await response.json()) as Manifest;
  }

  partUrl(part: PartRef) {
    return rawUrl(this.owner, part.repo, part.path);
  }

  // A file kept as one part can be played straight from its URL.
  streamUrl(file: { parts: PartRef[] } | undefined) {
    return file && file.parts.length === 1 ? this.partUrl(file.parts[0]) : undefined;
  }

  readPart = async (part: PartRef): Promise<Blob> => {
    const response = await this.get(this.partUrl(part));
    if (response.status === 404) throw new TrackFileMissingError();
    if (!response.ok) throw new HttpError(response.status, `GitHub returned ${response.status}.`);
    return response.blob();
  };
}