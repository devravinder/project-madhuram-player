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
import MyLibraries from "@/components/explore/MyLibraries";
import { useSync } from "@/context/SyncContext";
import { usePublicTracks } from "@/queries/publicLibrary";
import {
  followSource,
  InvalidAddressError,
  listSources,
  unfollowSource,
} from "@/services/public/sourcesService";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { Globe, Plus, X } from "lucide-react";
import { useState, type FormEvent } from "react";

export const Route = createFileRoute("/explore/")({
  component: Explore,
});

// A followed library's own name, once its index has loaded.
function FollowedName({
  owner,
  repo,
  address,
}: {
  owner: string;
  repo: string;
  address: string;
}) {
  const { data } = usePublicTracks(owner, repo);
  if (!data?.displayName)
    return <span className="block truncate">{address}</span>;
  return (
    <>
      <span className="block truncate">{data.displayName}</span>
      <span className="block truncate text-xs font-normal text-muted-foreground">
        {address}
      </span>
    </>
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
            <HeaderSubTitle>Your & followed GitHub libraries</HeaderSubTitle>
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
                    placeholder="owner/repo or a link"
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
                  Public libraries play without sign-in.
                </p>
              </form>

              <h2 className="text-sm font-medium">Following</h2>
              {following.length === 0 ? (
                <p className="text-muted-foreground">
                  Not following any library yet.
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
                          className="flex-1 min-w-0 font-medium"
                        >
                          <FollowedName
                            owner={owner}
                            repo={repo}
                            address={source.address}
                          />
                        </Link>
                        <IconButton
                          aria-label={`Unfollow ${source.address}`}
                          onClick={() =>
                            void unfollowSource(source.address, {
                              keepForSync: signedIn,
                            })
                          }
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
