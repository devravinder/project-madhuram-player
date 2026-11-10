import type { SortOption } from "@/types/music";
import { ArrowUpDown, Search } from "lucide-react";
import { useMemo, useState, type ChangeEvent } from "react";
import { Button, Input } from "../Elements";
import SongCard from "./SongCard";
import { useSongsList } from "./SongListContext";

export default function SongsList() {
  const { songs, showSearchBar = true } = useSongsList();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>("none");
  const [showSortMenu, setShowSortMenu] = useState(false);

  const filteredAndSortedSongs = useMemo(() => {
    let result = songs;

    // Filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (song) =>
          song.title.toLowerCase().includes(query) ||
          song.artist.toLowerCase().includes(query) ||
          song.album.toLowerCase().includes(query),
      );
    }

    // Sort
    result = [...result].sort((a, b) => {
      switch (sortOption) {
        case "name-asc":
          return a.title.localeCompare(b.title);
        case "name-desc":
          return b.title.localeCompare(a.title);
        case "date-asc":
          return new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime();
        case "date-desc":
        default: // none
          return 0;
      }
    });

    return result;
  }, [songs, searchQuery, sortOption]);

  const sortOptions: { value: SortOption; label: string }[] = [
    { value: "none", label: "Default" },
    { value: "name-asc", label: "Name (A-Z)" },
    { value: "name-desc", label: "Name (Z-A)" },
    { value: "date-desc", label: "Recently Added" },
    { value: "date-asc", label: "Oldest First" },
  ];

  return (
    <>
      <div className="grow flex flex-col gap-2">
        {showSearchBar && (
          <div className="flex flex-row p-3 rounded-xl items-center gap-3">
            <div className="relative flex-1 sm:w-64">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                size={18}
              />
              <Input
                type="text"
                placeholder="Search songs..."
                value={searchQuery}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setSearchQuery(e.target.value)
                }
                className=" pl-10 py-2 sm:py-3 "
              />
            </div>

            <div className="relative">
              <Button.Secondary
                className="rounded-xl p-3"
                onClick={() => setShowSortMenu(!showSortMenu)}
              >
                <ArrowUpDown size={16} />
                <span className="hidden sm:inline">Sort</span>
              </Button.Secondary>

              {showSortMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowSortMenu(false)}
                  />
                  <div className="absolute right-0 top-full mt-2 bg-card border border-border rounded-xl shadow-lg z-20 py-2 min-w-40 p-2">
                    {sortOptions.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => {
                          setSortOption(option.value);
                          setShowSortMenu(false);
                        }}
                        className={`cursor-pointer w-full text-left px-4 py-2 rounded-lg text-sm hover:bg-secondary/50 transition-colors ${
                          sortOption === option.value ? "text-primary" : ""
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        {filteredAndSortedSongs.map((song, index) => (
          <SongCard
            key={song.id}
            song={song}
            queue={filteredAndSortedSongs}
            index={index}
          />
        ))}
      </div>
    </>
  );
}
