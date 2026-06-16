import raw from "./songs.json";
import type { Song, SongData } from "../types";
import { bestRelation, type Relation } from "../lib/keys";

export const data = raw as SongData;
export const songs = data.songs;

export const songById = new Map(songs.map((s) => [s.id, s]));

export interface Suggestion {
  song: Song;
  relation: Relation;
}

/** Songs whose key flows smoothly from the given keys, best transitions first. */
export function compatibleSongs(
  fromKeys: string[],
  excludeIds: Set<number> = new Set(),
  limit = 12
): Suggestion[] {
  if (!fromKeys.length) return [];
  return songs
    .filter((s) => !excludeIds.has(s.id) && s.keys.length)
    .map((song) => ({ song, relation: bestRelation(fromKeys, song.keys) }))
    .filter((x) => x.relation.score > 0)
    .sort(
      (a, b) =>
        b.relation.score - a.relation.score || a.song.title.localeCompare(b.song.title, "ko")
    )
    .slice(0, limit);
}

/** YouTube search link for a song title (we have no stored media links). */
export function youtubeSearchUrl(title: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(
    title + " 찬양"
  )}`;
}

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
