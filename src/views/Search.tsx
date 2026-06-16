import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { searchSongs, sortKo } from "../data";
import SongList from "../components/SongList";

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") ?? "";

  const results = useMemo(() => {
    if (!q.trim()) return [];
    return [...searchSongs(q)].sort(sortKo);
  }, [q]);

  const setQ = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set("q", value);
    else next.delete("q");
    setSearchParams(next, { replace: true });
  };

  return (
    <div>
      <div className="sticky top-14 z-10 border-b border-slate-100 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 1 0 3.4 9.82l3.64 3.64a.75.75 0 1 0 1.06-1.06l-3.64-3.64A5.5 5.5 0 0 0 9 3.5ZM5 9a4 4 0 1 1 8 0 4 4 0 0 1-8 0Z"
              clipRule="evenodd"
            />
          </svg>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            inputMode="search"
            placeholder="곡 제목 · 주제 · 코드 검색"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-10 text-base text-slate-900 outline-none focus:border-indigo-400 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:bg-slate-800"
          />
          {q && (
            <button
              onClick={() => setQ("")}
              aria-label="지우기"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 active:bg-slate-100"
            >
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {q.trim() ? (
        <>
          <div className="px-4 py-2 text-xs text-slate-400 dark:text-slate-500">
            {results.length}곡
          </div>
          <SongList songs={results} />
        </>
      ) : (
        <p className="px-4 py-16 text-center text-sm text-slate-400 dark:text-slate-500">
          제목, 주제, 코드로 검색해 보세요.
        </p>
      )}
    </div>
  );
}
