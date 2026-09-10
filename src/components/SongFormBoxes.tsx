import { useEffect, useMemo, useRef, useState } from "react";
import {
  type FormItem,
  formBoxColors,
  itemColor,
  parseForm,
  serializeForm,
  subscribePresetColors,
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
type Ctl = { insert: (text: string, preset: boolean) => void };
let activeCtl: Ctl | null = null;
/** Drop a new box into the song form the user is editing. */
export function insertFormBox(text: string, preset = true) {
  activeCtl?.insert(text, preset);
  return activeCtl != null;
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

  const commit = (next: FormItem[]) => onChange(serializeForm(next));
  const activate = () => {
    const ctl: Ctl = {
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
    myCtl.current = ctl;
    activeCtl = ctl;
    // the bar belongs to whichever field was last touched; a tap anywhere else
    // lets the parent put it away (the bar itself cancels that on its own)
    if (!outsideRef.current) {
      const onOutside = (e: PointerEvent) => {
        if (rowRef.current?.contains(e.target as Node)) return;
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
    // a plain tap selects the box (and a text box also takes the caret)
    const next = sel === item.id ? null : item.id;
    setSel(next);
    onSelect?.(next ? item.text : "");
  };

  const removeItem = (id: string) => {
    const next = itemsRef.current.filter((i) => i.id !== id);
    setSel(null);
    onSelect?.("");
    commit(next);
  };
  const setText = (id: string, text: string) => {
    commit(itemsRef.current.map((i) => (i.id === id ? { ...i, text, preset: false } : i)));
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
      {shown.map((item) => {
        const color = itemColor(item);
        const box = color ? formBoxColors(color) : null;
        const selected = sel === item.id;
        return (
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
                : { background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0" }),
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
      })}
    </div>
  );
}

/** An input that is exactly as wide as what it holds. */
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
    <span className="relative inline-grid">
      {/* the sizer and the input share a grid cell, so the cell is as wide as
          the text and the input stretches to it */}
      <span
        aria-hidden
        className={`invisible col-start-1 row-start-1 whitespace-pre px-0.5 font-bold ${textSize}`}
      >
        {value || "글자"}
      </span>
      <input
        data-box={id}
        // an <input> asks for ~20 characters of width by default, which would
        // decide the grid column instead of the sizer next to it
        size={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        onPointerDown={(e) => e.stopPropagation()}
        placeholder="글자"
        className={`col-start-1 row-start-1 w-full bg-transparent px-0.5 font-bold outline-none placeholder:font-normal placeholder:opacity-60 ${textSize}`}
      />
    </span>
  );
}
