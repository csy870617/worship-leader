import type { Song, Tempo } from "../types";
import { TEMPO_LABEL } from "../types";

const TEMPO_STYLE: Record<Tempo, string> = {
  FAST: "bg-rose-100 text-rose-700",
  SLOW: "bg-sky-100 text-sky-700",
  MEDIUM: "bg-amber-100 text-amber-700",
  HYMN: "bg-emerald-100 text-emerald-700",
};

export function KeyBadge({ k }: { k: string }) {
  return (
    <span className="inline-flex min-w-[1.6rem] items-center justify-center rounded-md bg-indigo-600 px-1.5 py-0.5 text-xs font-bold text-white">
      {k}
    </span>
  );
}

export function TempoBadge({ t }: { t: Tempo }) {
  return (
    <span className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${TEMPO_STYLE[t]}`}>
      {TEMPO_LABEL[t]}
    </span>
  );
}

export function ThemeBadge({ name }: { name: string }) {
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
      {name}
    </span>
  );
}

/** Compact meta line used in list rows. */
export function SongMeta({ song }: { song: Song }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {song.keys.map((k) => (
        <KeyBadge key={k} k={k} />
      ))}
      {song.tempos.map((t) => (
        <TempoBadge key={t} t={t} />
      ))}
      {song.hymnNo != null && (
        <span className="rounded-md bg-slate-200 px-1.5 py-0.5 text-xs font-semibold text-slate-600">
          새찬 {song.hymnNo}
        </span>
      )}
    </div>
  );
}
