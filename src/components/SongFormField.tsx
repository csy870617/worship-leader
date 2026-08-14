import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { songFormSegments, subscribePresetColors } from "../lib/songForm";

/**
 * Song-form input that shows preset tokens (V1, C, …) in color.
 *
 * A <textarea> can't color parts of its own text, so we use the standard
 * highlight-overlay trick: the textarea keeps the caret, selection, IME and
 * native editing behavior but renders its text transparent, and a mirror <div>
 * underneath — same font, padding and wrapping — paints the colored text. The
 * field auto-grows, so there is no scroll offset to keep in sync.
 */
export default function SongFormField({
  value,
  onChange,
  onFocus,
  onBlur,
  placeholder = "송폼 입력",
  className,
  textClassName = "",
}: {
  value: string;
  onChange: (v: string) => void;
  onFocus?: (el: HTMLTextAreaElement) => void;
  onBlur?: () => void;
  placeholder?: string;
  /** layout/appearance classes shared by the textarea and its mirror */
  className: string;
  /** extra classes for the visible text (color, size) */
  textClassName?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const [, force] = useState(0);
  // repaint when the user recolors a preset
  useEffect(() => subscribePresetColors(() => force((n) => n + 1)), []);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, mirrorRef.current?.scrollHeight ?? 0)}px`;
  };
  useLayoutEffect(resize, [value]);

  const segs = songFormSegments(value);
  return (
    <div className="relative w-full">
      {/* colored mirror — same box metrics as the textarea */}
      <div
        ref={mirrorRef}
        aria-hidden
        className={`${className} ${textClassName} pointer-events-none absolute inset-0 whitespace-pre-wrap break-words`}
      >
        {segs.map((s, i) =>
          s.color ? (
            <span key={i} style={{ color: s.color }}>
              {s.text}
            </span>
          ) : (
            <span key={i}>{s.text}</span>
          )
        )}
        {/* a trailing newline needs a placeholder char or the box collapses */}
        {value.endsWith("\n") ? " " : ""}
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onInput={resize}
        onFocus={(e) => onFocus?.(e.currentTarget)}
        onBlur={onBlur}
        rows={1}
        placeholder={placeholder}
        // text is transparent so only the mirror shows; caret stays visible
        className={`${className} ${textClassName} relative resize-none overflow-hidden bg-transparent text-transparent caret-slate-700 dark:caret-slate-200`}
      />
    </div>
  );
}
