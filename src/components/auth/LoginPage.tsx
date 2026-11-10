import { Button, Input } from "@/components/Elements";
import { authStore } from "@/services/github/authStore";
import { fetchGithubUser, NEW_TOKEN_URL } from "@/services/github/githubClient";
import { useMutation } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { useState, type FormEvent } from "react";

export default function LoginPage() {
  const [token, setToken] = useState("");

  const signIn = useMutation({
    mutationFn: (value: string) => fetchGithubUser(value),
    onSuccess: (user, value) => authStore.signIn(value, user),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = token.trim();
    if (value) signIn.mutate(value);
  };

  return (
    <main className="min-h-screen w-full flex items-center justify-center p-4 bg-background text-foreground">
      <div className="w-full max-w-md flex flex-col gap-6 p-6 rounded-2xl bg-card border border-border">
        <div className="flex flex-col items-center gap-2 text-center">
          <img src="/favicon.svg" alt="" className="size-14" />
          <h1 className="text-2xl font-bold">Madhuram</h1>
          <p className="text-sm text-muted-foreground">Only Music - No Ads</p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <label htmlFor="github-token" className="text-sm font-medium">
            GitHub access token
          </label>
          <Input
            id="github-token"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="Paste your access token here"
            value={token}
            onChange={(event) => setToken(event.target.value)}
          />
          {signIn.error && (
            <p role="alert" className="text-sm text-destructive">
              {signIn.error.message}
            </p>
          )}
          <Button.Primary
            type="submit"
            disabled={!token.trim() || signIn.isPending}
            className="justify-center disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <KeyRound size={18} />
            {signIn.isPending ? "Checking..." : "Sign in"}
          </Button.Primary>
        </form>

        <Button.Secondary onClick={authStore.continueAsGuest} className="justify-center">
          Try without login
        </Button.Secondary>
        <p className="text-xs text-center text-muted-foreground -mt-3">
          Your music stays on this device and works offline. You can sign in
          later from Settings.
        </p>

        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer text-foreground">
            How do I get a token?
          </summary>
          <ol className="list-decimal pl-5 mt-2 flex flex-col gap-1">
            <li>
              Open{" "}
              <a
                href={NEW_TOKEN_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                GitHub fine-grained token settings
              </a>
              .
            </li>
            <li>Choose an expiry, such as 90 days.</li>
            <li>Repository access: All repositories.</li>
            <li>
              Permissions: Contents (read and write) and Administration (read
              and write), so the app can create your music repositories.
            </li>
            <li>Generate the token and paste it in the box above.</li>
          </ol>
          <p className="mt-2">
            The token is stored only in this browser. Consider a separate GitHub
            account for music, because these permissions are broad. You can
            remove the token any time in Settings.
          </p>
        </details>
      </div>
    </main>
  );
}
