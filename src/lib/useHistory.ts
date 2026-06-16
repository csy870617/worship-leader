import { useCallback, useEffect, useState } from "react";

const KEY = "wl.history";

type History = Record<number, string>; // songId -> ISO date (YYYY-MM-DD)

function load(): History {
  try {
    const raw = localStorage.getItem(KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

let history: History = load();
const listeners = new Set<(h: History) => void>();

function emit() {
  localStorage.setItem(KEY, JSON.stringify(history));
  for (const l of listeners) l({ ...history });
}

// module-level accessors (used by the cloud sync engine)
export function getHistoryMap(): Record<number, string> {
  return { ...history };
}
export function setHistoryMap(next: Record<number, string>) {
  history = { ...next };
  emit();
}
export function subscribeHistory(cb: () => void) {
  const l = () => cb();
  listeners.add(l);
  return () => listeners.delete(l);
}

const today = () => new Date().toISOString().slice(0, 10);

export function daysSince(iso: string): number {
  const then = new Date(iso + "T00:00:00").getTime();
  return Math.floor((Date.now() - then) / 86400000);
}

export function useHistory() {
  const [state, setState] = useState<History>(() => ({ ...history }));

  useEffect(() => {
    const l = (h: History) => setState(h);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  const markUsed = useCallback((ids: number[], date = today()) => {
    history = { ...history };
    for (const id of ids) history[id] = date;
    emit();
  }, []);

  const lastUsed = useCallback((id: number): string | null => state[id] ?? null, [state]);

  return { history: state, markUsed, lastUsed };
}
