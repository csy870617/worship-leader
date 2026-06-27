import { useMemo, useState } from "react";
import { data, normalize, sortKo } from "../data";
import { TEMPO_LABEL, type Song } from "../types";
import { useHistory } from "../lib/useHistory";
import ChipRow from "./ChipRow";
import SongList from "./SongList";

type Axis = "cat" | "tempo" | "key" | "theme";
const AXES: { value: Axis; label: string }[] = [
  { value: "cat", label: "분류" },
  { value: "tempo", label: "템포" },
  { value: "key", label: "코드" },
  { value: "theme", label: "주제" },
];

// 분류(category) options — 찬송가 / CCM (전체 칩이 있어 단일 선택)
const CAT_OPTIONS = [
  { value: "hymn", label: "찬송가" },
  { value: "ccm", label: "CCM" },
];
const CAT_LABEL: Record<string, string> = { hymn: "찬송가", ccm: "CCM" };
// 템포만 다중 선택, 나머지(분류·코드·주제)는 단일 선택
const MULTI_AXES = new Set<Axis>(["tempo"]);

// Code filter groups Eb+E under "E" and Bb+B under "B"; other keys stand alone.
const KEY_GROUPS = ["C", "D", "E", "F", "G", "A", "B"];
const KEY_MEMBERS: Record<string, string[]> = { E: ["Eb", "E"], B: ["Bb", "B"] };
const keyMembers = (group: string) => KEY_MEMBERS[group] ?? [group];

// rank a song by its lowest key using the chip order (C, D, Eb, …)
const KEY_ORDER = new Map(data.keys.map((k, i) => [k, i]));
const keyRank = (s: Song) =>
  s.keys.length ? Math.min(...s.keys.map((k) => KEY_ORDER.get(k) ?? 99)) : 99;

/**
 * A song list with the same 분류/템포/코드/주제 filtering + search + sorting as
 * 둘러보기, but driven by local state (independent per screen).
 */
export default function FilteredSongList({
  songs,
  countLabel,
}: {
  songs: Song[];
  countLabel: string;
}) {
  const { history } = useHistory();
  const [axis, setAxis] = useState<Axis>("cat");
  const [sort, setSort] = useState<"key" | "title" | "recent">("title");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Record<Axis, string[]>>({ cat: [], tempo: [], key: [], theme: [] });

  const options = useMemo(() => {
    if (axis === "cat") return CAT_OPTIONS;
    if (axis === "key") return KEY_GROUPS.map((k) => ({ value: k, label: k }));
    if (axis === "theme") return data.themes.map((t) => ({ value: t, label: t }));
    return data.tempos.map((t) => ({ value: t, label: TEMPO_LABEL[t] }));
  }, [axis]);

  const filtered = useMemo(() => {
    let arr = songs;
    // 분류 필터: 찬송가/CCM 중 하나만 고르면 그쪽만, 미선택이면 전체
    const wantHymn = sel.cat.includes("hymn");
    const wantCcm = sel.cat.includes("ccm");
    if (wantHymn !== wantCcm) arr = arr.filter((s) => (wantHymn ? s.isHymn : !s.isHymn));
    const nq = normalize(q);
    if (nq) {
      arr = arr.filter(
        (s) =>
          normalize(s.title).includes(nq) ||
          s.themes.some((t) => normalize(t).includes(nq)) ||
          String(s.hymnNo ?? "").includes(nq)
      );
    }
    if (sel.key.length) {
      const wanted = new Set(sel.key.flatMap(keyMembers));
      arr = arr.filter((s) => s.keys.some((k) => wanted.has(k)));
    }
    if (sel.tempo.length) arr = arr.filter((s) => s.tempos.some((t) => sel.tempo.includes(t)));
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
  }, [songs, sel, q, sort, history]);

  // toggle a value inside an axis — 템포만 다중 선택, 나머지는 단일 선택
  const toggleVal = (a: Axis, value: string) =>
    setSel((s) => {
      const cur = s[a];
      const next = MULTI_AXES.has(a)
        ? cur.includes(value)
          ? cur.filter((v) => v !== value)
          : [...cur, value]
        : cur.includes(value)
        ? []
        : [value];
      return { ...s, [a]: next };
    });
  const clearAxis = (a: Axis) => setSel((s) => ({ ...s, [a]: [] }));
  const clearAll = () => setSel({ cat: [], tempo: [], key: [], theme: [] });

  // active-filter summary pills (one per selected value)
  const pills: { axis: Axis; value: string; label: string }[] = [];
  sel.cat.forEach((v) => pills.push({ axis: "cat", value: v, label: CAT_LABEL[v] ?? v }));
  sel.key.forEach((v) => pills.push({ axis: "key", value: v, label: v }));
  sel.tempo.forEach((v) =>
    pills.push({ axis: "tempo", value: v, label: TEMPO_LABEL[v as keyof typeof TEMPO_LABEL] ?? v })
  );
  sel.theme.forEach((v) => pills.push({ axis: "theme", value: v, label: v }));

  return (
    <div>
      <div className="sticky top-14 md:top-0 z-10 space-y-2 border-b border-slate-100 bg-white/95 px-4 pt-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="flex items-center gap-2">
          {/* axis selector (which chip row to show) */}
          <div className="flex shrink-0 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
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
          {/* quick title search */}
          <div className="relative min-w-0 flex-1">
            <svg className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 3.4 9.82l3.64 3.64a.75.75 0 1 0 1.06-1.06l-3.64-3.64A5.5 5.5 0 0 0 9 3.5ZM5 9a4 4 0 1 1 8 0 4 4 0 0 1-8 0Z" clipRule="evenodd" />
            </svg>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              inputMode="search"
              placeholder="찬양 검색"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1 pl-8 pr-7 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            {q && (
              <button onClick={() => setQ("")} aria-label="지우기" className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 active:bg-slate-100 dark:active:bg-slate-700">
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg>
              </button>
            )}
          </div>
          {/* sort */}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            aria-label="정렬"
            className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
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
        {[countLabel, q.trim() && `"${q.trim()}"`, ...pills.map((f) => f.label)].filter(Boolean).join(" · ")} ·{" "}
        {filtered.length}곡
      </div>
      <SongList songs={filtered} />
    </div>
  );
}
