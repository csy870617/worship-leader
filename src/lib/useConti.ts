import { useCallback, useEffect, useState } from "react";

const KEY = "wl.contis";
const LEGACY = "wl.conti"; // previous single-conti storage

export interface ContiItem {
  id: string;
  note?: string;
  key?: string; // chosen key when the song has several
  youtube?: string; // custom YouTube URL
  sheets?: string[]; // sheet-music attachment ids (stored in IndexedDB)
  sheetNotes?: Record<string, string>; // memo per sheet, keyed by attachment id
}
export interface Conti {
  id: string;
  name: string;
  items: ContiItem[];
}
interface State {
  contis: Conti[];
  activeId: string;
}

const newId = () => "c_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

function sanitizeItems(arr: unknown): ContiItem[] {
  return Array.isArray(arr)
    ? arr
        .filter((x: any) => x && typeof x.id === "string")
        .map((x: any) => {
          const it: ContiItem = { id: x.id };
          if (x.note) it.note = String(x.note);
          if (typeof x.key === "string" && x.key) it.key = x.key;
          if (typeof x.youtube === "string" && x.youtube) it.youtube = x.youtube;
          if (Array.isArray(x.sheets)) {
            const s = x.sheets.filter((v: any) => typeof v === "string" && v);
            if (s.length) it.sheets = s;
          }
          if (x.sheetNotes && typeof x.sheetNotes === "object" && !Array.isArray(x.sheetNotes)) {
            const n: Record<string, string> = {};
            for (const [k, v] of Object.entries(x.sheetNotes)) {
              if (typeof v === "string" && v) n[k] = v;
            }
            if (Object.keys(n).length) it.sheetNotes = n;
          }
          return it;
        })
    : [];
}
function sanitizeConti(c: any): Conti | null {
  if (!c || typeof c.id !== "string") return null;
  return {
    id: c.id,
    name: typeof c.name === "string" && c.name ? c.name : "콘티",
    items: sanitizeItems(c.items),
  };
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw);
      const contis = Array.isArray(o?.contis)
        ? o.contis.map(sanitizeConti).filter((c: Conti | null): c is Conti => !!c)
        : [];
      if (contis.length) {
        const activeId = contis.some((c: Conti) => c.id === o.activeId) ? o.activeId : contis[0].id;
        return { contis, activeId };
      }
    }
    // migrate a previously-saved single conti
    const legacyRaw = localStorage.getItem(LEGACY);
    const items = legacyRaw ? sanitizeItems(JSON.parse(legacyRaw)) : [];
    const c: Conti = { id: newId(), name: "콘티 1", items };
    return { contis: [c], activeId: c.id };
  } catch {
    const c: Conti = { id: newId(), name: "콘티 1", items: [] };
    return { contis: [c], activeId: c.id };
  }
}

let state: State = load();
const listeners = new Set<(s: State) => void>();
function commit(next: State) {
  state = next;
  localStorage.setItem(KEY, JSON.stringify(state));
  for (const l of listeners) l(state);
}

const active = (s: State = state) => s.contis.find((c) => c.id === s.activeId) ?? s.contis[0];
function mutateActive(fn: (items: ContiItem[]) => ContiItem[]) {
  const a = active();
  commit({ ...state, contis: state.contis.map((c) => (c.id === a.id ? { ...c, items: fn(c.items) } : c)) });
}

// ---- module-level accessors (cloud sync engine) ----
export function getContiState(): State {
  return state;
}
export function setContiState(next: { contis: Conti[]; activeId: string }) {
  const contis = Array.isArray(next?.contis)
    ? next.contis.map(sanitizeConti).filter((c): c is Conti => !!c)
    : [];
  if (!contis.length) {
    const c: Conti = { id: newId(), name: "콘티 1", items: [] };
    commit({ contis: [c], activeId: c.id });
    return;
  }
  const activeId = contis.some((c) => c.id === next.activeId) ? next.activeId : contis[0].id;
  commit({ contis, activeId });
}
export function subscribeConti(cb: () => void) {
  const l = () => cb();
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useConti() {
  const [s, setS] = useState<State>(state);
  useEffect(() => {
    const l = (x: State) => setS(x);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  const cur = active(s);

  // active-conti item ops
  const has = useCallback((id: string) => active().items.some((i) => i.id === id), []);
  const add = useCallback(
    (id: string) => mutateActive((items) => (items.some((i) => i.id === id) ? items : [...items, { id }])),
    []
  );
  const remove = useCallback((id: string) => mutateActive((items) => items.filter((i) => i.id !== id)), []);
  const toggle = useCallback(
    (id: string) =>
      mutateActive((items) =>
        items.some((i) => i.id === id) ? items.filter((i) => i.id !== id) : [...items, { id }]
      ),
    []
  );
  const move = useCallback(
    (id: string, dir: -1 | 1) =>
      mutateActive((items) => {
        const idx = items.findIndex((i) => i.id === id);
        const next = idx + dir;
        if (idx < 0 || next < 0 || next >= items.length) return items;
        const copy = items.slice();
        [copy[idx], copy[next]] = [copy[next], copy[idx]];
        return copy;
      }),
    []
  );
  const setNote = useCallback(
    (id: string, note: string) => mutateActive((items) => items.map((i) => (i.id === id ? { ...i, note } : i))),
    []
  );
  const setKey = useCallback(
    (id: string, key: string | null) =>
      mutateActive((items) =>
        items.map((i) => {
          if (i.id !== id) return i;
          const { key: _omit, ...rest } = i;
          return key ? { ...rest, key } : rest;
        })
      ),
    []
  );
  const setYoutube = useCallback(
    (id: string, url: string | null) =>
      mutateActive((items) =>
        items.map((i) => {
          if (i.id !== id) return i;
          const { youtube: _omit, ...rest } = i;
          const u = url?.trim();
          return u ? { ...rest, youtube: u } : rest;
        })
      ),
    []
  );
  const addSheet = useCallback(
    (id: string, aid: string) =>
      mutateActive((items) =>
        items.map((i) => (i.id === id ? { ...i, sheets: [...(i.sheets ?? []), aid] } : i))
      ),
    []
  );
  const removeSheet = useCallback(
    (id: string, aid: string) =>
      mutateActive((items) =>
        items.map((i) => {
          if (i.id !== id) return i;
          const sheets = (i.sheets ?? []).filter((x) => x !== aid);
          const { sheets: _omit, sheetNotes: _n, ...rest } = i;
          const notes = { ...(i.sheetNotes ?? {}) };
          delete notes[aid];
          const next: ContiItem = { ...rest };
          if (sheets.length) next.sheets = sheets;
          if (Object.keys(notes).length) next.sheetNotes = notes;
          return next;
        })
      ),
    []
  );
  const setSheetNote = useCallback(
    (id: string, aid: string, note: string) =>
      mutateActive((items) =>
        items.map((i) => {
          if (i.id !== id) return i;
          const notes = { ...(i.sheetNotes ?? {}) };
          const v = note.trim();
          if (v) notes[aid] = v;
          else delete notes[aid];
          const { sheetNotes: _omit, ...rest } = i;
          return Object.keys(notes).length ? { ...rest, sheetNotes: notes } : rest;
        })
      ),
    []
  );
  const clear = useCallback(() => mutateActive(() => []), []);
  const replace = useCallback((items: ContiItem[]) => mutateActive(() => items.slice()), []);

  // collection ops
  const createConti = useCallback((name?: string) => {
    const c: Conti = { id: newId(), name: name?.trim() || `콘티 ${state.contis.length + 1}`, items: [] };
    commit({ contis: [...state.contis, c], activeId: c.id });
    return c.id;
  }, []);
  const renameConti = useCallback((id: string, name: string) => {
    commit({
      ...state,
      contis: state.contis.map((c) => (c.id === id ? { ...c, name: name.trim() || c.name } : c)),
    });
  }, []);
  const deleteConti = useCallback((id: string) => {
    let contis = state.contis.filter((c) => c.id !== id);
    if (!contis.length) contis = [{ id: newId(), name: "콘티 1", items: [] }];
    const activeId = state.activeId === id ? contis[0].id : state.activeId;
    commit({ contis, activeId });
  }, []);
  const setActive = useCallback((id: string) => {
    if (state.contis.some((c) => c.id === id)) commit({ ...state, activeId: id });
  }, []);

  return {
    contis: s.contis,
    activeId: s.activeId,
    active: cur,
    conti: cur.items,
    has,
    add,
    remove,
    toggle,
    move,
    setNote,
    setKey,
    setYoutube,
    addSheet,
    removeSheet,
    setSheetNote,
    clear,
    replace,
    createConti,
    renameConti,
    deleteConti,
    setActive,
  };
}
