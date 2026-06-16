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
