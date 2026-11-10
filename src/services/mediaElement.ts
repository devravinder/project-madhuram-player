// One element plays audio and video, so the queue works across both.
export const mediaElement = document.createElement("video");

mediaElement.playsInline = true;
mediaElement.className = "h-full w-full object-contain bg-black";
