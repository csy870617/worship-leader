import { Link, useNavigate, useParams } from "react-router-dom";
import { youtubeSearchUrl } from "../data";
import { hideSong, isOverridden, isUserSong, removeSong, useSongs } from "../lib/catalog";
import { KeyBadge, TempoBadge, LastUsedBadge } from "../components/Badges";
import FavoriteButton from "../components/FavoriteButton";
import AddToContiButton from "../components/AddToContiButton";
import SongAttachEditor from "../components/SongAttach";
import { useHistory } from "../lib/useHistory";
import { useFavorites } from "../lib/useFavorites";
import { useConti } from "../lib/useConti";

export default function SongDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { songById } = useSongs();
  const song = id ? songById.get(id) : undefined;
  const { lastUsed, clearUsed } = useHistory();
  const { favorites, toggle: toggleFav } = useFavorites();
  const { has: inConti, toggle: toggleConti } = useConti();

  if (!song) {
    return (
      <div className="px-4 py-16 text-center">
        <p className="text-slate-500 dark:text-slate-400">곡을 찾을 수 없습니다.</p>
        <Link to="/browse" className="mt-3 inline-block text-indigo-600 dark:text-indigo-400">
          목록으로
        </Link>
      </div>
    );
  }

  const used = lastUsed(song.id);
  const mine = isUserSong(song.id);
  const edited = isOverridden(song.id);

  return (
    <div className="px-4 py-5">
      <button
        onClick={() => navigate(-1)}
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 active:text-slate-700 dark:text-slate-400"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <path
            fillRule="evenodd"
            d="M12.79 5.23a.75.75 0 0 1-.02 1.06L8.832 10l3.938 3.71a.75.75 0 1 1-1.04 1.08l-4.5-4.25a.75.75 0 0 1 0-1.08l4.5-4.25a.75.75 0 0 1 1.06.02Z"
            clipRule="evenodd"
          />
        </svg>
        뒤로
      </button>

      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-bold leading-snug text-slate-900 dark:text-slate-50">
          {song.title}
        </h1>
        <div className="-mr-1 mt-0.5 flex items-center">
          <AddToContiButton active={inConti(song.id)} onToggle={() => toggleConti(song.id)} size="lg" />
          <FavoriteButton active={favorites.has(song.id)} onToggle={() => toggleFav(song.id)} size="lg" />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a
          href={youtubeSearchUrl(song.title)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-600 active:bg-red-100 dark:bg-red-500/15 dark:text-red-400"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.3 3.6-6.3 3.6Z" />
          </svg>
          유튜브
        </a>
        <a
          href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${song.title} 악보`)}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 active:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
          </svg>
          악보 검색
        </a>
        {used && (
          <span className="inline-flex items-center gap-1">
            <LastUsedBadge iso={used} />
            <button
              onClick={() => clearUsed([song.id])}
              aria-label="사용 기록 삭제"
              title="사용 기록 삭제"
              className="rounded-full p-0.5 text-slate-400 hover:text-rose-500 dark:text-slate-500"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        )}
        {song.isHymn && (
          <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
            찬송가
          </span>
        )}
        {mine && (
          <span className="rounded-md bg-indigo-100 px-1.5 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
            내 곡
          </span>
        )}
        {edited && (
          <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
            수정됨
          </span>
        )}
        <button
          onClick={() => navigate(`/edit/${song.id}`)}
          className="ml-auto rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-600 active:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
        >
          수정
        </button>
        {mine ? (
          <button
            onClick={() => {
              if (confirm("이 곡을 삭제할까요?")) {
                removeSong(song.id);
                navigate(-1);
              }
            }}
            className="rounded-lg bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-600 active:bg-rose-100 dark:bg-rose-500/15 dark:text-rose-400"
          >
            삭제
          </button>
        ) : (
          <button
            onClick={() => {
              hideSong(song.id);
              navigate(-1);
            }}
            className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-600 active:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
          >
            숨기기
          </button>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-x-8 gap-y-4">
        <Field label="코드">
          {song.keys.length ? (
            <div className="flex flex-wrap gap-1.5">
              {song.keys.map((k) => (
                <KeyBadge key={k} k={k} />
              ))}
            </div>
          ) : (
            <Empty />
          )}
        </Field>

        <Field label="템포">
          {song.tempos.length ? (
            <div className="flex flex-wrap gap-1.5">
              {song.tempos.map((t) => (
                <TempoBadge key={t} t={t} />
              ))}
            </div>
          ) : (
            <Empty />
          )}
        </Field>

        <Field label="주제">
          {song.themes.length ? (
            <div className="flex flex-wrap gap-1.5">
              {song.themes.map((t) => (
                <Link
                  key={t}
                  to={`/browse?axis=theme&theme=${encodeURIComponent(t)}`}
                  className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700 active:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:active:bg-slate-700"
                >
                  {t}
                </Link>
              ))}
            </div>
          ) : (
            <Empty />
          )}
        </Field>

        {song.hymnNo != null && (
          <Field label="새찬송가">
            <span className="text-slate-700 dark:text-slate-200">{song.hymnNo}장</span>
          </Field>
        )}
      </div>

      <section className="mt-6">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          송폼 · 메모 · 유튜브 · 악보
        </h2>
        <SongAttachEditor
          songId={song.id}
          songTitle={song.title}
          withMemo
          className="space-y-3 rounded-xl border border-slate-100 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
        />
      </section>

    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </p>
      {children}
    </div>
  );
}

function Empty() {
  return <span className="text-sm text-slate-300 dark:text-slate-600">—</span>;
}
