import { useSyncExternalStore } from "react";
import { staticSongs } from "../data";
import type { Song, Tempo } from "../types";
import { bestRelation, type Relation } from "./keys";

// ---- merged catalog = static snapshot + user-added songs (localStorage) ----
const LS = "wl.userSongs";

function load(): Song[] {
  try {
    const raw = localStorage.getItem(LS);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((s) => s && typeof s.id === "number" && s.title) : [];
  } catch {
    return [];
  }
}

let userSongs: Song[] = load();
let songs: Song[] = [];
let byId = new Map<number, Song>();
let version = 0;

function recompute() {
  songs = [...userSongs, ...staticSongs];
  byId = new Map(songs.map((s) => [s.id, s]));
}
recompute();

const listeners = new Set<() => void>();
function emit() {
  localStorage.setItem(LS, JSON.stringify(userSongs));
  recompute();
  version++;
  listeners.forEach((l) => l());
}

// module-level accessors (used by the cloud sync engine)
export function getUserSongs(): Song[] {
  return userSongs;
}
export function setUserSongs(next: Song[]) {
  userSongs = next;
  emit();
}
export function subscribeCatalog(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getSongs(): Song[] {
  return songs;
}
export function getSongById(id: number): Song | undefined {
  return byId.get(id);
}
export function isUserSong(id: number): boolean {
  return userSongs.some((s) => s.id === id);
}

export interface SongInput {
  title: string;
  keys: string[];
  tempos: Tempo[];
  themes: string[];
  hymnNo: number | null;
}

export function addSong(input: SongInput): Song {
  const song: Song = { id: Date.now(), ...input };
  userSongs = [...userSongs, song];
  emit();
  return song;
}
export function updateSong(id: number, input: SongInput) {
  userSongs = userSongs.map((s) => (s.id === id ? { ...s, ...input } : s));
  emit();
}
export function removeSong(id: number) {
  userSongs = userSongs.filter((s) => s.id !== id);
  emit();
}

// ---- query helpers (operate on the current merged catalog) ----
export const byKey = (key: string) => songs.filter((s) => s.keys.includes(key));
export const byTheme = (theme: string) => songs.filter((s) => s.themes.includes(theme));
export const byTempo = (tempo: string) =>
  songs.filter((s) => s.tempos.includes(tempo as Tempo));

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

// ---- React binding ----
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
const snapshot = () => version;

export function useSongs() {
  useSyncExternalStore(subscribe, snapshot, snapshot);
  return { songs, songById: byId };
}
