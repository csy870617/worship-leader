import { memo } from "react";
import { Link } from "react-router-dom";
import type { Song } from "../types";
import { KeyBadge } from "./Badges";
import FavoriteButton from "./FavoriteButton";
import AddToContiButton from "./AddToContiButton";
import { useFavorites } from "../lib/useFavorites";
import { useConti } from "../lib/useConti";

export default function SongList({ songs }: { songs: Song[] }) {
  // subscribe ONCE here; rows are memoized so a single toggle only re-renders
  // the affected row instead of every button in the list.
  const { favorites, toggle: toggleFav } = useFavorites();
  const { has, toggle: toggleConti } = useConti();

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
        <SongRow
          key={song.id}
          song={song}
          fav={favorites.has(song.id)}
          inConti={has(song.id)}
          onFav={toggleFav}
          onConti={toggleConti}
        />
      ))}
    </ul>
  );
}

const SongRow = memo(function SongRow({
  song,
  fav,
  inConti,
  onFav,
  onConti,
}: {
  song: Song;
  fav: boolean;
  inConti: boolean;
  onFav: (id: string) => void;
  onConti: (id: string) => void;
}) {
  return (
    <li className="flex items-center">
      <Link
        to={`/song/${song.id}`}
        className="flex min-w-0 flex-1 items-center gap-2 px-4 py-3 active:bg-slate-50 dark:active:bg-slate-800/60"
      >
        <span className="min-w-0 flex-1 truncate font-medium text-slate-800 dark:text-slate-100">
          {song.title}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {song.keys.map((k) => (
            <KeyBadge key={k} k={k} />
          ))}
        </span>
      </Link>
      <div className="flex shrink-0 items-center pr-2">
        <AddToContiButton active={inConti} onToggle={() => onConti(song.id)} />
        <FavoriteButton active={fav} onToggle={() => onFav(song.id)} />
      </div>
    </li>
  );
});
