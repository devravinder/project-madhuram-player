import { Clickable } from "@/components/Elements";
import { ListMusic } from "lucide-react";

const NoItems = ({title, subTitle, onClick}:{title?: string, subTitle?:string, onClick?: VoidFunction}) => {
  return (
    <Clickable clickable={Boolean(onClick)} onClick={onClick} className="flex flex-col justify-center items-center gap-4 p-8">
      <ListMusic size={40} className="text-muted" />
      <div className="flex flex-col gap-2 justify-center items-center">
        <div className="text-foreground text-xl">{title || 'No songs yet'}</div>
        <div className="text-muted-foreground">
          {subTitle || 'Click Edit to add songs to this playlist'}
        </div>
      </div>
    </Clickable>
  );
};

export default NoItems;
