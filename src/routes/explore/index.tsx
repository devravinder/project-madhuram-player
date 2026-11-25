import {
  Button,
  HeaderIcon,
  HeaderSubTitle,
  HeaderTitle,
  IconButton,
  Input,
  PageHeader,
  PageLayout,
  PageMain,
  PageMainContainer,
  PageMainSection,
} from "@/components/Elements";
import { useSync } from "@/context/SyncContext";
import {
  followSource,
  InvalidAddressError,
  listSources,
  unfollowSource,
} from "@/services/public/sourcesService";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { Globe, Lock, Plus, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

export const Route = createFileRoute("/explore/")({
  component: Explore,
});

// The signed-in user's libraries, private ones too, so a new device can
// play or download them without a full sync.
function MyLibraries() {
  const { libraries, owner, loadLibraries, error } = useSync();

  useEffect(() => {
    if (!libraries) void loadLibraries();
  }, [libraries, loadLibraries]);

  return (
    <section className="flex flex-col gap-2" aria-labelledby="my-libraries">
      <h2 id="my-libraries" className="text-sm font-medium">
        My libraries
      </h2>
      {!libraries || !owner ? (
        <p className="text-muted-foreground">
          {error ?? "Loading your libraries..."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {libraries.map((library) => (
            <li
              key={library.name}
              className="border border-card rounded-lg p-2"
            >
              <Link
                to="/explore/$owner/$repo"
                params={{ owner, repo: library.name }}
                className="flex flex-row items-center gap-2 min-w-0"
              >
                {library.isPrivate ? (
                  <Lock
                    size={16}
                    aria-label="Private"
                    className="shrink-0 text-muted-foreground"
                  />
                ) : (
                  <Globe
                    size={16}
                    aria-label="Public"
                    className="shrink-0 text-highlight"
                  />
                )}
                <span className="flex-1 min-w-0 line-clamp-1 font-medium">
                  {library.name}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {library.tracks} songs
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Explore() {
  const navigate = useNavigate();
  const { signedIn, owner, libraries } = useSync();
  const sources = useLiveQuery(listSources, []) ?? [];
  // Own libraries are listed under My libraries already.
  const mine = new Set(
    signedIn && owner
      ? (libraries ?? []).map((l) => `${owner}/${l.name}`.toLowerCase())
      : [],
  );
  const following = sources.filter((source) => !mine.has(source.address));
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string>();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const followed = await followSource(address);
      const [owner, repo] = followed.split("/");
      setAddress("");
      setError(undefined);
      navigate({ to: "/explore/$owner/$repo", params: { owner, repo } });
    } catch (problem) {
      setError(
        problem instanceof InvalidAddressError
          ? problem.message
          : "Could not follow this library.",
      );
    }
  };

  return (
    <PageLayout>
      <PageHeader>
        <div className="flex flex-row gap-4 items-center">
          <HeaderIcon aria-hidden>
            <Globe size={30} />
          </HeaderIcon>
          <div>
            <HeaderTitle>Explore</HeaderTitle>
            <HeaderSubTitle>
              Your libraries and ones shared by others
            </HeaderSubTitle>
          </div>
        </div>
      </PageHeader>
      <PageMain>
        <PageMainContainer>
          <PageMainSection>
            <div className="flex flex-col gap-4">
              {signedIn && <MyLibraries />}

              <form onSubmit={submit} className="flex flex-col gap-2">
                <label
                  htmlFor="library-address"
                  className="text-sm font-medium"
                >
                  Library address
                </label>
                <div className="flex flex-row gap-2">
                  <Input
                    id="library-address"
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    placeholder="owner/repo, GitHub link or share link"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <Button.Primary
                    type="submit"
                    disabled={!address.trim()}
                    className="disabled:opacity-60"
                  >
                    <Plus size={18} />
                    <span className="hidden sm:block">Follow</span>
                  </Button.Primary>
                </div>
                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  You can play a public library without signing in. Nothing is
                  saved until you download it.
                </p>
              </form>

              <h2 className="text-sm font-medium">Following</h2>
              {following.length === 0 ? (
                <p className="text-muted-foreground">
                  You are not following any library yet.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {following.map((source) => {
                    const [owner, repo] = source.address.split("/");
                    return (
                      <li
                        key={source.address}
                        className="border border-card rounded-lg p-2 flex flex-row items-center justify-between gap-2"
                      >
                        <Link
                          to="/explore/$owner/$repo"
                          params={{ owner, repo }}
                          className="flex-1 min-w-0 line-clamp-1 font-medium"
                        >
                          {source.address}
                        </Link>
                        <IconButton
                          aria-label={`Unfollow ${source.address}`}
                          onClick={() => void unfollowSource(source.address)}
                        >
                          <X className="h-5 w-5" />
                        </IconButton>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </PageMainSection>
        </PageMainContainer>
      </PageMain>
    </PageLayout>
  );
}
