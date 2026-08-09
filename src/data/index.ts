import raw from "./songs.json";
import type { SongData } from "../types";

export const data = raw as SongData;
/** The immutable Google-Sheet snapshot. User-added songs live in lib/catalog. */
export const staticSongs = data.songs;

/** Normalize for search: drop spaces & parentheticals, lowercase. */
export function normalize(text: string): string {
  return text
    .replace(/[（(].*?[)）]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

export const sortKo = (a: { title: string }, b: { title: string }) =>
  a.title.localeCompare(b.title, "ko");

/** YouTube search link for a song title (we have no stored media links). */
export function youtubeSearchUrl(title: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(title + " 찬양")}`;
}

/** Google IMAGE search for a song's sheet music. Uses `udm=2` — Google retired
 *  the old `tbm=isch` image parameter, which now falls back to a plain web
 *  search instead of showing sheet images. */
export function sheetSearchUrl(title: string): string {
  return `https://www.google.com/search?udm=2&q=${encodeURIComponent(title + " 악보")}`;
}
