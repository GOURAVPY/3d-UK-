import type { Stream } from "../types";

// Public live streams that are not part of TfL's data. These are third-party,
// unofficial and can go offline. To embed one in the panel, add its YouTube video
// id as `youtubeId`. Without it the entry opens the source page in a new tab.
export const STREAMS: Stream[] = [
  {
    id: "bigjet",
    name: "Big Jet TV: Heathrow live",
    kind: "airport",
    url: "https://www.youtube.com/results?search_query=Big+Jet+TV+live",
    lat: 51.47,
    lon: -0.4543,
  },
  {
    id: "railcam",
    name: "Railcam UK: station live cams",
    kind: "rail",
    url: "https://www.railcam.uk/",
  },
];
