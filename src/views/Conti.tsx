import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useSongs } from "../lib/catalog";
import { useConti } from "../lib/useConti";
import { useHistory, daysSince } from "../lib/useHistory";
import { bestRelation } from "../lib/keys";
import { decodeConti, youtubePlaylistUrl } from "../lib/share";
import { shareContiPdf } from "../lib/contiPdf";
import {
  fetchSheetInteractive,
  loadSheet,
  removeSheetEverywhere,
  saveSheetFromFile,
} from "../lib/attachments";
import { driveEnabled } from "../lib/drive";
import { KeyBadge } from "../components/Badges";

export default function Conti() {
  const {
    conti, remove, move, setNote, setKey, setYoutube, addSheet, removeSheet, clear, replace,
    contis, activeId, active, createConti, renameConti, deleteConti, setActive,
  } = useConti();
  const { songById } = useSongs();
  const { markUsed, lastUsed, clearUsed } = useHistory();
  const [params, setParams] = useSearchParams();
  const [toast, setToast] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [pdfBusy, setPdfBusy] = useState(false);

  const toggleOpen = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const shared = params.get("d");
  const sharedItems = useMemo(() => (shared ? decodeConti(shared) : null), [shared]);

  const rows = useMemo(
    () => conti.map((it) => ({ ...it, song: songById.get(it.id)! })).filter((r) => r.song),
    [conti]
  );

  const playlistUrl = useMemo(() => youtubePlaylistUrl(conti.map((c) => c.youtube)), [conti]);

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

  return (
    <div className="pb-6">
      {/* setlist picker + manage */}
      <div className="sticky top-14 md:top-0 z-10 space-y-2 border-b border-slate-100 bg-white/95 px-4 py-2.5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="flex items-center gap-2">
          <select
            value={activeId}
            onChange={(e) => setActive(e.target.value)}
            aria-label="콘티 선택"
            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            {contis.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.items.length}곡)
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              const name = prompt("새 콘티 이름", `콘티 ${contis.length + 1}`);
              if (name !== null) {
                createConti(name);
                flash("새 콘티가 생성됐어요");
              }
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white active:bg-indigo-700"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            새 콘티
          </button>
        </div>
        <div className="flex items-center justify-between">
          <span className="truncate text-xs text-slate-400 dark:text-slate-500">
            {active.name} · {rows.length}곡
          </span>
          <div className="flex shrink-0 items-center gap-3 text-xs font-medium">
            <button
              onClick={() => {
                const name = prompt("콘티 이름 변경", active.name);
                if (name) renameConti(activeId, name);
              }}
              className="text-slate-500 hover:text-slate-700 dark:text-slate-400"
            >
              이름 변경
            </button>
            <button
              onClick={() => {
                if (confirm(`'${active.name}' 콘티를 삭제할까요?`)) deleteConti(activeId);
              }}
              className="text-rose-500"
            >
              콘티 삭제
            </button>
          </div>
        </div>
      </div>

      {rows.length === 0 && (
        <div className="px-6 py-16 text-center">
          <p className="text-sm text-slate-400 dark:text-slate-500">
            이 콘티는 비어 있어요. 곡 목록의 ⊕ 버튼으로 담아 보세요.
          </p>
          <Link to="/browse" className="mt-3 inline-block text-sm font-semibold text-indigo-600 dark:text-indigo-400">
            곡 둘러보기 →
          </Link>
        </div>
      )}

      {/* ordered list with key-flow between songs */}
      <ol className="space-y-1.5 px-3 pt-3">
        {rows.map((r, i) => {
          // use the chosen key (if any) for the smooth-transition hint
          const curKeys = r.key ? [r.key] : r.song.keys;
          const prevRow = i > 0 ? rows[i - 1] : null;
          const prevKeys = prevRow ? (prevRow.key ? [prevRow.key] : prevRow.song.keys) : null;
          const rel = prevKeys ? bestRelation(prevKeys, curKeys) : null;
          const used = lastUsed(r.id);
          const recentlyUsed = used && daysSince(used) <= 28;
          const sheetCount = r.sheets?.length ?? 0;
          return (
            <li key={r.id}>
              {rel && (
                <div className="flex items-center justify-center py-0.5 text-[10px] font-medium">
                  <span
                    className={
                      rel.score >= 3
                        ? "text-emerald-600 dark:text-emerald-400"
                        : rel.score > 0
                        ? "text-slate-400 dark:text-slate-500"
                        : "text-amber-600 dark:text-amber-400"
                    }
                  >
                    {rel.score > 0 ? `↓ ${rel.label}` : "↓ 키 전환 큼"}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
                <span className="w-5 shrink-0 text-center text-sm font-bold text-slate-300 dark:text-slate-600">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleOpen(r.id)}
                      aria-expanded={open.has(r.id)}
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                    >
                      <span className="min-w-0 flex-1 truncate font-medium text-slate-800 dark:text-slate-100">
                        {r.song.title}
                      </span>
                      {!open.has(r.id) && (r.youtube || sheetCount > 0) && (
                        <span className="flex shrink-0 items-center gap-1 text-slate-400 dark:text-slate-500">
                          {r.youtube && (
                            <svg className="h-3.5 w-3.5 text-red-500" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                              <path d="M21.6 7.2a2.4 2.4 0 0 0-1.7-1.7C18.4 5.1 12 5.1 12 5.1s-6.4 0-7.9.4A2.4 2.4 0 0 0 2.4 7.2 25 25 0 0 0 2 12a25 25 0 0 0 .4 4.8 2.4 2.4 0 0 0 1.7 1.7c1.5.4 7.9.4 7.9.4s6.4 0 7.9-.4a2.4 2.4 0 0 0 1.7-1.7A25 25 0 0 0 22 12a25 25 0 0 0-.4-4.8ZM10 15V9l5 3-5 3Z" />
                            </svg>
                          )}
                          {sheetCount > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold">
                              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m.75 12 1.5 1.5 3-3m-3.75-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                              </svg>
                              {sheetCount}
                            </span>
                          )}
                        </span>
                      )}
                    </button>
                    <span className="flex shrink-0 items-center gap-1">
                      {r.song.keys.length > 1
                        ? r.song.keys.map((k) => (
                            <button
                              key={k}
                              onClick={() => setKey(r.id, r.key === k ? null : k)}
                              aria-pressed={r.key === k}
                              title={r.key === k ? "선택 해제" : `${k} 키로 선택`}
                              className={
                                "min-w-[1.6rem] rounded-md px-1.5 py-0.5 text-xs font-bold " +
                                (r.key === k
                                  ? "bg-indigo-600 text-white"
                                  : r.key
                                  ? "bg-slate-200 text-slate-400 dark:bg-slate-700 dark:text-slate-500"
                                  : "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300")
                              }
                            >
                              {k}
                            </button>
                          ))
                        : r.song.keys.map((k) => <KeyBadge key={k} k={k} />)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <input
                      value={r.note ?? ""}
                      onChange={(e) => setNote(r.id, e.target.value)}
                      placeholder="메모 추가"
                      className="-mx-1 min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 text-xs text-slate-600 outline-none placeholder:text-slate-400 focus:bg-white dark:text-slate-300 dark:placeholder:text-slate-600 dark:focus:bg-slate-900"
                    />
                    {recentlyUsed && (
                      <button
                        onClick={() => clearUsed([r.id])}
                        title="사용 기록 삭제"
                        className="inline-flex shrink-0 items-center gap-1 rounded-md bg-orange-100 py-0.5 pl-1.5 pr-1 text-[10px] font-semibold text-orange-700 dark:bg-orange-500/20 dark:text-orange-300"
                      >
                        {Math.floor(daysSince(used!) / 7) || 0}주 전 사용
                        <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col text-slate-400">
                  <button onClick={() => move(r.id, -1)} disabled={i === 0} aria-label="위로" className="p-0.5 disabled:opacity-25">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" /></svg>
                  </button>
                  <button onClick={() => move(r.id, 1)} disabled={i === rows.length - 1} aria-label="아래로" className="p-0.5 disabled:opacity-25">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
                  </button>
                </div>
                <button onClick={() => remove(r.id)} aria-label="빼기" className="shrink-0 rounded-full p-1 text-slate-300 hover:text-rose-500 dark:text-slate-600">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                </button>
              </div>

              {open.has(r.id) && (
                <ContiAttachPanel
                  songId={r.id}
                  songTitle={r.song.title}
                  youtubeUrl={r.youtube}
                  sheetIds={r.sheets ?? []}
                  onYoutube={(u) => setYoutube(r.id, u)}
                  onAddSheet={(aid) => addSheet(r.id, aid)}
                  onRemoveSheet={(aid) => removeSheet(r.id, aid)}
                  flash={flash}
                />
              )}
            </li>
          );
        })}
      </ol>

      {/* footer: share & record */}
      {rows.length > 0 && (
        <div className="mt-8 space-y-2 px-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            공유 · 기록
          </p>
          {/* row 1: playlist + download */}
          <div className="flex gap-2">
            {playlistUrl && (
              <a
                href={playlistUrl}
                target="_blank"
                rel="noreferrer"
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white active:bg-red-700"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.3 3.6-6.3 3.6Z" />
                </svg>
                플래이리스트
              </a>
            )}
            <button
              disabled={pdfBusy}
              onClick={async () => {
                setPdfBusy(true);
                flash("PDF를 만드는 중…");
                try {
                  const r = await shareContiPdf(active.name, conti, songById, "download");
                  if (r === "downloaded") flash("PDF를 다운로드했어요");
                  else if (r === "failed") flash("PDF 생성에 실패했어요");
                  else setToast(null);
                } finally {
                  setPdfBusy(false);
                }
              }}
              className="flex-1 rounded-lg border border-indigo-200 py-2.5 text-sm font-semibold text-indigo-600 active:bg-indigo-50 disabled:opacity-60 dark:border-indigo-500/40 dark:text-indigo-300"
            >
              다운로드
            </button>
          </div>
          {/* row 2: share + record + clear */}
          <div className="flex gap-2">
            <button
              disabled={pdfBusy}
              onClick={async () => {
                setPdfBusy(true);
                flash("PDF를 만드는 중…");
                try {
                  const r = await shareContiPdf(active.name, conti, songById);
                  if (r === "downloaded") flash("PDF를 저장했어요");
                  else if (r === "failed") flash("PDF 생성에 실패했어요");
                  else setToast(null);
                } finally {
                  setPdfBusy(false);
                }
              }}
              className="flex-1 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white active:bg-indigo-700 disabled:opacity-60"
            >
              {pdfBusy ? "만드는 중…" : "콘티 공유"}
            </button>
            <button
              onClick={() => { markUsed(conti.map((c) => c.id)); flash("오늘 사용으로 기록됐어요"); }}
              className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300"
            >
              콘티 사용
            </button>
            <button
              onClick={() => { if (confirm("이 콘티의 곡을 모두 비울까요?")) clear(); }}
              className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-rose-500 dark:border-slate-700"
            >
              비우기
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed inset-x-0 bottom-24 z-30 mx-auto w-fit rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-slate-200 dark:text-slate-900">
          {toast}
        </div>
      )}
    </div>
  );
}

function ContiAttachPanel({
  songId,
  songTitle,
  youtubeUrl,
  sheetIds,
  onYoutube,
  onAddSheet,
  onRemoveSheet,
  flash,
}: {
  songId: string;
  songTitle: string;
  youtubeUrl?: string;
  sheetIds: string[];
  onYoutube: (url: string | null) => void;
  onAddSheet: (aid: string) => void;
  onRemoveSheet: (aid: string) => void;
  flash: (m: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);
  const synced = driveEnabled();

  const onFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const aid = await saveSheetFromFile(file, songTitle);
        onAddSheet(aid);
      }
      flash(synced ? "악보를 드라이브에 저장했어요" : "악보를 첨부했어요");
    } catch {
      flash("악보 첨부에 실패했어요");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-1 ml-7 space-y-3 rounded-xl border border-slate-100 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      {/* YouTube link */}
      <div>
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          유튜브 링크
        </label>
        <div className="flex items-center gap-1.5">
          <input
            type="url"
            inputMode="url"
            defaultValue={youtubeUrl ?? ""}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== (youtubeUrl ?? "")) onYoutube(v || null);
            }}
            placeholder="https://youtu.be/..."
            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          />
          {youtubeUrl && (
            <a
              href={youtubeUrl}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-600 dark:bg-red-500/15 dark:text-red-400"
            >
              열기
            </a>
          )}
        </div>
      </div>

      {/* sheet music */}
      <div>
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          악보
        </label>
        {sheetIds.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {sheetIds.map((aid, idx) => (
              <SheetThumb
                key={aid}
                aid={aid}
                onOpen={() => setViewer(idx)}
                onRemove={() => {
                  onRemoveSheet(aid);
                  removeSheetEverywhere(aid);
                }}
              />
            ))}
          </div>
        )}
        {viewer !== null && (
          <SheetLightbox ids={sheetIds} start={viewer} onClose={() => setViewer(null)} />
        )}
        <label
          className={
            "inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300 " +
            (busy ? "pointer-events-none opacity-60" : "")
          }
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          {busy ? "추가 중…" : "악보 추가"}
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            data-song={songId}
            onChange={(e) => {
              onFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>
    </div>
  );
}

function SheetThumb({
  aid,
  onOpen,
  onRemove,
}: {
  aid: string;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "needsSync">("loading");

  useEffect(() => {
    let alive = true;
    loadSheet(aid).then((u) => {
      if (!alive) return;
      if (u) {
        setUrl(u);
        setState("ready");
      } else {
        setState(driveEnabled() ? "needsSync" : "loading");
      }
    });
    return () => {
      alive = false;
    };
  }, [aid]);

  const sync = async () => {
    setState("loading");
    const u = await fetchSheetInteractive(aid);
    if (u) {
      setUrl(u);
      setState("ready");
    } else {
      setState("needsSync");
    }
  };

  return (
    <div className="relative h-20 w-16 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
      {state === "ready" && url ? (
        <button onClick={onOpen} className="block h-full w-full" title="크게 보기">
          <img src={url} alt="악보" className="h-full w-full object-cover" />
        </button>
      ) : state === "needsSync" ? (
        <button
          onClick={sync}
          className="flex h-full w-full flex-col items-center justify-center gap-0.5 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400"
          title="구글 드라이브에서 불러오기"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v9m0 0 3.75-3.75M12 13.5 8.25 9.75M4.5 16.5v1.875A1.125 1.125 0 0 0 5.625 19.5h12.75a1.125 1.125 0 0 0 1.125-1.125V16.5" />
          </svg>
          불러오기
        </button>
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">…</div>
      )}
      <button
        onClick={onRemove}
        aria-label="악보 삭제"
        className="absolute right-0.5 top-0.5 rounded-full bg-slate-900/70 p-0.5 text-white"
      >
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function SheetLightbox({
  ids,
  start,
  onClose,
}: {
  ids: string[];
  start: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(start);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const many = ids.length > 1;

  const go = (d: number) => setIndex((i) => (i + d + ids.length) % ids.length);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setUrl(null);
    loadSheet(ids[index]).then((u) => {
      if (!alive) return;
      setUrl(u ?? null);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [ids, index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && many) go(1);
      else if (e.key === "ArrowLeft" && many) go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [many, ids.length]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        aria-label="닫기"
        className="absolute right-3 top-3 rounded-full bg-white/15 p-2 text-white active:bg-white/25"
      >
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>

      {loading ? (
        <span className="text-sm text-white/70">불러오는 중…</span>
      ) : url ? (
        <img
          src={url}
          alt="악보"
          onClick={(e) => e.stopPropagation()}
          className="max-h-full max-w-full rounded-lg object-contain"
        />
      ) : (
        <span className="text-sm text-white/70">악보를 불러올 수 없어요</span>
      )}

      {many && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              go(-1);
            }}
            aria-label="이전"
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/15 p-2 text-white active:bg-white/25"
          >
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              go(1);
            }}
            aria-label="다음"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/15 p-2 text-white active:bg-white/25"
          >
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
          <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white">
            {index + 1} / {ids.length}
          </span>
        </>
      )}
    </div>
  );
}
