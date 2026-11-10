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

function Explore() {
  const navigate = useNavigate();
  const sources = useLiveQuery(listSources, []) ?? [];
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
      setError(problem instanceof InvalidAddressError ? problem.message : "Could not follow this library.");
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
            <HeaderSubTitle>Listen to libraries shared by others</HeaderSubTitle>
          </div>
        </div>
      </PageHeader>
      <PageMain>
        <PageMainContainer>
          <PageMainSection>
            <div className="flex flex-col gap-4">
              <form onSubmit={submit} className="flex flex-col gap-2">
                <label htmlFor="library-address" className="text-sm font-medium">
                  Library address
                </label>
                <div className="flex flex-row gap-2">
                  <Input
                    id="library-address"
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    placeholder="owner/repository or a GitHub link"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <Button.Primary type="submit" disabled={!address.trim()} className="disabled:opacity-60">
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
                  You can play a public library without signing in. Nothing is saved
                  until you download it.
                </p>
              </form>

              {sources.length === 0 ? (
                <p className="text-muted-foreground">You are not following any library yet.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {sources.map((source) => {
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