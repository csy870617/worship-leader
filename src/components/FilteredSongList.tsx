import { useMemo, useState } from "react";
import { data, sortKo } from "../data";
import { type Song } from "../types";
import { useHistory } from "../lib/useHistory";
import ChipRow from "./ChipRow";
import SongList from "./SongList";

type Axis = "key" | "theme";
const AXES: { value: Axis; label: string }[] = [
  { value: "key", label: "코드" },
  { value: "theme", label: "주제" },
];

// Code filter groups Eb+E under "E" and Bb+B under "B"; other keys stand alone.
const KEY_GROUPS = ["C", "D", "E", "F", "G", "A", "B"];
const KEY_MEMBERS: Record<string, string[]> = { E: ["Eb", "E"], B: ["Bb", "B"] };
const keyMembers = (group: string) => KEY_MEMBERS[group] ?? [group];

// rank a song by its lowest key using the chip order (C, D, Eb, …)
const KEY_ORDER = new Map(data.keys.map((k, i) => [k, i]));
const keyRank = (s: Song) =>
  s.keys.length ? Math.min(...s.keys.map((k) => KEY_ORDER.get(k) ?? 99)) : 99;

/**
 * A song list with the same code/theme filtering + sorting as 찬양목록,
 * but driven by local state (independent per screen).
 */
export default function FilteredSongList({
  songs,
  countLabel,
}: {
  songs: Song[];
  countLabel: string;
}) {
  const { history } = useHistory();
  const [axis, setAxis] = useState<Axis>("key");
  const [sort, setSort] = useState<"key" | "title" | "recent">("title");
  const [sel, setSel] = useState<Record<Axis, string[]>>({ key: [], theme: [] });

  const options = useMemo(() => {
    if (axis === "key") return KEY_GROUPS.map((k) => ({ value: k, label: k }));
    return data.themes.map((t) => ({ value: t, label: t }));
  }, [axis]);

  const filtered = useMemo(() => {
    let arr = songs;
    if (sel.key.length) {
      const wanted = new Set(sel.key.flatMap(keyMembers));
      arr = arr.filter((s) => s.keys.some((k) => wanted.has(k)));
    }
    if (sel.theme.length) arr = arr.filter((s) => s.themes.some((t) => sel.theme.includes(t)));
    arr = [...arr];
    if (sort === "recent") {
      arr.sort((a, b) => {
        const da = history[a.id] ?? "";
        const db = history[b.id] ?? "";
        if (da === db) return sortKo(a, b);
        return db.localeCompare(da);
      });
    } else if (sort === "key") {
      arr.sort((a, b) => keyRank(a) - keyRank(b) || sortKo(a, b));
    } else {
      arr.sort(sortKo);
    }
    return arr;
  }, [songs, sel, sort, history]);

  // single-select per axis (pick one, or clear if re-tapped)
  const toggleVal = (a: Axis, value: string) =>
    setSel((s) => ({ ...s, [a]: s[a].includes(value) ? [] : [value] }));
  const clearAxis = (a: Axis) => setSel((s) => ({ ...s, [a]: [] }));
  const clearAll = () => setSel({ key: [], theme: [] });

  const pills: { axis: Axis; value: string; label: string }[] = [];
  sel.key.forEach((v) => pills.push({ axis: "key", value: v, label: v }));
  sel.theme.forEach((v) => pills.push({ axis: "theme", value: v, label: v }));

  return (
    <div>
      <div className="sticky top-14 md:top-0 z-10 space-y-2 border-b border-slate-100 bg-white/95 px-4 pt-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="flex items-center justify-between gap-2">
          <div className="flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
            {AXES.map((a) => (
              <button
                key={a.value}
                onClick={() => setAxis(a.value)}
                className={`rounded-md px-3 py-1 text-sm font-semibold transition ${
                  axis === a.value
                    ? "bg-white text-indigo-600 shadow-sm dark:bg-slate-700 dark:text-indigo-300"
                    : "text-slate-500 dark:text-slate-400"
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            aria-label="정렬"
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            <option value="key">코드순</option>
            <option value="title">가나다순</option>
            <option value="recent">최근 사용순</option>
          </select>
        </div>

        <ChipRow
          options={options}
          active={sel[axis]}
          onToggle={(v) => toggleVal(axis, v)}
          onClear={() => clearAxis(axis)}
        />

        {pills.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pb-2">
            {pills.map((f) => (
              <button
                key={`${f.axis}:${f.value}`}
                onClick={() => toggleVal(f.axis, f.value)}
                className="inline-flex items-center gap-1 rounded-full bg-indigo-600 py-0.5 pl-2.5 pr-1.5 text-xs font-semibold text-white"
              >
                {f.label}
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            ))}
            {pills.length > 1 && (
              <button onClick={clearAll} className="text-xs font-medium text-slate-400 underline dark:text-slate-500">
                전체 해제
              </button>
            )}
          </div>
        )}
      </div>

      <div className="px-4 py-2 text-xs text-slate-400 dark:text-slate-500">
        {countLabel}
        {pills.length ? ` · ${pills.map((f) => f.label).join(" · ")}` : ""} · {filtered.length}곡
      </div>
      <SongList songs={filtered} />
    </div>
  );
}
