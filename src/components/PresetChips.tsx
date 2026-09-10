import { useEffect, useRef, useState } from "react";
import {
  PRESET_COLOR_CHOICES,
  PRESET_ROWS,
  formBoxColors,
  presetColor,
  resetPresetColors,
  setPresetColor,
  subscribePresetColors,
} from "../lib/songForm";
import { formDragCancel, formDragDrop, formDragOver } from "./SongFormBoxes";

/**
 * Quick-insert chips for the song form. Each chip is drawn in the color that
 * preset will have in the text, and a 색 편집 toggle lets the user recolor any
 * of them (tap chip → pick a color).
 *
 * The bar is mounted only while a 송폼 field is being edited, so the edit-mode
 * state lives at module level: a blur that briefly unmounts the bar must not
 * throw the user out of 색 편집 mid-recolor.
 */
let keptEditMode = false;
let keptEditing: string | null = null;

export default function PresetChips({
  onInsert,
  onInsertText,
  selection = "",
  className = "",
  variant = "light",
}: {
  onInsert: (preset: string) => void;
  /** add an empty box the user types into (for anything the presets miss) */
  onInsertText?: () => void;
  /** text currently selected in the song form — colorable like a preset */
  selection?: string;
  className?: string;
  /** "light" = on a white card (conti list), "dark" = on the dark sheet toolbar */
  variant?: "light" | "dark";
}) {
  const [, force] = useState(0);
  const [editing, setEditingState] = useState<string | null>(keptEditing);
  const [editMode, setEditModeState] = useState(keptEditMode);
  const setEditing = (v: string | null) => {
    keptEditing = v;
    setEditingState(v);
  };
  const setEditMode = (v: boolean) => {
    keptEditMode = v;
    setEditModeState(v);
  };
  useEffect(() => subscribePresetColors(() => force((n) => n + 1)), []);

  // ---- drag a chip into the form, so a box can be dropped between two others
  // (a plain tap still just appends it) ----
  const [drag, setDrag] = useState<{ text: string; preset: boolean; x: number; y: number } | null>(null);
  const dragRef = useRef<typeof drag>(null);
  dragRef.current = drag;
  const startRef = useRef<{ x: number; y: number; text: string; preset: boolean } | null>(null);
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopHold = () => {
    if (holdRef.current) {
      clearTimeout(holdRef.current);
      holdRef.current = null;
    }
  };
  const noScroll = (e: TouchEvent) => e.preventDefault();
  const beginDrag = (x: number, y: number, text: string, preset: boolean) => {
    stopHold();
    setDrag({ text, preset, x, y });
    dragRef.current = { text, preset, x, y };
    window.addEventListener("touchmove", noScroll, { passive: false });
    formDragOver(x, y);
  };
  const endDrag = () => {
    stopHold();
    startRef.current = null;
    window.removeEventListener("touchmove", noScroll);
    setDrag(null);
    dragRef.current = null;
  };
  useEffect(() => () => {
    stopHold();
    window.removeEventListener("touchmove", noScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chipPointerDown = (e: React.PointerEvent, text: string, preset: boolean) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // keep the field's selection/focus: the tap must not blur it
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    startRef.current = { x: e.clientX, y: e.clientY, text, preset };
    if (e.pointerType !== "mouse") {
      holdRef.current = setTimeout(() => beginDrag(e.clientX, e.clientY, text, preset), 250);
    }
  };
  const chipPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (d) {
      const next = { ...d, x: e.clientX, y: e.clientY };
      dragRef.current = next;
      setDrag(next);
      formDragOver(e.clientX, e.clientY);
      return;
    }
    const s0 = startRef.current;
    if (!s0) return;
    const moved = Math.hypot(e.clientX - s0.x, e.clientY - s0.y);
    if (e.pointerType === "mouse") {
      if (moved > 4) beginDrag(e.clientX, e.clientY, s0.text, s0.preset);
    } else if (moved > 10) {
      stopHold(); // a scroll, not a hold
      startRef.current = null;
    }
  };
  /** @returns true when the release was a drag (so it must not count as a tap) */
  const chipPointerUp = (e: React.PointerEvent) => {
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      /* already released */
    }
    const d = dragRef.current;
    if (!d) {
      stopHold();
      startRef.current = null;
      return false;
    }
    if (!formDragDrop(d.text, d.preset, e.clientX, e.clientY)) formDragCancel();
    endDrag();
    return true;
  };

  // a selection in the field is an explicit choice, so it wins over the chip
  // that 색 편집 mode has open (single-line: a form never colors across lines)
  // trimmed but otherwise verbatim: the color is stored under the exact text,
  // so normalizing the spacing here would stop it from matching the form
  const trimmed = selection.trim();
  const sel = trimmed.includes("\n") || trimmed.length > 40 ? "" : trimmed;
  const target = sel || editing;
  const targetLabel = sel ? `「${sel.length > 12 ? sel.slice(0, 12) + "…" : sel}」` : editing;

  const base =
    variant === "dark"
      ? "bg-white/15 text-white active:bg-white/30"
      : "bg-slate-100 text-slate-600 active:bg-slate-200 dark:bg-slate-800 dark:text-slate-300";

  return (
    <div className={className}>
      <div className="space-y-1.5">
        {PRESET_ROWS.map((row, ri) => (
          <div key={ri} className="flex flex-wrap items-center justify-center gap-1.5">
            {row.map((p) => {
              const c = presetColor(p);
              const box = c ? formBoxColors(c) : null;
              return (
                <button
                  key={p}
                  // pointerDown + preventDefault keeps the field focused so the
                  // preset lands at the caret; in edit mode we open the palette
                  onPointerDown={(e) => {
                    if (editMode) {
                      e.preventDefault();
                      setEditing(editing === p ? null : p);
                      return;
                    }
                    chipPointerDown(e, p, true);
                  }}
                  onPointerMove={chipPointerMove}
                  onPointerUp={(e) => {
                    if (editMode) return;
                    // a drag already put the box where it was dropped
                    if (!chipPointerUp(e)) onInsert(p);
                  }}
                  onPointerCancel={(e) => {
                    if (!editMode) chipPointerUp(e);
                  }}
                  className={`rounded-md px-2.5 py-1 text-xs font-bold ${base} ${
                    editing === p
                      ? "ring-2 ring-indigo-400"
                      : editMode
                      ? "ring-1 ring-indigo-300"
                      : ""
                  }`}
                  style={{
                    touchAction: "pan-y",
                    ...(box ? { background: box.bg, color: box.fg, border: `1px solid ${box.border}` } : {}),
                  }}
                >
                  {p}
                </button>
              );
            })}
          </div>
        ))}
        {onInsertText && (
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <button
              onPointerDown={(e) => chipPointerDown(e, "", false)}
              onPointerMove={chipPointerMove}
              onPointerUp={(e) => {
                if (!chipPointerUp(e)) onInsertText();
              }}
              onPointerCancel={chipPointerUp}
              style={{ touchAction: "pan-y" }}
              className={`rounded-md border border-dashed px-2.5 py-1 text-xs font-bold ${
                variant === "dark"
                  ? "border-white/40 text-white/80"
                  : "border-slate-300 text-slate-500 dark:border-slate-600 dark:text-slate-400"
              }`}
            >
              ＋ 빈 박스
            </button>
          </div>
        )}
      </div>

      {/* Color palette. It colors whatever is selected in the song form — any
          hand-typed word, not just a preset — and falls back to the chip picked
          in 색 편집 mode. In edit mode with neither, it says which step is
          missing instead of staying invisible. */}
      {(target || editMode) && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
          <span className={`text-[11px] font-semibold ${variant === "dark" ? "text-white/70" : "text-slate-400"}`}>
            {target ? `${targetLabel} 색` : "색을 바꿀 프리셋을 누르거나 글자를 선택하세요"}
          </span>
          {target &&
            PRESET_COLOR_CHOICES.map((c) => (
              <button
                key={c || "none"}
                onPointerDown={(e) => {
                  e.preventDefault();
                  setPresetColor(target, c);
                }}
                aria-label={c || "색 없음"}
                className={
                  "h-6 w-6 rounded-full border text-[9px] font-bold " +
                  (presetColor(target) === c
                    ? "border-indigo-500 ring-2 ring-indigo-400"
                    : variant === "dark"
                    ? "border-white/40"
                    : "border-slate-300")
                }
                style={c ? { background: c } : undefined}
              >
                {c ? "" : "×"}
              </button>
            ))}
        </div>
      )}

      {drag && (
        <span
          aria-hidden
          style={{
            position: "fixed",
            left: drag.x,
            top: drag.y,
            transform: "translate(-50%, -140%)",
            pointerEvents: "none",
            zIndex: 70,
            ...(drag.preset && presetColor(drag.text)
              ? (() => {
                  const c = formBoxColors(presetColor(drag.text));
                  return { background: c.bg, color: c.fg, border: `1px solid ${c.border}` };
                })()
              : { background: "#f1f5f9", color: "#475569", border: "1px dashed #94a3b8" }),
          }}
          className="rounded-md px-1.5 py-0.5 text-xs font-bold leading-6 shadow-lg"
        >
          {drag.text || "글자"}
        </span>
      )}

      <div className="mt-1.5 flex items-center justify-center gap-3">
        <button
          onPointerDown={(e) => {
            e.preventDefault();
            setEditMode(!editMode);
            setEditing(null);
          }}
          className={`text-[11px] font-semibold ${
            editMode ? "text-indigo-500" : variant === "dark" ? "text-white/60" : "text-slate-400"
          }`}
        >
          {editMode ? "완료" : "색 편집"}
        </button>
        {editMode && (
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              resetPresetColors();
              setEditing(null);
            }}
            className={`text-[11px] font-semibold ${variant === "dark" ? "text-white/60" : "text-slate-400"}`}
          >
            기본색으로
          </button>
        )}
      </div>
    </div>
  );
}
