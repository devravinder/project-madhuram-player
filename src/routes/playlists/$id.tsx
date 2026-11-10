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
import { RECENT_PLAYLIST_ID } from "@/constants";
import { usePlayer } from "@/context/PlayerContext";
import db from "@/services/db";

import { SongListProvider } from "@/components/songs/SongListContext";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { Pencil, Play } from "lucide-react";
import NoItems from "./-components/NoItems";
import PlayListIcon from "./-components/PlayListIcon";

export const Route = createFileRoute("/playlists/$id")({
  component: PlaylistDetails,
  loader: async ({ params: { id } }) => {
    const playlist = await db.playlists.get(id);
    if (!playlist) return { playlist, songs: [] };
    const allSongs = await db.songs.toArray();
    const songs = allSongs.filter((song) => playlist.songIds.includes(song.id));

    return { playlist, songs };
  },
});

function PlaylistDetails() {
  const router = useRouter();
  const refetch = () => {
    router.invalidate();
  };
  const navigate = useNavigate();

  const { playSong } = usePlayer();
  const { playlist, songs } = Route.useLoaderData();

  if (!playlist) return undefined;

  const editable = playlist.id !== RECENT_PLAYLIST_ID;

  return (
    <PageLayout>
      <PageHeader>
        <div className="flex flex-row justify-between items-center">
          <div className="flex flex-row gap-4 items-center">
            <HeaderIcon>
              <PlayListIcon id={playlist.id} />
            </HeaderIcon>

            <div className="">
              <HeaderTitle>{playlist.name}</HeaderTitle>
              <HeaderSubTitle>{`${playlist.songIds.length} songs`}</HeaderSubTitle>
            </div>
          </div>
          <div className="flex flex-row gap-4">
            <Button.Primary onClick={() => playSong(songs, 0, playlist.id)}>
              <Play size={18} />
              <span className="hidden sm:block">Play</span>
            </Button.Primary>
            {editable && (
              <Button.Secondary
                onClick={() =>
                  navigate({
                    to: "/playlists/edit/$id",
                    params: { id: playlist.id },
                  })
                }
              >
                <Pencil size={18} />
                <span className="hidden sm:block"> Edit</span>
              </Button.Secondary>
            )}
          </div>
        </div>
      </PageHeader>
      <PageMain>
        <PageMainContainer>
          <PageMainSection>
            {playlist.songIds?.length ? (
              <SongListProvider
                refetch={refetch}
                songs={songs}
                playListId={playlist.id}
              />
            ) : (
              <NoItems />
            )}
          </PageMainSection>
        </PageMainContainer>
      </PageMain>
    </PageLayout>
  );
}
