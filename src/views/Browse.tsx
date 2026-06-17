import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { data, sortKo } from "../data";
import { byKey, byTheme, byTempo, useSongs } from "../lib/catalog";
import { TEMPO_LABEL, type Song } from "../types";
import { useHistory } from "../lib/useHistory";
import ChipRow from "../components/ChipRow";
import SongList from "../components/SongList";

type Axis = "key" | "theme" | "tempo";
const AXES: { value: Axis; label: string }[] = [
  { value: "key", label: "코드" },
  { value: "theme", label: "주제" },
  { value: "tempo", label: "템포" },
];

function axisOptions(axis: Axis) {
  if (axis === "key") return data.keys.map((k) => ({ value: k, label: k }));
  if (axis === "theme") return data.themes.map((t) => ({ value: t, label: t }));
  return data.tempos.map((t) => ({ value: t, label: TEMPO_LABEL[t] }));
}
function axisFilter(axis: Axis): (v: string) => Song[] {
  return axis === "key" ? byKey : axis === "theme" ? byTheme : byTempo;
}

export default function Browse() {
  const [params, setParams] = useSearchParams();
  const axis = (params.get("axis") as Axis) || "key";
  const value = params.get("v");
  const sort = params.get("sort") || "title";
  const { history } = useHistory();
  const { songs, hiddenCount } = useSongs();

  const options = useMemo(() => axisOptions(axis), [axis]);
  const filter = useMemo(() => axisFilter(axis), [axis]);

  const list = useMemo(() => {
    const src = value ? filter(value) : songs;
    const arr = [...src];
    if (sort === "recent") {
      arr.sort((a, b) => {
        const da = history[a.id] ?? "";
        const db = history[b.id] ?? "";
        if (da === db) return sortKo(a, b);
        return db.localeCompare(da); // most recent first; never-used (\"\") last
      });
    } else {
      arr.sort(sortKo);
    }
    return arr;
  }, [value, sort, history, songs, filter]);

  const patch = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v == null) p.delete(k);
      else p.set(k, v);
    }
    setParams(p, { replace: true });
  };

  return (
    <div>
      <div className="sticky top-14 z-10 space-y-2 border-b border-slate-100 bg-white/95 px-4 pt-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="flex items-center justify-between gap-2">
          {/* axis segmented control */}
          <div className="flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
            {AXES.map((a) => (
              <button
                key={a.value}
                onClick={() => patch({ axis: a.value, v: null })}
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
          active={value}
          onSelect={(v) => patch({ v })}
        />
      </div>
      <div className="px-4 py-2 text-xs text-slate-400 dark:text-slate-500">
        {value ?? "전체"} · {list.length}곡
      </div>
      <SongList songs={list} />

      {hiddenCount > 0 && (
        <div className="px-4 py-5 text-center">
          <Link to="/hidden" className="text-sm font-medium text-slate-400 underline dark:text-slate-500">
            숨긴 곡 {hiddenCount}곡 관리
          </Link>
        </div>
      )}
    </div>
  );
}
