import DownloadAll from "@/components/explore/DownloadAll";
import {
  Button,
  HeaderIcon,
  HeaderSubTitle,
  HeaderTitle,
  PageHeader,
  PageLayout,
  PageMain,
  PageMainContainer,
  PageMainSection,
} from "@/components/Elements";
import { SongListProvider } from "@/components/songs/SongListContext";
import { usePlayer } from "@/context/PlayerContext";
import { usePublicTracks } from "@/queries/publicLibrary";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Globe, Play } from "lucide-react";

export const Route = createFileRoute("/explore/$owner/$repo")({
  component: PublicLibraryPage,
});

function PublicLibraryPage() {
  const { owner, repo } = Route.useParams();
  const { data: songs, error, isPending, refetch } = usePublicTracks(owner, repo);
  const { playSong } = usePlayer();

  return (
    <PageLayout>
      <PageHeader>
        <div className="flex flex-row justify-between items-center gap-2">
          <div className="flex flex-row gap-4 items-center min-w-0">
            <Link
              to="/explore"
              aria-label="Back to Explore"
              className="h-10 w-10 shrink-0 flex items-center justify-center rounded-lg bg-accent"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <HeaderIcon aria-hidden>
              <Globe size={30} />
            </HeaderIcon>
            <div className="min-w-0">
              <HeaderTitle>{`${owner}/${repo}`}</HeaderTitle>
              <HeaderSubTitle>
                {songs ? `${songs.length} tracks` : "Loading..."}
              </HeaderSubTitle>
            </div>
          </div>
          {songs && songs.length > 0 && (
            <div className="flex flex-row gap-2">
              <DownloadAll songs={songs} />
              <Button.Primary onClick={() => playSong(songs, 0, "remote")}>
                <Play size={18} />
                <span className="hidden sm:block">Play</span>
              </Button.Primary>
            </div>
          )}
        </div>
      </PageHeader>
      <PageMain>
        <PageMainContainer>
          <PageMainSection>
            {isPending && <p className="text-muted-foreground">Loading library...</p>}
            {error && (
              <div role="alert" className="flex flex-col gap-3">
                <p className="text-destructive">{error.message}</p>
                <Button.Secondary onClick={() => void refetch()} className="self-start text-base">
                  Try again
                </Button.Secondary>
              </div>
            )}
            {songs && songs.length === 0 && (
              <p className="text-muted-foreground">This library has no tracks yet.</p>
            )}
            {songs && songs.length > 0 && (
              <SongListProvider songs={songs} playListId="remote" refetch={() => void refetch()} remote />
            )}
          </PageMainSection>
        </PageMainContainer>
      </PageMain>
    </PageLayout>
  );
}