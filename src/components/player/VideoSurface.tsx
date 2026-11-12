import { usePlayer } from "@/context/PlayerContext";
import { parkMediaElement } from "@/services/mediaElement";
import { lockLandscapeFor, unlockOrientation } from "@/services/orientation";
import { useEffect, type RefObject } from "react";
import { toast } from "sonner";

type IosVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void };

// Shows the player's own video element, so playback never restarts.
// Its buttons live in the player's top bar, so nothing covers the picture.
export function VideoSurface({
  hostRef,
  className = "",
}: {
  hostRef: RefObject<HTMLDivElement | null>;
  className?: string;
}) {
  const { mediaElement } = usePlayer();

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.prepend(mediaElement);

    // Native controls only in fullscreen, where ours are out of reach.
    // Leaving fullscreen in any way also lets the screen turn again.
    const syncControls = () => {
      const inFullscreen = document.fullscreenElement === host;
      mediaElement.controls = inFullscreen;
      if (!inFullscreen) unlockOrientation();
    };
    document.addEventListener("fullscreenchange", syncControls);

    return () => {
      document.removeEventListener("fullscreenchange", syncControls);
      mediaElement.controls = false;
      // Moved, never removed: leaving the page would pause it.
      if (mediaElement.parentElement === host) parkMediaElement();
    };
  }, [mediaElement, hostRef]);

  return <div ref={hostRef} className={`[&:fullscreen]:bg-black ${className}`} />;
}

export function useVideoActions(hostRef: RefObject<HTMLDivElement | null>) {
  const { mediaElement } = usePlayer();
  const canPictureInPicture =
    document.pictureInPictureEnabled && !mediaElement.disablePictureInPicture;

  const enterFullscreen = async () => {
    try {
      if (hostRef.current?.requestFullscreen) {
        await hostRef.current.requestFullscreen();
        // On phones a wide video turns sideways and stays so.
        await lockLandscapeFor(mediaElement);
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

  return { canPictureInPicture, enterFullscreen, togglePictureInPicture };
}
