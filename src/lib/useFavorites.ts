import { useCallback, useEffect, useState } from "react";

const KEY = "wl.favorites";

function load(): number[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((n) => typeof n === "number") : [];
  } catch {
    return [];
  }
}

// shared in-memory state so every component using the hook stays in sync
let ids = new Set<number>(load());
const listeners = new Set<(s: Set<number>) => void>();

function emit() {
  localStorage.setItem(KEY, JSON.stringify([...ids]));
  for (const l of listeners) l(new Set(ids));
}

// module-level accessors (used by the cloud sync engine)
export function getFavoriteIds(): number[] {
  return [...ids];
}
export function setFavoriteIds(arr: number[]) {
  ids = new Set(arr);
  emit();
}
export function subscribeFavorites(cb: () => void) {
  const l = () => cb();
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<Set<number>>(() => new Set(ids));

  useEffect(() => {
    const l = (s: Set<number>) => setFavorites(s);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  const toggle = useCallback((id: number) => {
    ids = new Set(ids);
    if (ids.has(id)) ids.delete(id);
    else ids.add(id);
    emit();
  }, []);

  const isFavorite = useCallback((id: number) => favorites.has(id), [favorites]);

  return { favorites, isFavorite, toggle };
}
