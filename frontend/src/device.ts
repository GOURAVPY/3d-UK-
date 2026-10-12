// What kind of screen we are on, so phones get a lighter map and bigger tap targets.
const query = (q: string) => typeof matchMedia === "function" && matchMedia(q).matches;

export const isSmallScreen = query("(max-width: 640px)");
export const isTouch = query("(pointer: coarse)");

// How far (in pixels) from a train or plane a tap still counts as hitting it.
export const PICK_PX = isTouch ? 30 : 18;
// Phones render at most this many device pixels per CSS pixel, which saves a lot of GPU work.
export const MAX_PIXEL_RATIO = isSmallScreen || isTouch ? 1.5 : 2;
