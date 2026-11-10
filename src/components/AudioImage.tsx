import { DEFAULT_SONG_IMAGE } from "@/constants";
import { useFileUrl } from "@/hooks/useFileUrl";
import { useState } from "react";
import { CoverImg } from "./Elements";

export default function AudioImage({
  id,
  alt,
  className = "",
}: {
  id?: string;
  alt?: string;
  className?: string;
}) {
  const url = useFileUrl(id);
  // A file that fails to decode would show blank, so fall back to the default.
  const [failedUrl, setFailedUrl] = useState<string>();
  const src = url && url !== failedUrl ? url : DEFAULT_SONG_IMAGE;

  return (
    <CoverImg
      src={src}
      alt={alt || "Song"}
      className={className}
      onError={() => url && setFailedUrl(url)}
    />
  );
}
