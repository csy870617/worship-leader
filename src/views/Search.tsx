import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { data, normalize, sortKo } from "../data";
import { useSongs } from "../lib/catalog";
import { TEMPO_LABEL, type Song } from "../types";
import SongList from "../components/SongList";

export default function Search() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const key = params.get("key") ?? "";
  const tempo = params.get("tempo") ?? "";
  const theme = params.get("theme") ?? "";

  const patch = (next: Record<string, string>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    setParams(p, { replace: true });
  };

  const active = q.trim() || key || tempo || theme;
  const { songs } = useSongs();

  const results = useMemo(() => {
    if (!active) return [];
    const nq = normalize(q);
    return songs
      .filter((s: Song) => {
        if (key && !s.keys.includes(key)) return false;
        if (tempo && !s.tempos.includes(tempo as Song["tempos"][number])) return false;
        if (theme && !s.themes.includes(theme)) return false;
        if (nq) {
          const hit =
            normalize(s.title).includes(nq) ||
            s.themes.some((t) => normalize(t).includes(nq)) ||
            s.keys.some((k) => k.toLowerCase() === nq) ||
            String(s.hymnNo ?? "").includes(nq);
          if (!hit) return false;
        }
        return true;
      })
      .sort(sortKo);
  }, [q, key, tempo, theme, active, songs]);

  const selectCls =
    "rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300";

  return (
    <div>
      <div className="sticky top-14 z-10 space-y-2 border-b border-slate-100 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="relative">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 3.4 9.82l3.64 3.64a.75.75 0 1 0 1.06-1.06l-3.64-3.64A5.5 5.5 0 0 0 9 3.5ZM5 9a4 4 0 1 1 8 0 4 4 0 0 1-8 0Z" clipRule="evenodd" />
          </svg>
          <input
            autoFocus
            value={q}
            onChange={(e) => patch({ q: e.target.value })}
            inputMode="search"
            placeholder="곡 제목 · 주제 · 코드 검색"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-10 text-base text-slate-900 outline-none focus:border-indigo-400 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:bg-slate-800"
          />
          {q && (
            <button onClick={() => patch({ q: "" })} aria-label="지우기" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 active:bg-slate-100 dark:active:bg-slate-700">
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg>
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <select value={key} onChange={(e) => patch({ key: e.target.value })} aria-label="코드" className={selectCls}>
            <option value="">코드 전체</option>
            {data.keys.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <select value={tempo} onChange={(e) => patch({ tempo: e.target.value })} aria-label="템포" className={selectCls}>
            <option value="">템포 전체</option>
            {data.tempos.map((t) => <option key={t} value={t}>{TEMPO_LABEL[t]}</option>)}
          </select>
          <select value={theme} onChange={(e) => patch({ theme: e.target.value })} aria-label="주제" className={`${selectCls} min-w-0 flex-1`}>
            <option value="">주제 전체</option>
            {data.themes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {active ? (
        <>
          <div className="px-4 py-2 text-xs text-slate-400 dark:text-slate-500">{results.length}곡</div>
          <SongList songs={results} />
        </>
      ) : (
        <p className="px-4 py-16 text-center text-sm text-slate-400 dark:text-slate-500">
          제목으로 검색하거나, 코드·템포·주제를 조합해 보세요.
        </p>
      )}
    </div>
  );
}
