import { Link } from "react-router-dom";
import type { Song } from "../types";
import { SongMeta } from "./Badges";

export default function SongList({ songs }: { songs: Song[] }) {
  if (songs.length === 0) {
    return (
      <p className="px-4 py-16 text-center text-sm text-slate-400">
        곡이 없습니다.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-slate-100">
      {songs.map((song) => (
        <li key={song.id}>
          <Link
            to={`/song/${song.id}`}
            className="flex items-center justify-between gap-3 px-4 py-3 active:bg-slate-50"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-800">{song.title}</p>
              <SongMeta song={song} />
            </div>
            <svg
              className="h-4 w-4 shrink-0 text-slate-300"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden
            >
              <path
                fillRule="evenodd"
                d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
                clipRule="evenodd"
              />
            </svg>
          </Link>
        </li>
      ))}
    </ul>
  );
}
