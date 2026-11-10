const POSTER_MAX_WIDTH = 480;
const READ_TIMEOUT_MS = 10_000;

export type VideoInfo = { duration: number; poster?: File };

// Reads length and one frame from a video the browser can decode.
export function readVideoInfo(file: File): Promise<VideoInfo> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "metadata";
    video.playsInline = true;

    let settled = false;
    const finish = (info: VideoInfo) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      resolve(info);
    };
    const timer = setTimeout(() => finish({ duration: 0 }), READ_TIMEOUT_MS);

    video.onerror = () => finish({ duration: 0 });

    // Recorder-made files report Infinity until the browser seeks to the end.
    let learningDuration = false;

    video.onloadedmetadata = () => {
      if (Number.isFinite(video.duration)) {
        // A frame a little in avoids the black first frame.
        video.currentTime = Math.min(1, video.duration * 0.1);
      } else {
        learningDuration = true;
        video.currentTime = 1e101;
      }
    };

    video.onseeked = () => {
      if (learningDuration) {
        learningDuration = false;
        const known = Number.isFinite(video.duration) ? video.duration : 0;
        video.currentTime = Math.min(1, known * 0.1);
        return;
      }
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const scale = Math.min(1, POSTER_MAX_WIDTH / (video.videoWidth || 1));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) =>
          finish({
            duration,
            poster: blob
              ? new File([blob], "poster.jpg", { type: "image/jpeg" })
              : undefined,
          }),
        "image/jpeg",
        0.8,
      );
    };

    video.src = url;
  });
}
