import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { compatibleSongs, useSongs } from "../lib/catalog";
import { useConti } from "../lib/useConti";
import { useHistory, daysSince } from "../lib/useHistory";
import { bestRelation } from "../lib/keys";
import { contiShareUrl, contiToText, copyText, decodeConti } from "../lib/share";
import { KeyBadge } from "../components/Badges";

export default function Conti() {
  const { conti, remove, move, setNote, clear, replace, add, has } = useConti();
  const { songById } = useSongs();
  const { markUsed, lastUsed } = useHistory();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [toast, setToast] = useState<string | null>(null);

  const shared = params.get("d");
  const sharedItems = useMemo(() => (shared ? decodeConti(shared) : null), [shared]);

  const rows = useMemo(
    () => conti.map((it) => ({ ...it, song: songById.get(it.id)! })).filter((r) => r.song),
    [conti]
  );

  const excludeIds = useMemo(() => new Set(conti.map((c) => c.id)), [conti]);
  const lastSong = rows.length ? rows[rows.length - 1].song : null;
  const suggestions = useMemo(
    () => (lastSong ? compatibleSongs(lastSong.keys, excludeIds, 8) : []),
    [lastSong, excludeIds]
  );

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);
  const flash = (m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  };

  const dismissShared = () => {
    const p = new URLSearchParams(params);
    p.delete("d");
    setParams(p, { replace: true });
  };

  // shared-link import banner
  if (sharedItems && sharedItems.length) {
    return (
      <div className="px-4 py-6">
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-500/30 dark:bg-indigo-500/10">
          <p className="font-semibold text-indigo-700 dark:text-indigo-300">
            공유된 콘티 ({sharedItems.length}곡)
          </p>
          <ul className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-300">
            {sharedItems.map((it, i) => (
              <li key={i} className="truncate">
                {i + 1}. {songById.get(it.id)?.title}
                {it.note ? ` — ${it.note}` : ""}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => {
                replace(sharedItems);
                dismissShared();
                flash("콘티를 불러왔습니다");
              }}
              className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white"
            >
              불러오기 (현재 대체)
            </button>
            <button
              onClick={dismissShared}
              className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
            >
              취소
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="px-6 py-20 text-center">
        <svg className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 6.75h18M3 12h18M3 17.25h18" />
        </svg>
        <p className="mt-3 text-sm text-slate-400 dark:text-slate-500">
          곡 목록의 ⊕ 버튼으로 콘티에 담아 순서를 구성해 보세요.
        </p>
        <Link to="/browse" className="mt-3 inline-block text-sm font-semibold text-indigo-600 dark:text-indigo-400">
          곡 둘러보기 →
        </Link>
      </div>
    );
  }

  return (
    <div className="pb-6">
      {/* action bar */}
      <div className="sticky top-14 md:top-0 z-10 flex items-center gap-2 border-b border-slate-100 bg-white/95 px-4 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">콘티 {rows.length}곡</span>
        <div className="ml-auto flex gap-1.5">
          <button onClick={() => navigate("/stage")} className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white dark:bg-slate-200 dark:text-slate-900">무대 모드</button>
          <button
            onClick={async () => flash((await copyText(contiShareUrl(conti))) ? "공유 링크 복사됨" : "복사 실패")}
            className="rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white"
          >링크</button>
          <button
            onClick={async () => flash((await copyText(contiToText(conti))) ? "텍스트 복사됨" : "복사 실패")}
            className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
          >텍스트</button>
        </div>
      </div>

      {/* ordered list with key-flow between songs */}
      <ol className="px-4 pt-3">
        {rows.map((r, i) => {
          const prev = i > 0 ? rows[i - 1].song : null;
          const rel = prev ? bestRelation(prev.keys, r.song.keys) : null;
          const used = lastUsed(r.id);
          const recentlyUsed = used && daysSince(used) <= 28;
          return (
            <li key={r.id}>
              {rel && (
                <div className="flex items-center gap-2 py-1 pl-1 text-[11px] text-slate-400 dark:text-slate-500">
                  <span className="h-3 w-px bg-slate-200 dark:bg-slate-700" />
                  {rel.score > 0 ? (
                    <span className={rel.score >= 3 ? "text-emerald-600 dark:text-emerald-400" : ""}>
                      ↓ {rel.label}
                    </span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400">↓ 키 전환 큼</span>
                  )}
                </div>
              )}
              <div className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 text-sm font-bold text-slate-400">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <Link to={`/song/${r.song.id}`} className="block truncate font-medium text-slate-800 dark:text-slate-100">
                      {r.song.title}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {r.song.keys.map((k) => <KeyBadge key={k} k={k} />)}
                      {recentlyUsed && (
                        <span className="rounded-md bg-orange-100 px-1.5 py-0.5 text-xs font-semibold text-orange-700 dark:bg-orange-500/20 dark:text-orange-300">
                          최근 {Math.floor(daysSince(used!) / 7) || 0}주 전 사용
                        </span>
                      )}
                    </div>
                    <input
                      value={r.note ?? ""}
                      onChange={(e) => setNote(r.id, e.target.value)}
                      placeholder="메모 (연주 키 / 편곡 등)"
                      className="mt-2 w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-sm text-slate-700 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    />
                  </div>
                  <div className="flex flex-col">
                    <button onClick={() => move(r.id, -1)} disabled={i === 0} aria-label="위로" className="p-1 text-slate-400 disabled:opacity-30">
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" /></svg>
                    </button>
                    <button onClick={() => move(r.id, 1)} disabled={i === rows.length - 1} aria-label="아래로" className="p-1 text-slate-400 disabled:opacity-30">
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
                    </button>
                    <button onClick={() => remove(r.id)} aria-label="빼기" className="p-1 text-slate-300 hover:text-rose-500">
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {/* next-song suggestions by key */}
      {suggestions.length > 0 && (
        <section className="mt-5 px-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            다음 곡 추천 · {lastSong!.keys.join("/")} 키와 연결
          </h2>
          <ul className="mt-2 space-y-1.5">
            {suggestions.map(({ song, relation }) => (
              <li key={song.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                <div className="min-w-0 flex-1">
                  <Link to={`/song/${song.id}`} className="block truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                    {song.title}
                  </Link>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">
                    {song.keys.join("/")} · {relation.label}
                  </span>
                </div>
                <button
                  onClick={() => has(song.id) || add(song.id)}
                  className="shrink-0 rounded-md bg-indigo-600 px-2 py-1 text-xs font-semibold text-white"
                >담기</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* footer actions */}
      <div className="mt-6 flex gap-2 px-4">
        <button
          onClick={() => { markUsed(conti.map((c) => c.id)); flash("오늘 사용으로 기록됨"); }}
          className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300"
        >예배에 사용함 (날짜 기록)</button>
        <button
          onClick={() => { if (confirm("콘티를 비울까요?")) clear(); }}
          className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-rose-500 dark:border-slate-700"
        >비우기</button>
      </div>

      {toast && (
        <div className="fixed inset-x-0 bottom-24 z-30 mx-auto w-fit rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-slate-200 dark:text-slate-900">
          {toast}
        </div>
      )}
    </div>
  );
}
