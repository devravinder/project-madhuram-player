import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

function readCname() {
  if (process.env.DEPLOY_CNAME) return process.env.DEPLOY_CNAME;
  if (!existsSync("deploy.local")) return undefined;
  const line = readFileSync("deploy.local", "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("DEPLOY_CNAME="));
  return line?.slice("DEPLOY_CNAME=".length).trim();
}

const cname = readCname();

// The value reaches a shell, so accept only a plain host name.
if (!cname || !/^[a-z0-9.-]+$/i.test(cname)) {
  console.error("Set DEPLOY_CNAME in deploy.local (see deploy.local.sample).");
  process.exit(1);
}

const steps = [
  ["pnpm", ["run", "build"]],
  [
    "pnpm",
    [
      "exec",
      "gh-pages",
      "--dotfiles",
      `--cname=${cname}`,
      "--dist",
      "dist",
      "--branch",
      "deploy",
    ],
  ],
];

for (const [command, args] of steps) {
  const { status } = spawnSync(command, args, { stdio: "inherit", shell: true });
  if (status !== 0) process.exit(status ?? 1);
}
