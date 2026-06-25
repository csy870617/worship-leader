import type { Song, Tempo } from "../types";
import { TEMPO_LABEL } from "../types";
import { daysSince } from "../lib/useHistory";

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
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-200">
      {name}
    </span>
  );
}

export function LastUsedBadge({ iso }: { iso: string }) {
  const d = daysSince(iso);
  const recent = d <= 28;
  const text = d <= 0 ? "오늘 사용" : d < 7 ? `${d}일 전` : `${Math.floor(d / 7)}주 전`;
  return (
    <span
      className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${
        recent
          ? "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300"
          : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300"
      }`}
    >
      {text}
    </span>
  );
}

/** Compact meta line used in list rows. */
export function SongMeta({ song, lastUsed }: { song: Song; lastUsed?: string | null }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {song.keys.map((k) => (
        <KeyBadge key={k} k={k} />
      ))}
      {song.tempos.map((t) => (
        <TempoBadge key={t} t={t} />
      ))}
      {song.hymnNo != null && (
        <span className="rounded-md bg-slate-200 px-1.5 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-200">
          새찬 {song.hymnNo}
        </span>
      )}
      {lastUsed && <LastUsedBadge iso={lastUsed} />}
    </div>
  );
}
