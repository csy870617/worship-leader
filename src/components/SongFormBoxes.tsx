import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  type FormItem,
  MAX_REPEAT,
  NEUTRAL_BOX,
  formBoxColors,
  itemColor,
  parseForm,
  serializeForm,
  splitRepeat,
  subscribePresetColors,
  withRepeat,
} from "../lib/songForm";

/**
 * 송폼 editor: the form is a row of boxes, not a line of text.
 *
 * - a preset box (V1, C, Int4 …) carries a fixed label — it can be moved or
 *   removed, never retyped
 * - a text box is the "빈 박스": whatever the user types for something the
 *   presets don't cover
 * - boxes are reordered by dragging (mouse: press and move; touch: press and
 *   hold, then move)
 *
 * The whole form still travels as one string (see lib/songForm), so sync, the
 * PDF export and every form written before boxes existed keep working.
 */

// The chip bar lives outside this component, so the field that was last
// touched registers itself here and receives the chips' taps.
type Ctl = {
  insert: (text: string, preset: boolean) => void;
  /** a chip is being dragged over the page: mark where it would land */
  hover: (x: number, y: number) => boolean;
  /** let go of a dragged chip; true when it landed in the form */
  drop: (text: string, preset: boolean, x: number, y: number) => boolean;
  cancelHover: () => void;
};
let activeCtl: Ctl | null = null;
/** Add a box at the end of the song form the user is editing (a chip tap). */
export function insertFormBox(text: string, preset = true) {
  activeCtl?.insert(text, preset);
  return activeCtl != null;
}
/** Chip dragging: show where the box would go, and put it there on release. */
export function formDragOver(x: number, y: number) {
  return activeCtl?.hover(x, y) ?? false;
}
export function formDragDrop(text: string, preset: boolean, x: number, y: number) {
  return activeCtl?.drop(text, preset, x, y) ?? false;
}
export function formDragCancel() {
  activeCtl?.cancelHover();
}

// block page scrolling while a box is being dragged
const preventScroll = (e: TouchEvent) => e.preventDefault();

export default function SongFormBoxes({
  value,
  onChange,
  onFocus,
  onBlur,
  onSelect,
  placeholder = "송폼 입력",
  variant = "light",
  size = "sm",
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  /** the field became the one the chip bar types into */
  onFocus?: () => void;
  onBlur?: () => void;
  /** text of the selected box, so the bar can offer a color for it ("" = none) */
  onSelect?: (selected: string) => void;
  placeholder?: string;
  variant?: "light" | "dark";
  /** "lg" = the roomier song form on the 콘티보기 page */
  size?: "sm" | "lg";
  className?: string;
}) {
  const [, force] = useState(0);
  useEffect(() => subscribePresetColors(() => force((n) => n + 1)), []);

  const items = useMemo(() => parseForm(value), [value]);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const [sel, setSel] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [order, setOrder] = useState<FormItem[] | null>(null);
  const dragIdRef = useRef<string | null>(null);
  const orderRef = useRef<FormItem[] | null>(null);
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lpStart = useRef<{ x: number; y: number; id: string } | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const focusIdRef = useRef<string | null>(null); // text box to focus after a re-render

  const myCtl = useRef<Ctl | null>(null);
  const outsideRef = useRef<((e: PointerEvent) => void) | null>(null);
  const onBlurRef = useRef(onBlur);
  onBlurRef.current = onBlur;

  // ---- undo / redo (⌘Z, ⇧⌘Z / Ctrl+Y) ----
  // Every change goes through commit(), so the value before it is all the undo
  // stack needs. Typing is coalesced: a burst of keystrokes is one step.
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const undoRef = useRef<string[]>([]);
  const redoRef = useRef<string[]>([]);
  const lastPush = useRef({ at: 0, typing: false });

  const commit = (next: FormItem[], typing = false) => {
    const now = Date.now();
    const coalesce = typing && lastPush.current.typing && now - lastPush.current.at < 700;
    if (!coalesce) undoRef.current = [...undoRef.current.slice(-49), valueRef.current];
    lastPush.current = { at: now, typing };
    redoRef.current = [];
    onChange(serializeForm(next));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      const redo = (k === "z" && e.shiftKey) || (k === "y" && !e.shiftKey);
      const undo = k === "z" && !e.shiftKey;
      if (!undo && !redo) return;
      // only the field the user last worked in answers
      if (activeCtl !== myCtl.current) return;
      const from = redo ? redoRef.current : undoRef.current;
      const to = redo ? undoRef.current : redoRef.current;
      const v = from.pop();
      if (v == null) return;
      e.preventDefault();
      e.stopPropagation();
      to.push(valueRef.current);
      lastPush.current = { at: 0, typing: false };
      setSel(null);
      onSelectRef.current?.("");
      onChangeRef.current(v);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  const activate = () => {
    const ctl: Ctl = {
      hover: () => false,
      drop: () => false,
      cancelHover: () => {},
      insert: (text: string, preset: boolean) => {
        const cur = itemsRef.current;
        const at = sel ? cur.findIndex((i) => i.id === sel) : -1;
        const box: FormItem = { id: "new", text, preset };
        const next = at >= 0 ? [...cur.slice(0, at + 1), box, ...cur.slice(at + 1)] : [...cur, box];
        // keep the caret on a freshly added text box so it can be typed into
        focusIdRef.current = preset ? null : `b${at >= 0 ? at + 1 : cur.length}`;
        setSel(null);
        onSelect?.("");
        commit(next);
      },
    };
    ctl.hover = (x, y) => {
      const at = dropIndexFromPoint(x, y);
      setDropAt(at);
      return at != null;
    };
    ctl.drop = (text, preset, x, y) => {
      const at = dropIndexFromPoint(x, y);
      setDropAt(null);
      if (at == null) return false;
      const cur = itemsRef.current;
      const next = [...cur.slice(0, at), { id: "new", text, preset }, ...cur.slice(at)];
      focusIdRef.current = preset ? null : `b${at}`;
      setSel(null);
      onSelect?.("");
      commit(next);
      return true;
    };
    ctl.cancelHover = () => setDropAt(null);
    myCtl.current = ctl;
    activeCtl = ctl;
    // the bar belongs to whichever field was last touched; a tap anywhere else
    // lets the parent put it away (the bar itself cancels that on its own)
    if (!outsideRef.current) {
      const onOutside = (e: PointerEvent) => {
        const t = e.target as Element | null;
        if (rowRef.current?.contains(t as Node)) return;
        // the preset bar is this field's own toolbar: tapping it keeps the
        // selection (that's where the color palette and the chips act on it)
        if (t?.closest?.("[data-preset-bar]")) return;
        setSel(null);
        setDropAt(null);
        onSelect?.("");
        onBlurRef.current?.();
      };
      outsideRef.current = onOutside;
      document.addEventListener("pointerdown", onOutside, true);
    }
    onFocus?.();
  };

  // focus a just-inserted text box once it exists in the DOM
  useEffect(() => {
    const id = focusIdRef.current;
    if (!id) return;
    focusIdRef.current = null;
    const el = rowRef.current?.querySelector<HTMLInputElement>(`input[data-box="${id}"]`);
    el?.focus();
  });

  useEffect(
    () => () => {
      window.removeEventListener("touchmove", preventScroll);
      window.removeEventListener("pointerup", onWindowUp);
      window.removeEventListener("pointercancel", onWindowUp);
      if (lpTimer.current) clearTimeout(lpTimer.current);
      if (outsideRef.current) document.removeEventListener("pointerdown", outsideRef.current, true);
      if (activeCtl && activeCtl === myCtl.current) activeCtl = null;
    },
    []
  );

  // ---- drag to reorder ----
  const indexFromPoint = (x: number, y: number) => {
    const row = rowRef.current;
    if (!row) return -1;
    const boxes = Array.from(row.querySelectorAll<HTMLElement>("[data-boxwrap]"));
    let best = -1;
    let bestD = Infinity;
    boxes.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const dx = x - (r.left + r.width / 2);
      const dy = y - (r.top + r.height / 2);
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  };
  /** Index a box dropped at (x, y) would take, or null when that point isn't
   *  over this field. */
  const dropIndexFromPoint = (x: number, y: number): number | null => {
    const row = rowRef.current;
    if (!row) return null;
    const rr = row.getBoundingClientRect();
    const pad = 14; // a little forgiveness around the field
    if (x < rr.left - pad || x > rr.right + pad || y < rr.top - pad || y > rr.bottom + pad) return null;
    const boxes = Array.from(row.querySelectorAll<HTMLElement>("[data-boxwrap]"));
    if (!boxes.length) return 0;
    let best = 0;
    let bestD = Infinity;
    boxes.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const dx = x - (r.left + r.width / 2);
      const dy = y - (r.top + r.height / 2);
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        // right half of a box means "after it"
        best = dx > 0 ? i + 1 : i;
      }
    });
    return best;
  };
  const cancelLP = () => {
    lpStart.current = null;
    if (lpTimer.current) {
      clearTimeout(lpTimer.current);
      lpTimer.current = null;
    }
  };
  // a box is moved by dragging, and the finger/mouse can perfectly well come up
  // somewhere else entirely — so the release is watched on the window, not only
  // on the box the drag started from
  const endDragRef = useRef<() => void>(() => {});
  const beginDrag = (id: string) => {
    cancelLP();
    dragIdRef.current = id;
    orderRef.current = itemsRef.current.slice();
    setDragId(id);
    setOrder(itemsRef.current.slice());
    window.addEventListener("touchmove", preventScroll, { passive: false });
    window.addEventListener("pointerup", onWindowUp);
    window.addEventListener("pointercancel", onWindowUp);
  };
  const onWindowUp = () => endDragRef.current();
  const endDrag = () => {
    const next = orderRef.current;
    dragIdRef.current = null;
    orderRef.current = null;
    setDragId(null);
    setOrder(null);
    window.removeEventListener("touchmove", preventScroll);
    window.removeEventListener("pointerup", onWindowUp);
    window.removeEventListener("pointercancel", onWindowUp);
    if (next && next.some((it, i) => it.id !== itemsRef.current[i]?.id)) commit(next);
  };
  endDragRef.current = () => {
    if (dragIdRef.current) endDrag();
  };
  const onBoxPointerDown = (e: React.PointerEvent, id: string) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    activate();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    lpStart.current = { x: e.clientX, y: e.clientY, id };
    if (e.pointerType !== "mouse") {
      // touch: hold briefly, so a tap still selects and a swipe still scrolls
      lpTimer.current = setTimeout(() => beginDrag(id), 250);
    }
  };
  const onBoxPointerMove = (e: React.PointerEvent) => {
    const s = lpStart.current;
    if (!dragIdRef.current) {
      if (!s) return;
      const moved = Math.hypot(e.clientX - s.x, e.clientY - s.y);
      // mouse: any real movement starts the drag. touch: movement means the
      // user is scrolling, so give up on the hold
      if (e.pointerType === "mouse") {
        if (moved > 4) beginDrag(s.id);
      } else if (moved > 10) cancelLP();
      return;
    }
    const cur = orderRef.current;
    if (!cur) return;
    const from = cur.findIndex((i) => i.id === dragIdRef.current);
    const to = indexFromPoint(e.clientX, e.clientY);
    if (from < 0 || to < 0 || to === from) return;
    const next = cur.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    orderRef.current = next;
    setOrder(next);
  };
  const onBoxPointerUp = (e: React.PointerEvent, item: FormItem) => {
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      /* already released */
    }
    const wasDragging = dragIdRef.current != null;
    cancelLP();
    if (wasDragging) {
      endDrag();
      return;
    }
    // First tap selects the box. Tapping the selected preset box again counts
    // it up — C, Cx2, Cx3 … — so "play it twice" is two taps. Past the cap it
    // starts over at one, which is also how a count is taken back off.
    if (sel === item.id && item.preset) {
      const { base, times } = splitRepeat(item.text);
      const nextTimes = times >= MAX_REPEAT ? 1 : times + 1;
      const text = withRepeat(base, nextTimes);
      commit(itemsRef.current.map((i) => (i.id === item.id ? { ...i, text } : i)));
      onSelect?.(base);
      return;
    }
    const next = sel === item.id ? null : item.id;
    setSel(next);
    // color edits act on the preset itself, not on "Cx2"
    onSelect?.(next ? (item.preset ? splitRepeat(item.text).base : item.text) : "");
  };

  const removeItem = (id: string) => {
    const next = itemsRef.current.filter((i) => i.id !== id);
    setSel(null);
    onSelect?.("");
    commit(next);
  };
  const setText = (id: string, text: string) => {
    commit(itemsRef.current.map((i) => (i.id === id ? { ...i, text, preset: false } : i)), true);
  };

  const shown = order ?? items;
  const dark = variant === "dark";
  const textSize = size === "lg" ? "text-base" : "text-xs";

  return (
    <div
      ref={rowRef}
      onPointerDown={(e) => {
        // tapping the empty part of the field just activates it
        if (e.target === e.currentTarget) {
          activate();
          setSel(null);
          onSelect?.("");
        }
      }}
      onPointerMove={onBoxPointerMove}
      className={`flex min-h-[26px] w-full flex-wrap items-center ${
        size === "lg" ? "gap-x-2.5 gap-y-1.5" : "gap-x-2 gap-y-1"
      } ${className}`}
    >
      {shown.length === 0 && (
        <span
          onPointerDown={activate}
          className={`${textSize} ${dark ? "text-white/40" : "text-slate-400 dark:text-slate-600"}`}
        >
          {placeholder}
        </span>
      )}
      {dropAt === 0 && <DropMark />}
      {shown.map((item, idx) => {
        const color = itemColor(item);
        const box = color ? formBoxColors(color) : null;
        const selected = sel === item.id;
        const node = (
          <span
            key={item.id}
            data-boxwrap
            onPointerDown={(e) => onBoxPointerDown(e, item.id)}
            onPointerMove={onBoxPointerMove}
            onPointerUp={(e) => onBoxPointerUp(e, item)}
            onPointerCancel={(e) => onBoxPointerUp(e, item)}
            style={{
              touchAction: "pan-y",
              ...(box
                ? { background: box.bg, color: box.fg, border: `1px solid ${box.border}` }
                : dark
                ? { background: "rgba(255,255,255,.14)", color: "#fff", border: "1px solid rgba(255,255,255,.25)" }
                : { background: NEUTRAL_BOX.bg, color: NEUTRAL_BOX.fg, border: `1px solid ${NEUTRAL_BOX.border}` }),
            }}
            className={
              `inline-flex cursor-grab select-none items-center gap-1 rounded-md px-1.5 py-0.5 font-bold leading-6 active:cursor-grabbing ${textSize} ` +
              (dragId === item.id ? "opacity-70 shadow-lg ring-2 ring-indigo-400 " : "") +
              (selected ? "ring-2 ring-indigo-400" : "")
            }
          >
            {item.preset ? (
              item.text
            ) : (
              <AutoInput
                id={item.id}
                textSize={textSize}
                value={item.text}
                onChange={(v) => setText(item.id, v)}
                onFocus={() => {
                  activate();
                  setSel(item.id);
                  onSelect?.(item.text);
                }}
                onBlur={() => {
                  // an abandoned empty box removes itself
                  if (!item.text.trim()) removeItem(item.id);
                }}
              />
            )}
            {selected && (
              <button
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  removeItem(item.id);
                }}
                aria-label={`${item.text || "빈 박스"} 삭제`}
                className="-mr-0.5 opacity-60"
              >
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </span>
        );
        return dropAt === idx + 1 ? (
          <Fragment key={`${item.id}-w`}>
            {node}
            <DropMark />
          </Fragment>
        ) : (
          node
        );
      })}
    </div>
  );

}

/** Where a dragged chip would land. */
function DropMark() {
  return <span aria-hidden className="h-6 w-0.5 shrink-0 rounded-full bg-indigo-500" />;
}

/** An input that is exactly as wide as what it holds: a hidden copy of the text
 *  sets the width, and the real input is laid over it. (Leaving the input in
 *  flow doesn't work — a text input reserves a couple of characters' width on
 *  its own, so every typed box came out the same size whatever was in it.) */
function AutoInput({
  id,
  textSize,
  value,
  onChange,
  onFocus,
  onBlur,
}: {
  id: string;
  textSize: string;
  value: string;
  onChange: (v: string) => void;
  onFocus: () => void;
  onBlur: () => void;
}) {
  return (
    <span className="relative inline-block">
      <span
        aria-hidden
        className={`invisible whitespace-pre px-0.5 font-bold leading-6 ${textSize}`}
      >
        {value || "글자"}
      </span>
      <input
        data-box={id}
        size={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        onPointerDown={(e) => e.stopPropagation()}
        placeholder="글자"
        // the same line box as a preset, so every box in a row is one height
        className={`absolute inset-0 w-full min-w-0 bg-transparent p-0 px-0.5 font-bold leading-6 outline-none placeholder:font-normal placeholder:opacity-60 ${textSize}`}
      />
    </span>
  );
}
