// Attachments (YouTube link + sheet images + sheet text annotations) live with
// the SONG, keyed by song id — so once you attach them they follow the song
// into any conti and survive remove/re-add. Persisted to localStorage and
// synced to the cloud like the rest of the user's data.
import { useSyncExternalStore } from "react";
import type { SheetStroke, SheetText } from "./useConti";
import { getContiState, setContiState } from "./useConti";

export interface SongAttach {
  note?: string; // 송폼 — song form / arrangement notes (e.g. V1, C, Tag)
  memo?: string; // 메모 — free-form memo
  youtube?: string;
  sheets?: string[]; // attachment ids (Drive fileId or local id)
  sheetTexts?: Record<string, SheetText[]>; // text annotations per sheet
  sheetDraws?: Record<string, SheetStroke[]>; // pen / highlighter strokes per sheet
}
type Store = Record<string, SongAttach>;
const LS = "wl.songAttach";

function sanitizeAttach(a: any): SongAttach | null {
  if (!a || typeof a !== "object") return null;
  const out: SongAttach = {};
  if (typeof a.note === "string" && a.note.trim()) out.note = a.note;
  if (typeof a.memo === "string" && a.memo.trim()) out.memo = a.memo;
  if (typeof a.youtube === "string" && a.youtube) out.youtube = a.youtube;
  if (Array.isArray(a.sheets)) {
    const s = a.sheets.filter((x: any) => typeof x === "string" && x);
    if (s.length) out.sheets = s;
  }
  // annotations keyed by a sheet id that's no longer in `sheets` are orphans
  // (e.g. the sheet was deleted on another device mid-edit); dropping them here
  // self-heals existing docs on every load/update/cloud apply
  const liveSheets = new Set(out.sheets ?? []);
  if (a.sheetTexts && typeof a.sheetTexts === "object" && !Array.isArray(a.sheetTexts)) {
    const st: Record<string, SheetText[]> = {};
    for (const [k, v] of Object.entries(a.sheetTexts)) {
      if (!liveSheets.has(k)) continue;
      if (!Array.isArray(v)) continue;
      const arr = (v as any[])
        .filter((t) => t && typeof t.text === "string" && t.text && typeof t.x === "number" && typeof t.y === "number")
        .map((t) => ({
          x: t.x,
          y: t.y,
          text: String(t.text),
          color: typeof t.color === "string" ? t.color : "#ef4444",
          size: typeof t.size === "number" ? t.size : 0.045,
        }));
      if (arr.length) st[k] = arr;
    }
    if (Object.keys(st).length) out.sheetTexts = st;
  }
  if (a.sheetDraws && typeof a.sheetDraws === "object" && !Array.isArray(a.sheetDraws)) {
    const sd: Record<string, SheetStroke[]> = {};
    for (const [k, v] of Object.entries(a.sheetDraws)) {
      if (!liveSheets.has(k)) continue;
      if (!Array.isArray(v)) continue;
      const arr = (v as any[])
        .map((s): SheetStroke | null => {
          const points = Array.isArray(s?.points)
            ? s.points
                .filter((p: any) => p && typeof p.x === "number" && typeof p.y === "number")
                .map((p: any) => ({ x: p.x, y: p.y }))
            : [];
          if (points.length < 2) return null;
          const stroke: SheetStroke = {
            points,
            color: typeof s.color === "string" ? s.color : "#eab308",
            width: typeof s.width === "number" ? s.width : 0.01,
          };
          if (s.highlight === true) stroke.highlight = true;
          return stroke;
        })
        .filter((s): s is SheetStroke => s !== null);
      if (arr.length) sd[k] = arr;
    }
    if (Object.keys(sd).length) out.sheetDraws = sd;
  }
  return Object.keys(out).length ? out : null;
}

function sanitizeStore(o: any): Store {
  const out: Store = {};
  if (o && typeof o === "object" && !Array.isArray(o)) {
    for (const [k, v] of Object.entries(o)) {
      const a = sanitizeAttach(v);
      if (a) out[k] = a;
    }
  }
  return out;
}

function load(): Store {
  try {
    return sanitizeStore(JSON.parse(localStorage.getItem(LS) || "{}"));
  } catch {
    return {};
  }
}

let store: Store = load();
let version = 0;
const listeners = new Set<() => void>();
function emit() {
  // persistence is best-effort: a quota error must not abort the in-memory update
  try {
    localStorage.setItem(LS, JSON.stringify(store));
  } catch (e) {
    console.warn("[songAttach] persist failed", e);
  }
  version++;
  listeners.forEach((l) => l());
}

export function getSongAttach(id: string): SongAttach | undefined {
  return store[id];
}
export function getSongAttachStore(): Store {
  return store;
}
export function setSongAttachStore(next: Record<string, SongAttach>) {
  store = sanitizeStore(next);
  emit();
}
export function subscribeSongAttach(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function update(id: string, fn: (a: SongAttach) => SongAttach) {
  const next = sanitizeAttach(fn(store[id] ?? {}));
  if (next) store = { ...store, [id]: next };
  else {
    const { [id]: _omit, ...rest } = store;
    store = rest;
  }
  emit();
}

export function setSongNote(id: string, note: string) {
  update(id, (a) => ({ ...a, note: note.trim() ? note : undefined }));
}
export function setSongMemo(id: string, memo: string) {
  update(id, (a) => ({ ...a, memo: memo.trim() ? memo : undefined }));
}
export function setSongYoutube(id: string, url: string | null) {
  update(id, (a) => ({ ...a, youtube: url?.trim() || undefined }));
}
export function addSongSheet(id: string, aid: string) {
  update(id, (a) => ({ ...a, sheets: [...(a.sheets ?? []), aid] }));
}
/** Replace the sheet order of a song (drag-and-drop commit). Keeps only the
 *  ids that already belong to the song, so a stale list can't add/drop sheets. */
export function setSongSheets(id: string, order: string[]) {
  update(id, (a) => {
    const current = a.sheets ?? [];
    const next = order.filter((x) => current.includes(x));
    // guard: only accept a pure reordering of the same set
    if (next.length !== current.length) return a;
    return { ...a, sheets: next };
  });
}
export function removeSongSheet(id: string, aid: string) {
  update(id, (a) => {
    const sheets = (a.sheets ?? []).filter((x) => x !== aid);
    const st = { ...(a.sheetTexts ?? {}) };
    delete st[aid];
    const sd = { ...(a.sheetDraws ?? {}) };
    delete sd[aid];
    return { ...a, sheets, sheetTexts: st, sheetDraws: sd };
  });
}
export function replaceSongSheet(
  id: string,
  oldAid: string,
  newAid: string,
  crop?: { x: number; y: number; w: number; h: number },
) {
  update(id, (a) => {
    const sheets = (a.sheets ?? []).map((x) => (x === oldAid ? newAid : x));
    const st = { ...(a.sheetTexts ?? {}) };
    const old = st[oldAid];
    delete st[oldAid];
    // Remap text annotations into the cropped region: positions and sizes are
    // fractions of the image, so divide by the crop's width/height and drop any
    // text whose anchor falls outside the new frame.
    if (crop && crop.w > 0 && crop.h > 0 && old && old.length) {
      const mapped = old
        .map((t) => ({
          ...t,
          x: (t.x - crop.x) / crop.w,
          y: (t.y - crop.y) / crop.h,
          size: t.size / crop.w,
        }))
        .filter((t) => t.x >= 0 && t.x <= 1 && t.y >= 0 && t.y <= 1);
      if (mapped.length) st[newAid] = mapped;
    }
    // Remap pen / highlighter strokes the same way; keep a stroke if any of its
    // points still falls inside the new frame.
    const sd = { ...(a.sheetDraws ?? {}) };
    const oldD = sd[oldAid];
    delete sd[oldAid];
    if (crop && crop.w > 0 && crop.h > 0 && oldD && oldD.length) {
      const mappedD = oldD
        .map((s) => ({
          ...s,
          points: s.points.map((p) => ({ x: (p.x - crop.x) / crop.w, y: (p.y - crop.y) / crop.h })),
          width: s.width / crop.w,
        }))
        .filter((s) => s.points.some((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1));
      if (mappedD.length) sd[newAid] = mappedD;
    }
    return { ...a, sheets, sheetTexts: st, sheetDraws: sd };
  });
}
export function setSongSheetTexts(id: string, aid: string, list: SheetText[]) {
  update(id, (a) => {
    const st = { ...(a.sheetTexts ?? {}) };
    if (list.length) st[aid] = list;
    else delete st[aid];
    return { ...a, sheetTexts: st };
  });
}
export function setSongSheetDraws(id: string, aid: string, list: SheetStroke[]) {
  update(id, (a) => {
    const sd = { ...(a.sheetDraws ?? {}) };
    if (list.length) sd[aid] = list;
    else delete sd[aid];
    return { ...a, sheetDraws: sd };
  });
}

/** One-time: move attachments that used to live on conti items into the song store. */
export function migrateFromContis() {
  const s = getContiState();
  let changed = false;
  const contis = s.contis.map((c) => ({
    ...c,
    items: c.items.map((it: any) => {
      if (it.note || it.youtube || it.sheets || it.sheetTexts) {
        changed = true;
        const cur = store[it.id] ?? {};
        const clean = sanitizeAttach({
          note: cur.note ?? it.note,
          youtube: cur.youtube ?? it.youtube,
          sheets: cur.sheets ?? it.sheets,
          sheetTexts: cur.sheetTexts ?? it.sheetTexts,
        });
        if (clean) store[it.id] = clean;
        const { note, youtube, sheets, sheetTexts, ...rest } = it;
        return rest;
      }
      return it;
    }),
  }));
  if (changed) {
    emit();
    setContiState({ contis, activeId: s.activeId });
  }
}

export function useSongAttach(): Store {
  useSyncExternalStore(subscribeSongAttach, () => version, () => version);
  return store;
}
