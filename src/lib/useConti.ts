import { useCallback, useEffect, useState } from "react";

const KEY = "wl.contis";
const LEGACY = "wl.conti"; // previous single-conti storage

export interface SheetText {
  x: number; // 0..1 — center position relative to image width
  y: number; // 0..1 — center position relative to image height
  text: string;
  color: string; // hex
  size: number; // font size as a fraction of image width
}
export interface SheetStroke {
  points: { x: number; y: number }[]; // 0..1 — x by image width, y by image height
  color: string; // hex
  width: number; // stroke width as a fraction of image width
  highlight?: boolean; // semi-transparent marker (형광펜) vs. opaque pen (그리기)
}
export interface ContiItem {
  id: string;
  note?: string;
  key?: string; // chosen key when the song has several
  youtube?: string; // custom YouTube URL
  sheets?: string[]; // sheet-music attachment ids (stored in IndexedDB)
  sheetTexts?: Record<string, SheetText[]>; // text annotations per sheet (by attachment id)
}
export interface Conti {
  id: string;
  name: string;
  items: ContiItem[];
  note?: string; // 묵상노트 — free-form meditation memo for this conti
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
          if (x.sheetTexts && typeof x.sheetTexts === "object" && !Array.isArray(x.sheetTexts)) {
            const out: Record<string, SheetText[]> = {};
            for (const [k, v] of Object.entries(x.sheetTexts)) {
              if (!Array.isArray(v)) continue;
              const arr = v
                .filter(
                  (t: any) =>
                    t &&
                    typeof t.text === "string" &&
                    t.text &&
                    typeof t.x === "number" &&
                    typeof t.y === "number"
                )
                .map((t: any) => ({
                  x: t.x,
                  y: t.y,
                  text: String(t.text),
                  color: typeof t.color === "string" ? t.color : "#ef4444",
                  size: typeof t.size === "number" ? t.size : 0.045,
                }));
              if (arr.length) out[k] = arr;
            }
            if (Object.keys(out).length) it.sheetTexts = out;
          }
          return it;
        })
    : [];
}
function sanitizeConti(c: any): Conti | null {
  if (!c || typeof c.id !== "string") return null;
  const out: Conti = {
    id: c.id,
    name: typeof c.name === "string" && c.name ? c.name : "콘티",
    items: sanitizeItems(c.items),
  };
  if (typeof c.note === "string" && c.note) out.note = c.note;
  return out;
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
  // persistence is best-effort: a quota error must not abort the in-memory
  // update or the listeners that re-render from it
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("[conti] persist failed", e);
  }
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
          const { sheets: _omit, sheetTexts: _t, ...rest } = i;
          const tx = { ...(i.sheetTexts ?? {}) };
          delete tx[aid];
          const next: ContiItem = { ...rest };
          if (sheets.length) next.sheets = sheets;
          if (Object.keys(tx).length) next.sheetTexts = tx;
          return next;
        })
      ),
    []
  );
  const setSheetTexts = useCallback(
    (id: string, aid: string, list: SheetText[]) =>
      mutateActive((items) =>
        items.map((i) => {
          if (i.id !== id) return i;
          const tx = { ...(i.sheetTexts ?? {}) };
          if (list.length) tx[aid] = list;
          else delete tx[aid];
          const { sheetTexts: _omit, ...rest } = i;
          return Object.keys(tx).length ? { ...rest, sheetTexts: tx } : rest;
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
  /** Move a saved conti one slot up (-1) or down (+1) in the list. */
  const moveConti = useCallback((id: string, dir: -1 | 1) => {
    const idx = state.contis.findIndex((c) => c.id === id);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= state.contis.length) return;
    const contis = state.contis.slice();
    [contis[idx], contis[next]] = [contis[next], contis[idx]];
    commit({ ...state, contis });
  }, []);
  // 묵상노트 — store the meditation memo on the active conti
  const setContiNote = useCallback((note: string) => {
    const a = active();
    commit({ ...state, contis: state.contis.map((c) => (c.id === a.id ? { ...c, note } : c)) });
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
    contiNote: cur.note ?? "",
    setContiNote,
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
    setSheetTexts,
    clear,
    replace,
    createConti,
    renameConti,
    moveConti,
    deleteConti,
    setActive,
  };
}
