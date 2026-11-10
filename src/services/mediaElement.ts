// One element plays audio and video, so the queue works across both.
export const mediaElement = document.createElement("video");

mediaElement.playsInline = true;
// No background of its own, so a video shows no bars around the picture.
mediaElement.className = "h-full w-full object-contain";

// Browsers pause a media element taken out of the page. So when no video
// is on screen, the element waits here, hidden but still in the page, and
// moving it between here and the player never interrupts playback.
const parking = document.createElement("div");
parking.hidden = true;
parking.dataset.mediaParking = "";
parking.append(mediaElement);
document.body.append(parking);

export function parkMediaElement() {
  if (mediaElement.parentElement !== parking) parking.append(mediaElement);
}
