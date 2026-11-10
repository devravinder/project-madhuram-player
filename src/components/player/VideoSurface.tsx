import { usePlayer } from "@/context/PlayerContext";
import { Maximize, PictureInPicture2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { IconButton } from "../Elements";

type IosVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void };

// Shows the player's own video element, so playback never restarts.
export function VideoSurface({ className = "" }: { className?: string }) {
  const { mediaElement } = usePlayer();
  const hostRef = useRef<HTMLDivElement>(null);
  const canPictureInPicture =
    document.pictureInPictureEnabled && !mediaElement.disablePictureInPicture;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.prepend(mediaElement);

    // Native controls only in fullscreen, where ours are out of reach.
    const syncControls = () => {
      mediaElement.controls = document.fullscreenElement === host;
    };
    document.addEventListener("fullscreenchange", syncControls);

    return () => {
      document.removeEventListener("fullscreenchange", syncControls);
      mediaElement.controls = false;
      if (mediaElement.parentElement === host) host.removeChild(mediaElement);
    };
  }, [mediaElement]);

  const enterFullscreen = async () => {
    try {
      if (hostRef.current?.requestFullscreen) {
        await hostRef.current.requestFullscreen();
      } else {
        // iPhone only fullscreens the video element itself.
        (mediaElement as IosVideo).webkitEnterFullscreen?.();
      }
    } catch {
      toast.error("Fullscreen is not available");
    }
  };

  const togglePictureInPicture = async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await mediaElement.requestPictureInPicture();
      }
    } catch {
      toast.error("Picture-in-picture is not available");
    }
  };

  return (
    <div ref={hostRef} className={`relative bg-black ${className}`}>
      <div className="absolute top-4 left-4 flex gap-2">
        {canPictureInPicture && (
          <IconButton
            aria-label="Picture in picture"
            onClick={togglePictureInPicture}
            className="bg-black/40 backdrop-blur-sm text-white size-9"
          >
            <PictureInPicture2 className="size-5" />
          </IconButton>
        )}
        <IconButton
          aria-label="Fullscreen"
          onClick={enterFullscreen}
          className="bg-black/40 backdrop-blur-sm text-white size-9"
        >
          <Maximize className="size-5" />
        </IconButton>
      </div>
    </div>
  );
}
