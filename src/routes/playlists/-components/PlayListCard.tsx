import { IconButton } from "@/components/Elements";
import PlayListIcon from "./PlayListIcon";

type PlayListCardProps = {
  id?: string;
  name: string;
  noOfSongs: number;
  onClick: VoidFunction;
};

export default function PlayListCard({
  id,
  name,
  noOfSongs,
  onClick,
}: PlayListCardProps) {
  return (
    <div
      onClick={onClick}
      className="border-card cursor-pointer text-foreground bg-card w-full flex flex-row items-center gap-4 p-4 rounded-xl"
    >
      <IconButton className="p-4 h-16 w-16 rounded-xl">
        <PlayListIcon id={id} />
      </IconButton>

      <div className="">
        <div className="font-semibold line-clamp-1">{name}</div>
        <div className="text-xs text-muted-foreground">{`${noOfSongs} songs`}</div>
      </div>
    </div>
  );
}
