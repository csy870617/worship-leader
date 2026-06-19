import { useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { data, sortKo } from "../data";
import { useSongs } from "../lib/catalog";
import { TEMPO_LABEL, type Song } from "../types";
import { useHistory } from "../lib/useHistory";
import { setLastBrowse } from "../lib/browseState";
import ChipRow from "../components/ChipRow";
import SongList from "../components/SongList";

type Axis = "key" | "theme" | "tempo";
const AXES: { value: Axis; label: string }[] = [
  { value: "key", label: "코드" },
  { value: "theme", label: "주제" },
  { value: "tempo", label: "템포" },
];

// which URL param holds each axis's selected value
const PARAM: Record<Axis, string> = { key: "key", theme: "theme", tempo: "tempo" };

export default function Browse() {
  const [params, setParams] = useSearchParams();
  const axis = (params.get("axis") as Axis) || "key";
  const sort = params.get("sort") || "title";
  const list = (name: string) => (params.get(name) ?? "").split(",").filter(Boolean);
  const selKeys = list("key");
  const selThemes = list("theme");
  const selTempos = list("tempo");
  const { history } = useHistory();
  const { songs, hiddenCount } = useSongs();

  // remember the current filters so returning to 둘러보기 restores them
  useEffect(() => {
    const qs = params.toString();
    setLastBrowse(qs ? `/browse?${qs}` : "/browse");
  }, [params]);

  const options = useMemo(() => {
    if (axis === "key") return data.keys.map((k) => ({ value: k, label: k }));
    if (axis === "theme") return data.themes.map((t) => ({ value: t, label: t }));
    return data.tempos.map((t) => ({ value: t, label: TEMPO_LABEL[t] }));
  }, [axis]);

  // OR within each axis, AND across axes
  const filtered = useMemo(() => {
    let arr: Song[] = songs;
    if (selKeys.length) arr = arr.filter((s) => s.keys.some((k) => selKeys.includes(k)));
    if (selTempos.length) arr = arr.filter((s) => s.tempos.some((t) => selTempos.includes(t)));
    if (selThemes.length) arr = arr.filter((s) => s.themes.some((t) => selThemes.includes(t)));
    arr = [...arr];
    if (sort === "recent") {
      arr.sort((a, b) => {
        const da = history[a.id] ?? "";
        const db = history[b.id] ?? "";
        if (da === db) return sortKo(a, b);
        return db.localeCompare(da);
      });
    } else {
      arr.sort(sortKo);
    }
    return arr;
  }, [songs, params, sort, history]);

  const patch = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v == null) p.delete(k);
      else p.set(k, v);
    }
    setParams(p, { replace: true });
  };

  // toggle one value inside an axis (multi-select)
  const toggleVal = (name: string, value: string) => {
    const cur = list(name);
    const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
    patch({ [name]: next.length ? next.join(",") : null });
  };

  // active-filter summary pills (one per selected value)
  const pills: { axis: Axis; value: string; label: string }[] = [];
  selKeys.forEach((v) => pills.push({ axis: "key", value: v, label: v }));
  selTempos.forEach((v) =>
    pills.push({ axis: "tempo", value: v, label: TEMPO_LABEL[v as keyof typeof TEMPO_LABEL] ?? v })
  );
  selThemes.forEach((v) => pills.push({ axis: "theme", value: v, label: v }));

  const activeValues = axis === "key" ? selKeys : axis === "theme" ? selThemes : selTempos;

  return (
    <div>
      <div className="sticky top-14 md:top-0 z-10 space-y-2 border-b border-slate-100 bg-white/95 px-4 pt-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="flex items-center justify-between gap-2">
          {/* axis selector (which chip row to show) */}
          <div className="flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
            {AXES.map((a) => (
              <button
                key={a.value}
                onClick={() => patch({ axis: a.value })}
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
          {/* sort */}
          <select
            value={sort}
            onChange={(e) => patch({ sort: e.target.value })}
            aria-label="정렬"
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            <option value="title">가나다순</option>
            <option value="recent">최근 사용순</option>
          </select>
        </div>

        <ChipRow
          options={options}
          active={activeValues}
          onToggle={(v) => toggleVal(PARAM[axis], v)}
          onClear={() => patch({ [PARAM[axis]]: null })}
        />

        {/* combined filter summary (one removable pill per selected value) */}
        {pills.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pb-2">
            {pills.map((f) => (
              <button
                key={`${f.axis}:${f.value}`}
                onClick={() => toggleVal(PARAM[f.axis], f.value)}
                className="inline-flex items-center gap-1 rounded-full bg-indigo-600 py-0.5 pl-2.5 pr-1.5 text-xs font-semibold text-white"
              >
                {f.label}
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            ))}
            {pills.length > 1 && (
              <button
                onClick={() => patch({ key: null, theme: null, tempo: null })}
                className="text-xs font-medium text-slate-400 underline dark:text-slate-500"
              >
                전체 해제
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-4 py-2 text-xs text-slate-400 dark:text-slate-500">
        <span>
          {pills.length ? pills.map((f) => f.label).join(" · ") : "전체"} · {filtered.length}곡
        </span>
        {hiddenCount > 0 && (
          <Link to="/hidden" className="font-medium text-indigo-500 dark:text-indigo-400">
            숨긴 곡 {hiddenCount} 관리
          </Link>
        )}
      </div>
      <SongList songs={filtered} />
    </div>
  );
}
