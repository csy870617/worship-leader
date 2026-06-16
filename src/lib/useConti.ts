import { useCallback, useEffect, useState } from "react";

const KEY = "wl.conti";

export interface ContiItem {
  id: number;
  note?: string;
}

function load(): ContiItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr
      .map((x) => (typeof x === "number" ? { id: x } : x))
      .filter((x) => x && typeof x.id === "number");
  } catch {
    return [];
  }
}

// shared in-memory state so every component using the hook stays in sync
let items: ContiItem[] = load();
const listeners = new Set<(s: ContiItem[]) => void>();

function emit() {
  localStorage.setItem(KEY, JSON.stringify(items));
  for (const l of listeners) l(items.slice());
}

export function useConti() {
  const [conti, setConti] = useState<ContiItem[]>(() => items.slice());

  useEffect(() => {
    const l = (s: ContiItem[]) => setConti(s);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  const has = useCallback((id: number) => items.some((i) => i.id === id), []);

  const add = useCallback((id: number) => {
    if (items.some((i) => i.id === id)) return;
    items = [...items, { id }];
    emit();
  }, []);

  const remove = useCallback((id: number) => {
    items = items.filter((i) => i.id !== id);
    emit();
  }, []);

  const toggle = useCallback((id: number) => {
    if (items.some((i) => i.id === id)) items = items.filter((i) => i.id !== id);
    else items = [...items, { id }];
    emit();
  }, []);

  const move = useCallback((id: number, dir: -1 | 1) => {
    const idx = items.findIndex((i) => i.id === id);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= items.length) return;
    const copy = items.slice();
    [copy[idx], copy[next]] = [copy[next], copy[idx]];
    items = copy;
    emit();
  }, []);

  const setNote = useCallback((id: number, note: string) => {
    items = items.map((i) => (i.id === id ? { ...i, note } : i));
    emit();
  }, []);

  const clear = useCallback(() => {
    items = [];
    emit();
  }, []);

  const replace = useCallback((next: ContiItem[]) => {
    items = next.slice();
    emit();
  }, []);

  return { conti, has, add, remove, toggle, move, setNote, clear, replace };
}
