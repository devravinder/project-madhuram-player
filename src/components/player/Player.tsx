import { usePlayer } from "@/context/PlayerContext";
import { useState } from "react";
import { createPortal } from "react-dom";
import FullScreenPlayer from "./FullScreenPlayer";
import MiniPlayer from "./MiniPlayer";

export default function Player() {
  const [isMini, setMini] = useState(true);

  const { currentSong } = usePlayer();

  if (!currentSong) {
    return undefined;
  }

  // The open player covers the whole screen, above the page and its menus.
  return isMini ? (
    <MiniPlayer onClick={() => setMini(false)} />
  ) : (
    createPortal(<FullScreenPlayer onClose={() => setMini(true)} />, document.body)
  );
}
