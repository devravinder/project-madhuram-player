// A link to this app that opens a public library in Explore; no sign-in needed.
export const shareLink = (owner: string, library: string, base = window.location) =>
  `${base.origin}${base.pathname}#/explore/${encodeURIComponent(owner)}/${encodeURIComponent(library)}`;
