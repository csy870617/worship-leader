import { useSyncExternalStore } from "react";
import { staticSongs } from "../data";
import type { Song, Tempo } from "../types";
import { bestRelation, type Relation } from "./keys";

// ---- merged catalog = static snapshot + user-added songs, minus hidden ----
const LS = "wl.userSongs";
const LS_HIDDEN = "wl.hidden";
const LS_OVERRIDES = "wl.overrides"; // per-user edits to base (static) songs

const arr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];

// guarantee a well-formed Song so a malformed record can't crash rendering
function sanitizeSong(s: any): Song | null {
  if (!s || typeof s.id !== "string" || typeof s.title !== "string" || !s.title) return null;
  return {
    id: s.id,
    title: s.title,
    keys: arr(s.keys),
    tempos: arr(s.tempos) as Song["tempos"],
    themes: arr(s.themes),
    hymnNo: typeof s.hymnNo === "number" ? s.hymnNo : null,
  };
}

function loadUserSongs(): Song[] {
  try {
    const raw = localStorage.getItem(LS);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.map(sanitizeSong).filter((s): s is Song => s !== null)
      : [];
  } catch {
    return [];
  }
}
function loadHidden(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_HIDDEN);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}
function loadOverrides(): Record<string, Partial<Song>> {
  try {
    const raw = localStorage.getItem(LS_OVERRIDES);
    const o = raw ? JSON.parse(raw) : {};
    return o && typeof o === "object" && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}

let userSongs: Song[] = loadUserSongs();
let hidden: Set<string> = loadHidden();
let overrides: Record<string, Partial<Song>> = loadOverrides();
let allSongs: Song[] = []; // user + static (full, incl. hidden)
let songs: Song[] = []; // visible (hidden removed)
let byId = new Map<string, Song>(); // full lookup (incl. hidden)
let version = 0;

// apply a user override (edited base song) on top of the static entry
function withOverride(s: Song): Song {
  const ov = overrides[s.id];
  if (!ov) return s;
  return sanitizeSong({ ...s, ...ov, id: s.id }) ?? s;
}

function recompute() {
  allSongs = [...userSongs, ...staticSongs.map(withOverride)];
  byId = new Map(allSongs.map((s) => [s.id, s]));
  songs = allSongs.filter((s) => !hidden.has(s.id));
}
recompute();

const listeners = new Set<() => void>();
function emit() {
  localStorage.setItem(LS, JSON.stringify(userSongs));
  localStorage.setItem(LS_HIDDEN, JSON.stringify([...hidden]));
  localStorage.setItem(LS_OVERRIDES, JSON.stringify(overrides));
  recompute();
  version++;
  listeners.forEach((l) => l());
}

const newUserId = () =>
  "u_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// module-level accessors (used by the cloud sync engine)
export function getUserSongs(): Song[] {
  return userSongs;
}
export function setUserSongs(next: Song[]) {
  // sanitize (e.g. records merged from the cloud) before they enter the catalog
  userSongs = next.map(sanitizeSong).filter((s): s is Song => s !== null);
  emit();
}
export function getHiddenIds(): string[] {
  return [...hidden];
}
export function setHiddenIds(next: string[]) {
  hidden = new Set(next);
  emit();
}
export function getOverrides(): Record<string, Partial<Song>> {
  return overrides;
}
export function setOverrides(next: Record<string, Partial<Song>>) {
  overrides = next && typeof next === "object" ? next : {};
  emit();
}
export function subscribeCatalog(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getSongs(): Song[] {
  return songs;
}
export function getSongById(id: string): Song | undefined {
  return byId.get(id);
}
export function isUserSong(id: string): boolean {
  return userSongs.some((s) => s.id === id);
}

// ---- hide / restore (base songs the user doesn't want in their list) ----
export function isHidden(id: string): boolean {
  return hidden.has(id);
}
export function hideSong(id: string) {
  hidden.add(id);
  emit();
}
export function unhideSong(id: string) {
  hidden.delete(id);
  emit();
}
export function getHiddenSongs(): Song[] {
  return [...hidden].map((id) => byId.get(id)).filter((s): s is Song => Boolean(s));
}

export interface SongInput {
  title: string;
  keys: string[];
  tempos: Tempo[];
  themes: string[];
  hymnNo: number | null;
}

export function addSong(input: SongInput): Song {
  const song: Song = { id: newUserId(), ...input };
  userSongs = [...userSongs, song];
  emit();
  return song;
}
export function updateSong(id: string, input: SongInput) {
  if (userSongs.some((s) => s.id === id)) {
    // user-added song: edit in place
    userSongs = userSongs.map((s) => (s.id === id ? { ...s, ...input } : s));
  } else {
    // base (static) song: store a per-user override, leaving the original intact
    overrides = { ...overrides, [id]: input };
  }
  emit();
}
export function removeSong(id: string) {
  userSongs = userSongs.filter((s) => s.id !== id);
  emit();
}

// edited base songs
export function isOverridden(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(overrides, id);
}
export function resetOverride(id: string) {
  if (!isOverridden(id)) return;
  const { [id]: _removed, ...rest } = overrides;
  overrides = rest;
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
  excludeIds: Set<string> = new Set(),
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

export interface Related {
  song: Song;
  relation: Relation;
  sameTempo: boolean;
  sharedThemes: string[];
}

/** Songs that fit a given song across key + tempo + theme, best matches first. */
export function relatedSongs(
  song: Song,
  excludeIds: Set<string> = new Set(),
  limit = 6
): Related[] {
  return songs
    .filter((s) => !excludeIds.has(s.id))
    .map((s) => {
      const relation = bestRelation(song.keys, s.keys);
      const sameTempo = song.tempos.some((t) => s.tempos.includes(t));
      const sharedThemes = s.themes.filter((t) => song.themes.includes(t));
      const score =
        relation.score * 2 + (sameTempo ? 2 : 0) + Math.min(sharedThemes.length, 3) * 2;
      return { song: s, relation, sameTempo, sharedThemes, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.song.title.localeCompare(b.song.title, "ko"))
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
  return { songs, songById: byId, hiddenCount: hidden.size, getHiddenSongs };
}
