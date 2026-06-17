import { useCallback, useEffect, useState } from "react";

const KEY = "wl.favorites";

function load(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((n) => typeof n === "string") : [];
  } catch {
    return [];
  }
}

// shared in-memory state so every component using the hook stays in sync
let ids = new Set<string>(load());
const listeners = new Set<(s: Set<string>) => void>();

function emit() {
  localStorage.setItem(KEY, JSON.stringify([...ids]));
  for (const l of listeners) l(new Set(ids));
}

// module-level accessors (used by the cloud sync engine)
export function getFavoriteIds(): string[] {
  return [...ids];
}
export function setFavoriteIds(arr: string[]) {
  ids = new Set(arr);
  emit();
}
export function subscribeFavorites(cb: () => void) {
  const l = () => cb();
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set(ids));

  useEffect(() => {
    const l = (s: Set<string>) => setFavorites(s);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  const toggle = useCallback((id: string) => {
    ids = new Set(ids);
    if (ids.has(id)) ids.delete(id);
    else ids.add(id);
    emit();
  }, []);

  const isFavorite = useCallback((id: string) => favorites.has(id), [favorites]);

  return { favorites, isFavorite, toggle };
}
