import { gitBlobSha } from "@/services/hash";
import { base64ToBytes, bytesToBase64 } from "@/services/github/base64";

type Files = Record<string, string | Uint8Array>;
type Snapshot = Record<string, string>; // path -> blob id

type FakeRepo = {
  name: string;
  private: boolean;
  blobs: Map<string, Uint8Array>;
  trees: Map<string, Snapshot>;
  commits: Map<string, { tree: string; parents: string[] }>;
  branches: Map<string, string>; // branch -> commit id
};

const BRANCH = "main";
const CONTENTS_LIMIT = 1_000_000;

const toBytes = (value: string | Uint8Array) =>
  typeof value === "string" ? new TextEncoder().encode(value) : value;

async function sha1Hex(text: string) {
  const digest = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

const failure = (status: number, message: string, headers: HeadersInit = {}) =>
  json({ message }, status, headers);

// A small stand-in for the GitHub REST API, enough for the library code.
export class FakeGithub {
  readonly login: string;
  readonly token: string;
  readonly repos = new Map<string, FakeRepo>();
  readonly requests: string[] = [];

  private rateLimited = 0;
  private writesLimited = 0;
  private refLag = 0;
  private beforeRefUpdate?: () => Promise<void>;
  private counter = 0;
  // Folder ids from tree listings, so nested trees can be fetched.
  private readonly folders = new Map<string, { snapshot: Snapshot; prefix: string }>();

  constructor(login = "tester", token = "good-token") {
    this.login = login;
    this.token = token;
  }

  // ---- test controls -------------------------------------------------

  limitNext(count: number) {
    this.rateLimited = count;
  }

  // Like limitNext, but only for requests that change data.
  limitNextWrites(count: number) {
    this.writesLimited = count;
  }

  // The next branch lookups say "not found", like a repo that was just created.
  lagRefLookups(count: number) {
    this.refLag = count;
  }

  // Runs once, right before the next branch update, to simulate another device.
  onNextRefUpdate(callback: () => Promise<void>) {
    this.beforeRefUpdate = callback;
  }

  async seedRepo(name: string, files: Files, isPrivate = true) {
    const repo = this.emptyRepo(name, isPrivate);
    this.repos.set(name, repo);
    await this.commitTo(repo, files, "seed");
    return repo;
  }

  seedEmptyRepo(name: string) {
    const repo = this.emptyRepo(name, true);
    this.repos.set(name, repo);
    return repo;
  }

  // Direct write, as if another client pushed.
  async pushFiles(name: string, files: Files, message = "external") {
    await this.commitTo(this.mustRepo(name), files, message);
  }

  fileText(name: string, path: string) {
    const repo = this.mustRepo(name);
    const blob = this.headSnapshot(repo)[path];
    return blob ? new TextDecoder().decode(repo.blobs.get(blob)) : undefined;
  }

  fileBytes(name: string, path: string) {
    const repo = this.mustRepo(name);
    const blob = this.headSnapshot(repo)[path];
    return blob ? repo.blobs.get(blob) : undefined;
  }

  paths(name: string) {
    return Object.keys(this.headSnapshot(this.mustRepo(name))).sort();
  }

  commitCount(name: string) {
    return this.mustRepo(name).commits.size;
  }

  // ---- fetch ----------------------------------------------------------

  fetch: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : String(input));
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    this.requests.push(`${method} ${url.host === "raw.githubusercontent.com" ? "raw:" : ""}${url.pathname}`);

    if (url.host === "raw.githubusercontent.com") return this.raw(url);

    if (headers.get("authorization") !== `Bearer ${this.token}`) {
      return failure(401, "Bad credentials");
    }
    if (this.rateLimited > 0) {
      this.rateLimited--;
      return failure(403, "API rate limit exceeded", {
        "x-ratelimit-remaining": "0",
        "retry-after": "7",
      });
    }

    if (this.writesLimited > 0 && method !== "GET") {
      this.writesLimited--;
      return failure(403, "API rate limit exceeded", {
        "x-ratelimit-remaining": "0",
        "retry-after": "7",
      });
    }

    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    return this.route(method, url, headers, body);
  };

  // ---- routing --------------------------------------------------------

  private async route(
    method: string,
    url: URL,
    headers: Headers,
    body: any,
  ): Promise<Response> {
    const path = url.pathname;

    if (method === "GET" && path === "/user") {
      return json({ login: this.login, avatar_url: "https://example/a.png" });
    }
    if (method === "GET" && path === "/user/repos") return this.listRepos(url);
    if (method === "POST" && path === "/user/repos") return this.createRepo(body);

    const match = path.match(/^\/repos\/([^/]+)\/([^/]+)(\/.*)?$/);
    if (!match) return failure(404, "Not Found");

    const [, owner, name, rest = ""] = match;
    const repo = this.repos.get(name);
    if (owner !== this.login || !repo) return failure(404, "Not Found");

    if (method === "GET" && rest === "") return json(this.repoJson(repo));

    if (method === "PUT" && rest.startsWith("/contents/")) {
      const file = decodeURIComponent(rest.slice(10));
      await this.commitTo(repo, { [file]: base64ToBytes(body.content) }, body.message);
      return json({ content: { path: file } }, 201);
    }    if (method === "GET" && rest.startsWith("/contents/")) {
      return this.contents(repo, decodeURIComponent(rest.slice(10)), url.searchParams.get("ref"));
    }
    if (method === "GET" && rest.startsWith("/git/trees/")) {
      return this.rootTree(repo, decodeURIComponent(rest.slice(11)));
    }
    if (method === "GET" && rest.startsWith("/git/ref/heads/")) {
      if (this.refLag > 0) {
        this.refLag--;
        return failure(404, "Not Found");
      }
      const commit = repo.branches.get(decodeURIComponent(rest.slice(15)));
      return commit
        ? json({ object: { sha: commit } })
        : failure(repo.branches.size ? 404 : 409, "Git Repository is empty.");
    }
    if (method === "GET" && rest.startsWith("/git/commits/")) {
      const commit = repo.commits.get(rest.slice(13));
      return commit ? json({ sha: rest.slice(13), tree: { sha: commit.tree } }) : failure(404, "Not Found");
    }
    if (method === "GET" && rest.startsWith("/git/blobs/")) {
      return this.readBlob(repo, rest.slice(11), headers);
    }
    if (method === "POST" && rest === "/git/blobs") return this.createBlob(repo, body);
    if (method === "POST" && rest === "/git/trees") return this.createTree(repo, body);
    if (method === "POST" && rest === "/git/commits") return this.createCommit(repo, body);
    if (method === "PATCH" && rest.startsWith("/git/refs/heads/")) {
      return this.updateRef(repo, decodeURIComponent(rest.slice(16)), body);
    }
    return failure(404, "Not Found");
  }

  // ---- handlers -------------------------------------------------------

  // raw.githubusercontent.com: no sign-in, public repos only.
  private raw(url: URL) {
    const [, owner, name, ref, ...rest] = url.pathname.split("/");
    const repo = this.repos.get(name);
    if (owner !== this.login || !repo || repo.private || ref !== "HEAD") {
      return new Response("404: Not Found", { status: 404 });
    }
    const sha = this.headSnapshot(repo)[rest.map(decodeURIComponent).join("/")];
    const bytes = sha ? repo.blobs.get(sha) : undefined;
    return bytes
      ? new Response(bytes as BodyInit, { status: 200, headers: { "access-control-allow-origin": "*" } })
      : new Response("404: Not Found", { status: 404 });
  }


  private listRepos(url: URL) {
    const page = Number(url.searchParams.get("page") ?? 1);
    const size = Number(url.searchParams.get("per_page") ?? 30);
    const all = [...this.repos.values()].map((r) => this.repoJson(r));
    return json(all.slice((page - 1) * size, page * size));
  }

  private async createRepo(body: { name: string; private?: boolean; auto_init?: boolean }) {
    if (this.repos.has(body.name)) {
      return json(
        {
          message: "Repository creation failed.",
          errors: [{ message: "name already exists on this account" }],
        },
        422,
      );
    }
    const repo = this.emptyRepo(body.name, body.private ?? true);
    this.repos.set(body.name, repo);
    if (body.auto_init) await this.commitTo(repo, { "README.md": `# ${body.name}\n` }, "Initial commit");
    return json(this.repoJson(repo), 201);
  }

  private contents(repo: FakeRepo, path: string, ref: string | null) {
    if (!repo.branches.size) return failure(404, "This repository is empty.");
    const commit = ref ? repo.commits.get(ref) : undefined;
    if (ref && !commit) return failure(404, "No commit found for the ref");
    const snapshot = commit ? repo.trees.get(commit.tree)! : this.headSnapshot(repo);
    const sha = snapshot[path];
    if (!sha) return failure(404, "Not Found");

    const bytes = repo.blobs.get(sha)!;
    const big = bytes.length > CONTENTS_LIMIT;
    return json({
      type: "file",
      path,
      sha,
      size: bytes.length,
      encoding: big ? "none" : "base64",
      content: big ? "" : bytesToBase64(bytes).replace(/(.{60})/g, "$1\n"),
    });
  }

  private rootTree(repo: FakeRepo, ref: string) {
    // A branch name, a tree id, or a folder id handed out by an earlier listing.
    const folder = this.folders.get(ref);
    if (folder) return this.listing(folder.snapshot, folder.prefix, ref);
    const tree = repo.trees.get(ref);
    if (tree) return this.listing(tree, "", ref);

    const commitId = repo.branches.get(ref);
    if (!repo.branches.size) return failure(409, "Git Repository is empty.");
    if (!commitId) return failure(404, "Not Found");
    const treeSha = repo.commits.get(commitId)!.tree;
    return this.listing(repo.trees.get(treeSha)!, "", treeSha);
  }

  private async listing(snapshot: Snapshot, prefix: string, sha: string) {
    const entries = new Map<string, { path: string; type: string; sha: string }>();
    for (const [path, blob] of Object.entries(snapshot)) {
      if (!path.startsWith(prefix)) continue;
      const [first, ...tail] = path.slice(prefix.length).split("/");
      if (!tail.length) {
        entries.set(first, { path: first, type: "blob", sha: blob });
      } else if (!entries.has(first)) {
        const inner = `${prefix}${first}/`;
        const id = await sha1Hex(`folder ${JSON.stringify(Object.entries(snapshot).sort())} ${inner}`);
        this.folders.set(id, { snapshot, prefix: inner });
        entries.set(first, { path: first, type: "tree", sha: id });
      }
    }
    return json({ sha, tree: [...entries.values()] });
  }

  private readBlob(repo: FakeRepo, sha: string, headers: Headers) {
    const bytes = repo.blobs.get(sha);
    if (!bytes) return failure(404, "Not Found");
    if (/raw/.test(headers.get("accept") ?? "")) {
      return new Response(bytes as BodyInit, { status: 200 });
    }
    return json({ sha, encoding: "base64", content: bytesToBase64(bytes) });
  }

  private async createBlob(repo: FakeRepo, body: { content: string; encoding: string }) {
    const bytes = body.encoding === "base64" ? base64ToBytes(body.content) : toBytes(body.content);
    const sha = await gitBlobSha(new Blob([bytes as BlobPart]));
    repo.blobs.set(sha, bytes);
    return json({ sha }, 201);
  }

  private async createTree(
    repo: FakeRepo,
    body: { base_tree?: string; tree: { path: string; sha: string | null }[] },
  ) {
    const snapshot: Snapshot = { ...(body.base_tree ? repo.trees.get(body.base_tree) : {}) };
    for (const entry of body.tree) {
      if (entry.sha === null) delete snapshot[entry.path];
      else if (!repo.blobs.has(entry.sha)) return failure(422, "Tree entry references a missing blob");
      else snapshot[entry.path] = entry.sha;
    }
    const sha = await sha1Hex(`tree ${JSON.stringify(Object.entries(snapshot).sort())}`);
    repo.trees.set(sha, snapshot);
    return json({ sha }, 201);
  }

  private async createCommit(
    repo: FakeRepo,
    body: { message: string; tree: string; parents: string[] },
  ) {
    const sha = await sha1Hex(`commit ${++this.counter} ${JSON.stringify(body)}`);
    repo.commits.set(sha, { tree: body.tree, parents: body.parents });
    return json({ sha }, 201);
  }

  private async updateRef(repo: FakeRepo, branch: string, body: { sha: string }) {
    if (this.beforeRefUpdate) {
      const run = this.beforeRefUpdate;
      this.beforeRefUpdate = undefined;
      await run();
    }
    const current = repo.branches.get(branch);
    const parents = repo.commits.get(body.sha)?.parents ?? [];
    if (current && !parents.includes(current)) {
      return failure(422, "Update is not a fast forward");
    }
    repo.branches.set(branch, body.sha);
    return json({ ref: `refs/heads/${branch}`, object: { sha: body.sha } });
  }

  // ---- helpers --------------------------------------------------------

  private emptyRepo(name: string, isPrivate: boolean): FakeRepo {
    return {
      name,
      private: isPrivate,
      blobs: new Map(),
      trees: new Map(),
      commits: new Map(),
      branches: new Map(),
    };
  }

  private repoJson(repo: FakeRepo) {
    const bytes = [...repo.blobs.values()].reduce((sum, b) => sum + b.length, 0);
    return {
      name: repo.name,
      private: repo.private,
      default_branch: BRANCH,
      size: Math.round(bytes / 1024),
    };
  }

  private mustRepo(name: string) {
    const repo = this.repos.get(name);
    if (!repo) throw new Error(`No fake repo ${name}`);
    return repo;
  }

  private headSnapshot(repo: FakeRepo): Snapshot {
    const head = repo.branches.get(BRANCH);
    return head ? repo.trees.get(repo.commits.get(head)!.tree)! : {};
  }

  private async commitTo(repo: FakeRepo, files: Files, message: string) {
    const snapshot: Snapshot = { ...this.headSnapshot(repo) };
    for (const [path, value] of Object.entries(files)) {
      const bytes = toBytes(value);
      const sha = await gitBlobSha(new Blob([bytes as BlobPart]));
      repo.blobs.set(sha, bytes);
      snapshot[path] = sha;
    }
    const tree = await sha1Hex(`tree ${JSON.stringify(Object.entries(snapshot).sort())}`);
    repo.trees.set(tree, snapshot);
    const parent = repo.branches.get(BRANCH);
    const commit = await sha1Hex(`commit ${++this.counter} ${message}`);
    repo.commits.set(commit, { tree, parents: parent ? [parent] : [] });
    repo.branches.set(BRANCH, commit);
  }
}
