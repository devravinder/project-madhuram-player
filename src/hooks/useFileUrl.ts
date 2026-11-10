import { getFile } from "@/services/filesService";
import { useEffect, useState } from "react";

type Loaded = { id: string; url: string };

// Returns a URL only for the current id, so a stale one is never shown.
export function useFileUrl(id?: string) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let url: string | undefined;

    getFile(id).then((file) => {
      if (cancelled || !file) return;
      url = URL.createObjectURL(file.data);
      setLoaded({ id, url });
    });

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);

  return loaded && loaded.id === id ? loaded.url : undefined;
}
