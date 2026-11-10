import { useLocalStorage } from "@/hooks/useLocalStorage";
import type { RepeatMode, SleepTimer, Song } from "@/types/music";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePlaylists } from "./PlaylistContext";
import { getFile } from "@/services/filesService";
import { mediaElement } from "@/services/mediaElement";
import { IMAGE_512, UNKNOWN } from "@/constants";
import { toast } from "sonner";

interface PlayerContextType {
  // State
  currentSong: Song | null;
  isPlaying: boolean;
  volume: number;
  progress: number;
  duration: number;
  repeatMode: RepeatMode;
  shuffle: boolean;
  queue: Song[];
  queueIndex: number;
  sleepTimer: SleepTimer;
  mediaElement: HTMLVideoElement;
  playSong: (queue: Song[], songIndex: number, playListId: string) => void;
  togglePlay: () => void;
  pause: () => void;
  resume: () => void;
  next: () => void;
  previous: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  toggleRepeat: () => void;
  toggleShuffle: () => void;
  setSleepTimer: (minutes: number) => void;
  cancelSleepTimer: () => void;
}

const setMediaSession = (song: Song, artworkUrl?: string, type?: string) => {
  if (!("mediaSession" in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: song.title || UNKNOWN,
    artist: song.artist || UNKNOWN,
    artwork: artworkUrl
      ? [{ src: artworkUrl, type }]
      : [{ src: IMAGE_512, sizes: "512x512", type: "image/png" }],
  });
};
const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const { addToRecentlyPlayed } = usePlaylists();
  const mediaRef = useRef<HTMLVideoElement | null>(null);

  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolumeState] = useLocalStorage("volume", 0.7);
  const volumeRef = useRef(volume);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [repeatMode, setRepeatMode] = useLocalStorage<RepeatMode>(
    "repeatMode",
    "off",
  );
  const [shuffle, setShuffle] = useLocalStorage("shuffle", false);
  const [queue, setQueue] = useState<Song[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [sleepTimer, setSleepTimerState] = useState<SleepTimer>({
    isActive: false,
    endTime: null,
    duration: 0,
  });

  const pause = useCallback(() => {
    if (mediaRef.current) {
      mediaRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  const loadRequestRef = useRef(0);
  const objectUrlsRef = useRef<string[]>([]);

  const revokeObjectUrls = useCallback(() => {
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current = [];
  }, []);

  const cancelPendingLoad = useCallback(() => {
    loadRequestRef.current++;
  }, []);

  const loadAndPlay = useCallback(
    async (song: Song, playListId?: string) => {
      const audio = mediaRef.current;
      if (!audio) return;

      // Only the latest request may start playback.
      const request = ++loadRequestRef.current;
      setCurrentSong(song);

      const [audioFile, coverFile] = await Promise.all([
        getFile(song.mediaId),
        song.coverImageId ? getFile(song.coverImageId) : undefined,
      ]);
      if (request !== loadRequestRef.current) return;

      if (!audioFile) {
        setIsPlaying(false);
        toast.error("File not found, unable to play");
        return;
      }

      revokeObjectUrls();
      const audioUrl = URL.createObjectURL(audioFile.data);
      const coverUrl = coverFile && URL.createObjectURL(coverFile.data);
      objectUrlsRef.current = coverUrl ? [audioUrl, coverUrl] : [audioUrl];

      // Shown for video until the first frame arrives.
      audio.poster = song.kind === "video" && coverUrl ? coverUrl : "";
      audio.src = audioUrl;
      try {
        await audio.play();
      } catch (err) {
        // A newer request interrupts this one; that is expected.
        if (request === loadRequestRef.current) {
          console.error("Error playing audio:", err);
          setIsPlaying(false);
        }
        return;
      }
      if (request !== loadRequestRef.current) return;

      setMediaSession(song, coverUrl, coverFile?.data.type);
      setIsPlaying(true);
      addToRecentlyPlayed(song.id, playListId);
    },
    [addToRecentlyPlayed, revokeObjectUrls],
  );

  const handleSongEnd = useCallback(() => {
    if (repeatMode === "one") {
      mediaRef.current!.currentTime = 0;
      mediaRef.current!.play();
    } else if (queueIndex < queue.length - 1) {
      // repeat mode off
      const nextIndex = shuffle
        ? Math.floor(Math.random() * queue.length)
        : queueIndex + 1;
      setQueueIndex(nextIndex);
      loadAndPlay(queue[nextIndex]);
    } else if (repeatMode === "all" && queue.length > 0) {
      setQueueIndex(0);
      loadAndPlay(queue[0]);
    } else {
      setIsPlaying(false);
    }
  }, [repeatMode, queueIndex, queue, shuffle, loadAndPlay]);

  const handleSongEndRef = useRef(handleSongEnd);

  useEffect(() => {
    handleSongEndRef.current = handleSongEnd;
  }, [handleSongEnd]);

  // Initialize media element
  useEffect(() => {
    mediaRef.current = mediaElement;
    mediaElement.volume = volumeRef.current;

    const audio = mediaElement;

    const handleTimeUpdate = () => {
      setProgress(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const handleEnded = () => {
      handleSongEndRef.current(); // bcz without destroying the audio ( with out re-rendering ), to get the latest method
    };

    // Native controls (fullscreen, headset keys) can also play and pause.
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.pause();
      cancelPendingLoad();
      revokeObjectUrls();
    };
  }, [cancelPendingLoad, revokeObjectUrls]);

  // Update volume when changed
  useEffect(() => {
    if (mediaRef.current) {
      mediaRef.current.volume = volume;
    }
  }, [volume]);

  // Sleep timer effect
  useEffect(() => {
    if (!sleepTimer.isActive || !sleepTimer.endTime) return;

    const checkTimer = setInterval(() => {
      if (Date.now() >= sleepTimer.endTime!) {
        pause();
        setSleepTimerState({ isActive: false, endTime: null, duration: 0 });
      }
    }, 1000);

    return () => clearInterval(checkTimer);
  }, [sleepTimer, pause]);

  const handleQueueChange = useCallback((newQueue: Song[]) => {
    setQueue(newQueue);
  }, []);

  const playSong = useCallback(
    (queue: Song[], songIndex: number, playListId?: string) => {
      if (queue.length === 0) return;
      handleQueueChange(queue);
      setQueueIndex(songIndex);
      loadAndPlay(queue[songIndex], playListId);
    },
    [loadAndPlay, handleQueueChange],
  );

  const togglePlay = useCallback(() => {
    if (!mediaRef.current || !currentSong) return;

    if (isPlaying) {
      mediaRef.current.pause();
      setIsPlaying(false);
    } else {
      mediaRef.current.play();
      setIsPlaying(true);
    }
  }, [isPlaying, currentSong]);

  const resume = useCallback(() => {
    if (mediaRef.current && currentSong) {
      mediaRef.current.play();
      setIsPlaying(true);
    }
  }, [currentSong]);

  const next = useCallback(() => {
    if (queue.length === 0) return;

    let nextIndex: number;
    if (shuffle) {
      nextIndex = Math.floor(Math.random() * queue.length);
    } else {
      nextIndex = (queueIndex + 1) % queue.length;
    }
    setQueueIndex(nextIndex);
    loadAndPlay(queue[nextIndex]);
  }, [queue, queueIndex, shuffle, loadAndPlay]);

  const previous = useCallback(() => {
    if (!mediaRef.current) return;

    // If more than 3 seconds in, restart current song
    if (mediaRef.current.currentTime > 3) {
      mediaRef.current.currentTime = 0;
      return;
    }

    if (queue.length === 0) return;

    const prevIndex = queueIndex === 0 ? queue.length - 1 : queueIndex - 1;
    setQueueIndex(prevIndex);
    loadAndPlay(queue[prevIndex]);
  }, [queue, queueIndex, loadAndPlay]);

  const seek = useCallback((time: number) => {
    if (mediaRef.current) {
      mediaRef.current.currentTime = time;
      setProgress(time);
    }
  }, []);

  const setVolume = useCallback(
    (newVolume: number) => {
      const volume = Math.max(0, Math.min(1, newVolume));
      setVolumeState(volume);
      volumeRef.current = volume;
    },
    [setVolumeState],
  );

  const toggleRepeat = useCallback(() => {
    setRepeatMode((prev) => {
      if (prev === "off") return "all";
      if (prev === "all") return "one";
      return "off";
    });
  }, [setRepeatMode]);

  const toggleShuffle = useCallback(() => {
    setShuffle((prev) => !prev);
  }, [setShuffle]);

  const setSleepTimer = useCallback((minutes: number) => {
    setSleepTimerState({
      isActive: true,
      endTime: new Date().getTime() + minutes * 60 * 1000,
      duration: minutes,
    });
  }, []);

  const cancelSleepTimer = useCallback(() => {
    setSleepTimerState({
      isActive: false,
      endTime: null,
      duration: 0,
    });
  }, []);

  return (
    <PlayerContext.Provider
      value={{
        currentSong,
        isPlaying,
        volume,
        progress,
        duration,
        repeatMode,
        shuffle,
        queue,
        queueIndex,

        sleepTimer,
        mediaElement,
        playSong,
        togglePlay,
        pause,
        resume,
        next,
        previous,
        seek,
        setVolume,
        toggleRepeat,
        toggleShuffle,
        setSleepTimer,
        cancelSleepTimer,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePlayer() {
  const context = useContext(PlayerContext);
  if (context === undefined) {
    throw new Error("usePlayer must be used within a PlayerProvider");
  }
  return context;
}
