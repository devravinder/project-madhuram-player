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
import { DEFAULT_PLAYLIST } from "@/constants";
import { usePlayer } from "@/context/PlayerContext";
import db from "@/services/db";

import { SongListProvider } from "@/components/songs/SongListContext";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Music, Play } from "lucide-react";

export const Route = createFileRoute("/library")({
  component: RouteComponent,
  loader: () => db.songs.toArray(),
});

function RouteComponent() {
  const router = useRouter()
  const refetch=()=>{
    router.invalidate()
  }
  const { playSong } = usePlayer();
  const songs = Route.useLoaderData();



  return (
    <PageLayout>
      <PageHeader>
        <div className="flex flex-row justify-between items-center">
          <div className="flex flex-row gap-4 items-center">
            <HeaderIcon>
              <Music size={30} />
            </HeaderIcon>

            <div className="">
              <HeaderTitle>Library</HeaderTitle>
              <HeaderSubTitle>{`${songs.length} songs`}</HeaderSubTitle>
            </div>
          </div>
          <div className="flex flex-row gap-4">
            <Button.Primary
              onClick={() => playSong(songs, 0, DEFAULT_PLAYLIST)}
            >
              <Play size={18} />
              <span className="hidden sm:block">Play</span>
            </Button.Primary>
          </div>
        </div>
      </PageHeader>
      <PageMain>
        <PageMainContainer>
          <PageMainSection>
            <SongListProvider refetch={refetch} songs={songs} playListId={DEFAULT_PLAYLIST} />
          </PageMainSection>
        </PageMainContainer>
      </PageMain>
    </PageLayout>
  );
}
