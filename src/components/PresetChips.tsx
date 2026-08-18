import { useEffect, useState } from "react";
import {
  PRESET_COLOR_CHOICES,
  PRESET_ROWS,
  presetColor,
  resetPresetColors,
  setPresetColor,
  subscribePresetColors,
} from "../lib/songForm";

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
  selection = "",
  className = "",
  variant = "light",
}: {
  onInsert: (preset: string) => void;
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
              return (
                <button
                  key={p}
                  // pointerDown + preventDefault keeps the field focused so the
                  // preset lands at the caret; in edit mode we open the palette
                  onPointerDown={(e) => {
                    e.preventDefault();
                    if (editMode) setEditing(editing === p ? null : p);
                    else onInsert(p);
                  }}
                  className={`rounded-md px-2.5 py-1 text-xs font-bold ${base} ${
                    editing === p
                      ? "ring-2 ring-indigo-400"
                      : editMode
                      ? "ring-1 ring-indigo-300"
                      : ""
                  }`}
                  style={c ? { color: c } : undefined}
                >
                  {p}
                </button>
              );
            })}
          </div>
        ))}
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
