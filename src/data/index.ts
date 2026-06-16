import raw from "./songs.json";
import type { Song, SongData } from "../types";

export const data = raw as SongData;
export const songs = data.songs;

export const songById = new Map(songs.map((s) => [s.id, s]));

/** Normalize for search: drop spaces & parentheticals, lowercase. */
export function normalize(text: string): string {
  return text
    .replace(/[（(].*?[)）]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

export function searchSongs(query: string): Song[] {
  const q = normalize(query);
  if (!q) return songs;
  return songs.filter(
    (s) =>
      normalize(s.title).includes(q) ||
      s.themes.some((t) => normalize(t).includes(q)) ||
      s.keys.some((k) => k.toLowerCase() === q) ||
      String(s.hymnNo ?? "").includes(q)
  );
}

export function byKey(key: string): Song[] {
  return songs.filter((s) => s.keys.includes(key));
}

export function byTheme(theme: string): Song[] {
  return songs.filter((s) => s.themes.includes(theme));
}

export function byTempo(tempo: string): Song[] {
  return songs.filter((s) => s.tempos.includes(tempo as Song["tempos"][number]));
}

export const sortKo = (a: Song, b: Song) => a.title.localeCompare(b.title, "ko");
