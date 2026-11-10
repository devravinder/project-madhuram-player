import {
  HeaderIcon,
  HeaderSubTitle,
  HeaderTitle,
  PageHeader,
  PageLayout,
  PageMain,
  PageMainContainer,
  PageMainSection,
} from "@/components/Elements";
import { Music } from "lucide-react";

import { FAVOURITE_PLAYLIST_ID, RECENT_PLAYLIST_ID } from "@/constants";
import { getPlaylist } from "@/services/playlistService";
import { getSongsCount } from "@/services/songsService";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import NoItems from "./playlists/-components/NoItems";
import PlayListCard from "./playlists/-components/PlayListCard";

export const Route = createFileRoute("/")({
  component: RouteComponent,
  loader: async () => {
    const songsCount = await getSongsCount();
    const fav = await getPlaylist(FAVOURITE_PLAYLIST_ID);
    const favCount = fav?.songIds?.length || 0;

    const recent = await getPlaylist(RECENT_PLAYLIST_ID);
    const recentCount = recent?.songIds?.length || 0;

    return { songsCount, favCount, recentCount };
  },
});

function RouteComponent() {
  const navigate = useNavigate();

  const { songsCount, favCount, recentCount } = Route.useLoaderData();

  const noItems = songsCount + favCount + recentCount == 0;

  return (
    <PageLayout>
      <PageHeader>
        <div className="flex flex-row justify-between items-center">
          <div className="flex flex-row gap-4 items-center">
            <HeaderIcon>
              <Music size={30} />
            </HeaderIcon>

            <div className="">
              <HeaderTitle>Madhuram</HeaderTitle>
              <HeaderSubTitle>Only Music • No Ads</HeaderSubTitle>
            </div>
          </div>
        </div>
      </PageHeader>
      <PageMain>
        <PageMainContainer>
          <PageMainSection>
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
              {favCount > 0 && (
                <PlayListCard
                  onClick={() =>
                    navigate({
                      to: "/playlists/$id",
                      params: { id: FAVOURITE_PLAYLIST_ID },
                    })
                  }
                  name={"Favourites"}
                  noOfSongs={favCount}
                />
              )}

              {recentCount > 0 && (
                <PlayListCard
                  onClick={() =>
                    navigate({
                      to: "/playlists/$id",
                      params: { id: RECENT_PLAYLIST_ID },
                    })
                  }
                  name={"Recently Played"}
                  noOfSongs={recentCount}
                />
              )}

              {songsCount > 0 && (
                <PlayListCard
                  onClick={() =>
                    navigate({
                      to: "/library",
                    })
                  }
                  name={"Library"}
                  noOfSongs={songsCount}
                />
              )}
              {noItems && (
                <div className="col-span-4">
                  <NoItems
                    onClick={() => navigate({ to: "/import" })}
                    title="No Songs Yet"
                    subTitle="Click here to add songs"
                  />
                </div>
              )}
            </div>
          </PageMainSection>
        </PageMainContainer>
      </PageMain>
    </PageLayout>
  );
}
