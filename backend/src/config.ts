import "dotenv/config";

export const PORT = Number(process.env.PORT ?? 3001);
export const TFL_APP_KEY = process.env.TFL_APP_KEY ?? "";
export const TFL_BASE = "https://api.tfl.gov.uk";
