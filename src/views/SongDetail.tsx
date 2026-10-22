import { Link, useNavigate, useParams } from "react-router-dom";
import { hideSong, isOverridden, isUserSong, removeSong, useSongs } from "../lib/catalog";
import { KeyBadge, TempoBadge, LastUsedBadge } from "../components/Badges";
import FavoriteButton from "../components/FavoriteButton";
import AddToContiButton from "../components/AddToContiButton";
import SongAttachEditor from "../components/SongAttach";
import { useHistory } from "../lib/useHistory";
import { useFavorites } from "../lib/useFavorites";
import { useConti } from "../lib/useConti";
import { historyIdx } from "../lib/backStack";

export default function SongDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  // leave this page after hiding/deleting the song: go back when the app has a
  // page to go back to; opened directly (fresh launch, shared link) there is
  // none — navigate(-1) would then do nothing or leave the app entirely
  const leave = () => {
    if (historyIdx() > 0) navigate(-1);
    else navigate("/browse", { replace: true });
  };
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
      {/* top row: back on the left, 수정 / 숨기기 (삭제 for a song you added) on the right */}
      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={leave}
          className="inline-flex items-center gap-1 text-sm text-slate-500 active:text-slate-700 dark:text-slate-400"
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
        <div className="-mr-2 flex items-center">
          <button
            onClick={() => navigate(`/edit/${song.id}`)}
            aria-label="수정"
            title="수정"
            className="rounded-full p-2 text-slate-500 active:bg-slate-100 dark:text-slate-400 dark:active:bg-slate-800"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
            </svg>
          </button>
          {mine ? (
            <button
              onClick={() => {
                if (confirm("이 곡을 삭제할까요?")) {
                  removeSong(song.id);
                  leave();
                }
              }}
              aria-label="삭제"
              title="삭제"
              className="rounded-full p-2 text-rose-500 active:bg-rose-50 dark:text-rose-400 dark:active:bg-rose-500/10"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
              </svg>
            </button>
          ) : (
            <button
              onClick={() => {
                if (confirm("이 곡을 찬양목록에서 숨기시겠습니까?")) {
                  hideSong(song.id);
                  leave();
                }
              }}
              aria-label="숨기기"
              title="숨기기"
              className="rounded-full p-2 text-slate-500 active:bg-slate-100 dark:text-slate-400 dark:active:bg-slate-800"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-bold leading-snug text-slate-900 dark:text-slate-50">
          {song.title}
        </h1>
        <div className="-mr-1 mt-0.5 flex items-center">
          <AddToContiButton active={inConti(song.id)} onToggle={() => toggleConti(song.id)} size="lg" />
          <FavoriteButton active={favorites.has(song.id)} onToggle={() => toggleFav(song.id)} size="lg" />
        </div>
      </div>

      {(used || song.isHymn || mine || edited) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
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
        </div>
      )}

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
