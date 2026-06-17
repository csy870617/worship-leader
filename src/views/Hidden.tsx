import { Link, useNavigate } from "react-router-dom";
import { unhideSong, useSongs } from "../lib/catalog";
import { sortKo } from "../data";
import { SongMeta } from "../components/Badges";

export default function Hidden() {
  const navigate = useNavigate();
  const { getHiddenSongs } = useSongs();
  const list = [...getHiddenSongs()].sort(sortKo);

  return (
    <div className="px-0 py-2">
      <div className="flex items-center gap-2 px-4 pb-2">
        <button onClick={() => navigate(-1)} className="text-sm text-slate-500 dark:text-slate-400">
          뒤로
        </button>
        <h1 className="text-base font-bold">숨긴 곡 {list.length}곡</h1>
      </div>

      {list.length === 0 ? (
        <p className="px-6 py-16 text-center text-sm text-slate-400 dark:text-slate-500">
          숨긴 곡이 없습니다. 곡 상세에서 “목록에서 숨기기”로 보관할 수 있어요.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {list.map((song) => (
            <li key={song.id} className="flex items-center gap-3 px-4 py-3">
              <Link to={`/song/${song.id}`} className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-700 dark:text-slate-200">{song.title}</p>
                <SongMeta song={song} />
              </Link>
              <button
                onClick={() => unhideSong(song.id)}
                className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white"
              >
                복원
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
