import { Link } from "react-router-dom";
import type { Song } from "../types";
import { SongMeta } from "./Badges";
import FavoriteButton from "./FavoriteButton";
import AddToContiButton from "./AddToContiButton";
import { useHistory } from "../lib/useHistory";

export default function SongList({ songs }: { songs: Song[] }) {
  const { lastUsed } = useHistory();

  if (songs.length === 0) {
    return (
      <p className="px-4 py-16 text-center text-sm text-slate-400 dark:text-slate-500">
        곡이 없습니다.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {songs.map((song) => (
        <li key={song.id} className="flex items-center">
          <Link
            to={`/song/${song.id}`}
            className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 active:bg-slate-50 dark:active:bg-slate-800/60"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-slate-800 dark:text-slate-100">
                {song.title}
              </p>
              <SongMeta song={song} lastUsed={lastUsed(song.id)} />
            </div>
          </Link>
          <div className="flex items-center pr-2">
            <AddToContiButton id={song.id} />
            <FavoriteButton id={song.id} />
          </div>
        </li>
      ))}
    </ul>
  );
}
