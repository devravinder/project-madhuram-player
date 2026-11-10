// One element plays audio and video, so the queue works across both.
export const mediaElement = document.createElement("video");

mediaElement.playsInline = true;
// No background of its own, so a video shows no bars around the picture.
mediaElement.className = "h-full w-full object-contain";
