import { DEFAULT_SONG_IMAGE } from "@/constants";
import { useFileUrl } from "@/hooks/useFileUrl";
import { useState } from "react";
import { CoverImg } from "./Elements";

// `id` is a saved file; `src` is a ready URL, used for tracks in public libraries.
export default function AudioImage({
  id,
  src: directSrc,
  alt,
  className = "",
}: {
  id?: string;
  src?: string;
  alt?: string;
  className?: string;
}) {
  const fileUrl = useFileUrl(directSrc ? undefined : id);
  const url = directSrc ?? fileUrl;
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
