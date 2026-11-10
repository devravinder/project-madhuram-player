import { HttpError, NetworkError, RateLimitError } from "@/services/httpError";
import { pageVisibility } from "@/services/pageVisibility";
import { base64ToText, blobToBase64, textToBase64 } from "./base64";

const API = "https://api.github.com";
const DEFAULT_RETRY_SECONDS = 60;
// While the app is in the background, a cut-off request is tried again
// every few seconds (or as soon as the app is back), for up to 30 minutes.
const BACKGROUND_RETRY_MS = 5_000;
const BACKGROUND_MAX_MS = 30 * 60 * 1000;
const BACKGROUND_MAX_ATTEMPTS = 400;
const RETRIES_AFTER_BACK = 3;
const AFTER_BACK_DELAY_MS = 1_000;

type Sleep = (ms: number) => Promise<void>;
const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export type Visibility = Pick<
  typeof pageVisibility,
  "isHidden" | "hiddenTimes" | "waitUntilVisible"
>;

export type Repo = {
  name: string;
  private: boolean;
  default_branch: string;
  size?: number; // KiB, as GitHub reports it (can lag behind)
};
export type Head = { branch: string; commitSha: string; treeSha: string };
export type TreeEntry = {
  path: string;
  type: "blob" | "tree";
  sha: string;
  size?: number; // bytes, for blobs
};
// A null sha removes the path.
export type TreeChange = { path: string; sha: string | null };
export type RepoFile = { sha: string; text: string };

type FetchFn = typeof fetch;

type Options = { method?: string; body?: unknown; accept?: string };

const encodePath = (path: string) =>
  path.split("/").map(encodeURIComponent).join("/");

async function toError(response: Response): Promise<HttpError> {
  let message = `GitHub returned ${response.status}.`;
  try {
    const body = (await response.json()) as { message?: string };
    if (body.message) message = body.message;
  } catch {
    // The body is not JSON; keep the generic message.
  }

  const limited =
    response.status === 429 ||
    (response.status === 403 &&
      (response.headers.get("x-ratelimit-remaining") === "0" ||
        /rate limit|abuse/i.test(message)));
  if (limited) {
    const retryAfter = Number(response.headers.get("retry-after"));
    return new RateLimitError(
      message,
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter
        : DEFAULT_RETRY_SECONDS,
    );
  }
  return new HttpError(response.status, message);
}

// A moved branch rejects the update; callers re-read and try again.
export const isConflict = (error: unknown) =>
  error instanceof HttpError &&
  (error.status === 409 ||
    (error.status === 422 && /fast forward/i.test(error.message)));

export class GithubApi {
  private readonly token: string;
  private readonly fetchFn: FetchFn;
  private readonly visibility: Visibility;
  private readonly sleep: Sleep;

  constructor(
    token: string,
    fetchFn: FetchFn = (...args) => fetch(...args),
    visibility: Visibility = pageVisibility,
    sleep: Sleep = realSleep,
  ) {
    this.token = token;
    this.fetchFn = fetchFn;
    this.visibility = visibility;
    this.sleep = sleep;
  }

  private async request(path: string, options: Options = {}) {
    const started = Date.now();
    const hiddenAtStart = this.visibility.hiddenTimes();
    let sawHidden = this.visibility.isHidden();
    let retriesAfterBack = 0;
    for (let attempt = 1; ; attempt++) {
      try {
        const response = await this.send(path, options);
        if (!response.ok) throw await toError(response);
        return response;
      } catch (error) {
        if (!(error instanceof NetworkError)) throw error;
        // Cut off because the app went to the background: wait until it is
        // back (trying again now and then while hidden), then carry on.
        const hidden = this.visibility.isHidden();
        sawHidden ||= hidden || this.visibility.hiddenTimes() !== hiddenAtStart;
        const tooLong =
          Date.now() - started > BACKGROUND_MAX_MS || attempt >= BACKGROUND_MAX_ATTEMPTS;
        if (!sawHidden || tooLong) throw error;

        if (hidden) {
          await this.visibility.waitUntilVisible(BACKGROUND_RETRY_MS);
        } else {
          // Back in front: the network can take a moment to return.
          if (retriesAfterBack >= RETRIES_AFTER_BACK) throw error;
          retriesAfterBack++;
          await this.sleep(AFTER_BACK_DELAY_MS * retriesAfterBack);
        }
      }
    }
  }

  private async send(path: string, options: Options) {
    try {
      return await this.fetchFn(`${API}${path}`, {
        method: options.method ?? "GET",
        // GitHub sends max-age=60; a cached branch ref would point at an
        // old commit right after a push (for example a fresh repo's README).
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: options.accept ?? "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(options.body !== undefined && {
            "Content-Type": "application/json",
          }),
        },
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
      });
    } catch {
      throw new NetworkError();
    }
  }

  // Returns null when the status is one of the "missing" ones.
  private async requestOrNull(
    path: string,
    missing: number[],
    options: Options = {},
  ) {
    try {
      return await this.request(path, options);
    } catch (error) {
      if (error instanceof HttpError && missing.includes(error.status)) {
        return null;
      }
      throw error;
    }
  }

  async getUser(): Promise<{ login: string }> {
    return (await this.request("/user")).json();
  }

  async getRepo(owner: string, name: string): Promise<Repo | null> {
    const response = await this.requestOrNull(`/repos/${owner}/${name}`, [404]);
    return response ? response.json() : null;
  }

  async createRepo(name: string, description: string): Promise<Repo> {
    const response = await this.request("/user/repos", {
      method: "POST",
      body: { name, description, private: true, auto_init: true },
    });
    return response.json();
  }

  async listOwnRepos(): Promise<Repo[]> {
    const all: Repo[] = [];
    for (let page = 1; ; page++) {
      const response = await this.request(
        `/user/repos?affiliation=owner&per_page=100&page=${page}`,
      );
      const batch = (await response.json()) as Repo[];
      all.push(...batch);
      if (batch.length < 100) return all;
    }
  }

  // Null when the repository has no commits yet.
  async getRootEntries(
    owner: string,
    repo: string,
    branch: string,
  ): Promise<TreeEntry[] | null> {
    const response = await this.requestOrNull(
      `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}`,
      [404, 409],
    );
    if (!response) return null;
    return ((await response.json()) as { tree: TreeEntry[] }).tree;
  }

  // Entries of one tree object (not recursive).
  async getTree(owner: string, repo: string, treeSha: string) {
    const response = await this.request(
      `/repos/${owner}/${repo}/git/trees/${treeSha}`,
    );
    return ((await response.json()) as { tree: TreeEntry[] }).tree;
  }

  // Reads a file from a known tree by walking its folders. Tree and blob
  // ids never change, so this sees exactly that commit and returns null
  // for a missing file without a 404 round trip.
  async getFileInTree(
    owner: string,
    repo: string,
    treeSha: string,
    path: string,
  ): Promise<RepoFile | null> {
    const parts = path.split("/");
    const folder = await this.findFolder(owner, repo, treeSha, parts.slice(0, -1));
    const entry = folder?.find(
      (e) => e.path === parts[parts.length - 1] && e.type === "blob",
    );
    if (!entry) return null;
    const blob = await this.readBlob(owner, repo, entry.sha);
    return { sha: entry.sha, text: await blob.text() };
  }

  // Files directly inside a folder of a known tree, with full paths.
  async listFolderFiles(
    owner: string,
    repo: string,
    treeSha: string,
    folder: string,
  ): Promise<TreeEntry[]> {
    const entries = await this.findFolder(owner, repo, treeSha, folder.split("/"));
    return (entries ?? [])
      .filter((e) => e.type === "blob")
      .map((e) => ({ ...e, path: `${folder}/${e.path}` }));
  }

  private async findFolder(
    owner: string,
    repo: string,
    treeSha: string,
    names: string[],
  ): Promise<TreeEntry[] | null> {
    let entries = await this.getTree(owner, repo, treeSha);
    for (const name of names) {
      const next = entries.find((e) => e.path === name && e.type === "tree");
      if (!next) return null;
      entries = await this.getTree(owner, repo, next.sha);
    }
    return entries;
  }

  async getHead(
    owner: string,
    repo: string,
    branch: string,
  ): Promise<Head | null> {
    const ref = await this.requestOrNull(
      `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`,
      [404, 409],
    );
    if (!ref) return null;
    const commitSha = ((await ref.json()) as { object: { sha: string } }).object
      .sha;

    const commit = await this.request(
      `/repos/${owner}/${repo}/git/commits/${commitSha}`,
    );
    const treeSha = ((await commit.json()) as { tree: { sha: string } }).tree
      .sha;
    return { branch, commitSha, treeSha };
  }

  async getFile(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
  ): Promise<RepoFile | null> {
    const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    const response = await this.requestOrNull(
      `/repos/${owner}/${repo}/contents/${encodePath(path)}${query}`,
      [404],
    );
    if (!response) return null;

    const body = (await response.json()) as {
      sha: string;
      encoding: string;
      content: string;
    };
    // Files over 1 MB come back without content; read the blob instead.
    if (body.encoding !== "base64") {
      const blob = await this.readBlob(owner, repo, body.sha);
      return { sha: body.sha, text: await blob.text() };
    }
    return { sha: body.sha, text: base64ToText(body.content) };
  }

  // The contents API can make the first commit in an empty repository.
  async putFile(
    owner: string,
    repo: string,
    path: string,
    text: string,
    message: string,
  ): Promise<void> {
    await this.request(`/repos/${owner}/${repo}/contents/${encodePath(path)}`, {
      method: "PUT",
      body: { message, content: textToBase64(text) },
    });
  }
  async readBlob(owner: string, repo: string, sha: string): Promise<Blob> {
    const response = await this.request(
      `/repos/${owner}/${repo}/git/blobs/${sha}`,
      { accept: "application/vnd.github.raw+json" },
    );
    return response.blob();
  }

  async createBlob(owner: string, repo: string, data: Blob): Promise<string> {
    return this.createBlobFromBase64(owner, repo, await blobToBase64(data));
  }

  createTextBlob(owner: string, repo: string, text: string) {
    return this.createBlobFromBase64(owner, repo, textToBase64(text));
  }

  private async createBlobFromBase64(
    owner: string,
    repo: string,
    content: string,
  ) {
    const response = await this.request(`/repos/${owner}/${repo}/git/blobs`, {
      method: "POST",
      body: { content, encoding: "base64" },
    });
    return ((await response.json()) as { sha: string }).sha;
  }
  // One commit for all changes; throws a conflict error if the branch moved.
  async commitChanges(
    owner: string,
    repo: string,
    head: Head,
    message: string,
    changes: TreeChange[],
  ): Promise<Head> {
    const base = `/repos/${owner}/${repo}/git`;

    const tree = (await (
      await this.request(`${base}/trees`, {
        method: "POST",
        body: {
          base_tree: head.treeSha,
          tree: changes.map((change) => ({
            path: change.path,
            mode: "100644",
            type: "blob",
            sha: change.sha,
          })),
        },
      })
    ).json()) as { sha: string };

    const commit = (await (
      await this.request(`${base}/commits`, {
        method: "POST",
        body: { message, tree: tree.sha, parents: [head.commitSha] },
      })
    ).json()) as { sha: string };

    await this.request(
      `${base}/refs/heads/${encodeURIComponent(head.branch)}`,
      { method: "PATCH", body: { sha: commit.sha, force: false } },
    );
    return { branch: head.branch, commitSha: commit.sha, treeSha: tree.sha };
  }
}
