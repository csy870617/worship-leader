import { useMemo } from "react";
import { useFavorites } from "../lib/useFavorites";
import { songById, sortKo } from "../data";
import SongList from "../components/SongList";

export default function Favorites() {
  const { favorites } = useFavorites();

  const list = useMemo(
    () =>
      [...favorites]
        .map((id) => songById.get(id))
        .filter((s): s is NonNullable<typeof s> => Boolean(s))
        .sort(sortKo),
    [favorites]
  );

  if (list.length === 0) {
    return (
      <div className="px-6 py-20 text-center">
        <svg
          className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11.48 3.5a.56.56 0 0 1 1.04 0l2.02 4.9 5.28.43c.5.04.7.66.32.98l-4.02 3.45 1.23 5.16c.11.49-.42.87-.84.61L12 16.7l-4.53 2.74c-.42.26-.95-.12-.84-.61l1.23-5.16-4.02-3.45a.56.56 0 0 1 .32-.98l5.28-.43 2.02-4.9Z"
          />
        </svg>
        <p className="mt-3 text-sm text-slate-400 dark:text-slate-500">
          곡 목록의 별표를 눌러 즐겨찾기에 담아 보세요.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="px-4 py-2 text-xs text-slate-400 dark:text-slate-500">
        즐겨찾기 · {list.length}곡
      </div>
      <SongList songs={list} />
    </div>
  );
}
