const settingsUrl = (owner: string, repo: string) =>
  `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/settings`;

// How to let others listen: make the library public, then share its address.
export default function ShareHelp({ owner, repo }: { owner: string; repo: string }) {
  const address = `${owner}/${repo}`;

  return (
    <details className="text-sm text-muted-foreground">
      <summary className="cursor-pointer text-foreground">How do I share my music?</summary>
      <ol className="list-decimal pl-5 mt-2 flex flex-col gap-1">
        <li>
          Open{" "}
          <a
            href={settingsUrl(owner, repo)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            your library's settings on GitHub
          </a>
          .
        </li>
        <li>At the bottom, in Danger Zone, choose Change visibility, then Public.</li>
        <li>Do the same for any extra repos ({repo}-1, {repo}-2, ...).</li>
        <li>
          Share <span className="font-mono text-foreground">{address}</span>. Others open Explore
          and enter it to listen, no sign-in needed.
        </li>
      </ol>
      <p className="mt-2">Anyone can then see and download these songs. Make it private again any time.</p>
    </details>
  );
}
