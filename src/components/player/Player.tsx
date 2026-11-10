import { usePlayer } from "@/context/PlayerContext";
import { useState } from "react";
import Modal from "../Modal";
import FullScreenPlayer from "./FullScreenPlayer";
import MiniPlayer from "./MiniPlayer";

export default function Player() {
  const [isMini, setMini] = useState(true);

  const { currentSong } = usePlayer();

  if (!currentSong) {
    return undefined;
  }

  return isMini ? (
    <MiniPlayer onClick={() => setMini(false)} />
  ) : (
    <Modal>
      <FullScreenPlayer onClose={()=>setMini(true)} />
    </Modal>
  );
}
