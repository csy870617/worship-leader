import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useSongs } from "../lib/catalog";
import { useConti, type ContiItem } from "../lib/useConti";
import { useHistory, daysSince } from "../lib/useHistory";
import { decodeConti, youtubePlaylistUrl, copyText, openYouTube } from "../lib/share";
import { driveEnabled, uploadSharedFile } from "../lib/drive";
import { buildContiPdf, downloadContiFile } from "../lib/contiPdf";
import { setSongNote, useSongAttach } from "../lib/songAttach";
import { useBackDismiss } from "../lib/backStack";
import { KeyBadge } from "../components/Badges";
import SongAttachEditor from "../components/SongAttach";
import ContiView from "../components/ContiView";

// block page scrolling while a row is being dragged (added/removed on demand)
const preventScroll = (e: TouchEvent) => e.preventDefault();

// quick-insert chips for the song memo (two rows, like the sheet presets)
const MEMO_PRESET_ROWS = [
  ["Int", "V", "V1", "V2", "PC", "C", "C1", "C2"],
  ["B", "Itl4", "Itl8", "Tag", "Out", "Rit"],
];

export default function Conti() {
  const {
    conti, remove, setKey, clear, replace,
    contis, activeId, active, createConti, renameConti, deleteConti, setActive,
  } = useConti();
  const attach = useSongAttach();
  const { songById } = useSongs();
  const { markUsed, lastUsed, clearUsed } = useHistory();
  const [params, setParams] = useSearchParams();
  const [toast, setToast] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [pdfBusy, setPdfBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [shareReady, setShareReady] = useState<File | null>(null);
  const [shareErr, setShareErr] = useState<string | null>(null);
  const [driveLink, setDriveLink] = useState<string | null>(null);
  const [showView, setShowView] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [memoFocused, setMemoFocused] = useState(false);

  // back button / navigation dismisses any open popup instead of leaving the page
  useBackDismiss(menuOpen, () => setMenuOpen(false));
  useBackDismiss(confirmClear, () => setConfirmClear(false));
  useBackDismiss(confirmDelete, () => setConfirmDelete(false));
  useBackDismiss(shareReady != null, () => { setShareReady(null); setShareErr(null); });
  useBackDismiss(driveLink != null, () => setDriveLink(null));

  // ---- drag-to-reorder + long-press/right-click delete ----
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOrder, setDragOrder] = useState<ContiItem[] | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  useBackDismiss(confirmRemove != null, () => setConfirmRemove(null));
  const dragIdRef = useRef<string | null>(null);
  const dragOrderRef = useRef<ContiItem[] | null>(null);
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lpStart = useRef<{ x: number; y: number } | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

  // remember the focused memo input so preset chips can insert at its cursor
  const memoElRef = useRef<HTMLInputElement | null>(null);
  const memoSongRef = useRef<string | null>(null);
  const pendingSelRef = useRef<{ el: HTMLInputElement; pos: number } | null>(null);
  // restore the caret after the controlled memo value has updated
  useEffect(() => {
    const p = pendingSelRef.current;
    if (!p) return;
    pendingSelRef.current = null;
    p.el.focus();
    try {
      p.el.setSelectionRange(p.pos, p.pos);
    } catch {
      /* ignore */
    }
  });
  const insertPreset = (text: string) => {
    const el = memoElRef.current;
    const songId = memoSongRef.current;
    if (!el || !songId) {
      flash("먼저 메모를 누른 뒤 사용하세요");
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const next = el.value.slice(0, start) + text + el.value.slice(end);
    pendingSelRef.current = { el, pos: start + text.length };
    setSongNote(songId, next);
  };

  useEffect(() => () => window.removeEventListener("touchmove", preventScroll), []);

  const indexFromY = (y: number) => {
    const list = listRef.current;
    if (!list) return -1;
    const lis = Array.from(list.children) as HTMLElement[];
    for (let i = 0; i < lis.length; i++) {
      const rect = lis[i].getBoundingClientRect();
      if (y < rect.top + rect.height / 2) return i;
    }
    return lis.length - 1;
  };
  const cancelLP = () => {
    lpStart.current = null;
    if (lpTimer.current) {
      clearTimeout(lpTimer.current);
      lpTimer.current = null;
    }
  };
  // preview the reorder locally during the drag, commit once on drop
  const beginDrag = (id: string) => {
    dragIdRef.current = id;
    const snap = conti.slice();
    dragOrderRef.current = snap;
    setDragId(id);
    setDragOrder(snap);
    window.addEventListener("touchmove", preventScroll, { passive: false });
  };
  const endDrag = () => {
    const order = dragOrderRef.current;
    dragIdRef.current = null;
    dragOrderRef.current = null;
    setDragId(null);
    setDragOrder(null);
    window.removeEventListener("touchmove", preventScroll);
    if (order && order.some((it, i) => it.id !== conti[i]?.id)) replace(order);
  };
  // drag handle (grip) — starts the reorder immediately, works on touch
  const onHandleDown = (e: React.PointerEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.pointerType === "mouse" && e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    beginDrag(id);
  };
  const onHandleMove = (e: React.PointerEvent) => {
    const id = dragIdRef.current;
    const order = dragOrderRef.current;
    if (!id || !order) return;
    const to = indexFromY(e.clientY);
    const from = order.findIndex((it) => it.id === id);
    if (to < 0 || from < 0 || to === from) return;
    const next = order.slice();
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    dragOrderRef.current = next;
    setDragOrder(next);
  };
  const onHandleUp = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    if (dragIdRef.current) endDrag();
  };
  // long-press (touch) on the row body = delete intent
  const onRowPointerDown = (e: React.PointerEvent, id: string) => {
    if (e.pointerType === "mouse") return; // mouse uses right-click
    const t = e.target as HTMLElement;
    if (t.closest("button, input, a, textarea, [data-drag-handle]")) return;
    lpStart.current = { x: e.clientX, y: e.clientY };
    lpTimer.current = setTimeout(() => setConfirmRemove(id), 500);
  };
  // only a real finger move (not holding-still jitter) cancels the long-press
  const onRowPointerMove = (e: React.PointerEvent) => {
    const s = lpStart.current;
    if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) cancelLP();
  };
  const onRowPointerEnd = () => cancelLP();

  const toggleOpen = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const shared = params.get("d");
  const sharedItems = useMemo(() => (shared ? decodeConti(shared) : null), [shared]);

  const displayItems = dragOrder ?? conti;
  const rows = useMemo(
    () => displayItems.map((it) => ({ ...it, song: songById.get(it.id)! })).filter((r) => r.song),
    [displayItems, songById]
  );

  const playlistUrl = useMemo(
    () => youtubePlaylistUrl(conti.map((c) => attach[c.id]?.youtube)),
    [conti, attach]
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

  // plain-text setlist (works with Web Share text/url, which PWAs allow)
  const buildShareText = () => {
    const blocks = conti.map((c, i) => {
      const s = songById.get(c.id);
      if (!s) return `${i + 1}.`;
      const key = c.key ? ` (${c.key})` : s.keys.length ? ` (${s.keys.join("/")})` : "";
      const note = attach[c.id]?.note;
      let block = `${i + 1}. ${s.title}${key}`;
      if (note) block += `\n${note}`;
      return block;
    });
    let text = `🎵 ${active.name} (${conti.length}곡)\n\n${blocks.join("\n\n")}`;
    if (playlistUrl) text += `\n\n▶ 유튜브 재생목록: ${playlistUrl}`;
    return text;
  };
  const shareText = async () => {
    const text = buildShareText();
    try {
      await navigator.share({ title: active.name, text });
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") return;
      const ok = await copyText(text);
      flash(ok ? "공유 대신 텍스트를 복사했어요" : "공유에 실패했어요");
    }
  };
  // PDF-share fallback: upload the PDF to Drive, then offer its link for sharing.
  // Upload runs automatically; the actual share fires from a fresh button tap so
  // the native share sheet reliably opens (a tap after async upload would lose
  // user-activation and only be able to copy).
  const shareViaDrive = async (file: File) => {
    setShareReady(null);
    setShareErr(null);
    flash("드라이브에 올리는 중…");
    try {
      const link = await uploadSharedFile(file, file.name || `${active.name}.pdf`);
      setDriveLink(link);
    } catch (e) {
      if ((e as Error)?.message === "link_sharing_blocked") {
        flash("드라이브 링크 공유가 제한돼 있어요");
      } else {
        flash("드라이브 업로드 실패 · 드라이브 연결을 확인하세요");
      }
    }
  };
  const shareDriveLink = async () => {
    if (!driveLink) return;
    const text = `${buildShareText()}\n\n📄 악보 PDF: ${driveLink}`;
    try {
      await navigator.share({ title: active.name, text });
      setDriveLink(null);
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") return;
      const ok = await copyText(text);
      setDriveLink(null);
      flash(ok ? "링크를 복사했어요 · 붙여넣어 공유하세요" : "공유에 실패했어요");
    }
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
      <div className="sticky top-14 md:top-0 z-10 flex items-center gap-2 border-b border-slate-100 bg-white/95 px-4 py-2.5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
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
          aria-label="새 콘티"
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-indigo-600 p-2 text-white active:bg-indigo-700"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
        <div className="relative shrink-0">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="콘티 관리"
            className="rounded-lg p-2 text-slate-500 active:bg-slate-100 dark:text-slate-300 dark:active:bg-slate-800"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" />
            </svg>
          </button>
          {menuOpen && (
            <>
              <button
                aria-hidden
                tabIndex={-1}
                onClick={() => setMenuOpen(false)}
                className="fixed inset-0 z-10 cursor-default"
              />
              <div className="absolute right-0 z-20 mt-1 w-36 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    const name = prompt("콘티 이름 변경", active.name);
                    if (name) renameConti(activeId, name);
                  }}
                  className="block w-full px-4 py-2 text-left text-sm text-slate-700 active:bg-slate-100 dark:text-slate-200 dark:active:bg-slate-700"
                >
                  이름 변경
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    markUsed(conti.map((c) => c.id));
                    flash("오늘 사용으로 기록됐어요");
                  }}
                  className="block w-full px-4 py-2 text-left text-sm text-slate-700 active:bg-slate-100 dark:text-slate-200 dark:active:bg-slate-700"
                >
                  사용 완료
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmClear(true);
                  }}
                  className="block w-full px-4 py-2 text-left text-sm text-rose-500 active:bg-rose-50 dark:active:bg-rose-500/10"
                >
                  비우기
                </button>
                <div className="my-1 border-t border-slate-100 dark:border-slate-700" />
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmDelete(true);
                  }}
                  className="block w-full px-4 py-2 text-left text-sm text-rose-500 active:bg-rose-50 dark:active:bg-rose-500/10"
                >
                  삭제
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {rows.length === 0 && (
        <div className="px-6 py-16 text-center">
          <p className="text-sm text-slate-400 dark:text-slate-500">
            이 콘티는 비어 있어요. 찬양목록에서 곡을 담아 보세요.
          </p>
          <Link to="/browse" className="mt-3 inline-block text-sm font-semibold text-indigo-600 dark:text-indigo-400">
            찬양목록 →
          </Link>
        </div>
      )}

      {/* ordered list */}
      <ol ref={listRef} className="space-y-1.5 px-3 pt-3">
        {rows.map((r, i) => {
          const used = lastUsed(r.id);
          const recentlyUsed = used && daysSince(used) <= 28;
          const att = attach[r.id];
          const youtube = att?.youtube;
          const sheetCount = att?.sheets?.length ?? 0;
          return (
            <li key={r.id}>
              <div
                onPointerDown={(e) => onRowPointerDown(e, r.id)}
                onPointerMove={onRowPointerMove}
                onPointerUp={onRowPointerEnd}
                onPointerCancel={onRowPointerEnd}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (dragIdRef.current) return; // mid-drag long-press, not a delete
                  if ((e.target as HTMLElement).closest("button, input, textarea, a, [data-drag-handle]")) return;
                  setConfirmRemove(r.id);
                }}
                className={
                  "flex select-none items-center gap-2 rounded-xl bg-slate-50 px-2 py-2 dark:bg-slate-800/50 " +
                  (dragId === r.id ? "opacity-70 ring-2 ring-indigo-400 shadow-lg" : "")
                }
              >
                <span
                  data-drag-handle
                  onPointerDown={(e) => onHandleDown(e, r.id)}
                  onPointerMove={onHandleMove}
                  onPointerUp={onHandleUp}
                  onPointerCancel={onHandleUp}
                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  style={{ touchAction: "none" }}
                  className="-my-2 flex w-8 shrink-0 cursor-grab touch-none flex-col items-center justify-center self-stretch text-slate-300 active:cursor-grabbing dark:text-slate-600"
                  title="끌어서 순서 변경"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <circle cx="8" cy="6" r="1.5" /><circle cx="16" cy="6" r="1.5" /><circle cx="8" cy="12" r="1.5" /><circle cx="16" cy="12" r="1.5" /><circle cx="8" cy="18" r="1.5" /><circle cx="16" cy="18" r="1.5" />
                  </svg>
                  <span className="mt-0.5 text-[11px] font-bold leading-none">{i + 1}</span>
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
                      {!open.has(r.id) && (youtube || sheetCount > 0) && (
                        <span className="flex shrink-0 items-center gap-1 text-slate-400 dark:text-slate-500">
                          {youtube && (
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
                      value={att?.note ?? ""}
                      onChange={(e) => setSongNote(r.id, e.target.value)}
                      onFocus={(e) => { memoElRef.current = e.currentTarget; memoSongRef.current = r.id; setMemoFocused(true); }}
                      onBlur={() => { memoElRef.current = null; memoSongRef.current = null; setMemoFocused(false); }}
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
                <button
                  onClick={() => setConfirmRemove(r.id)}
                  aria-label="콘티에서 삭제"
                  title="콘티에서 삭제"
                  className="-my-2 flex w-8 shrink-0 items-center justify-center self-stretch rounded-r-xl text-slate-300 active:bg-rose-50 active:text-rose-500 dark:text-slate-600 dark:active:bg-rose-500/10"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {open.has(r.id) && (
                <SongAttachEditor songId={r.id} songTitle={r.song.title} />
              )}
            </li>
          );
        })}
      </ol>

      {/* memo quick-insert presets — only while a memo is being edited */}
      {memoFocused && (
        <div className="mt-3 border-y border-slate-100 px-3 py-2 dark:border-slate-800">
          <div className="space-y-1.5">
            {MEMO_PRESET_ROWS.map((row, ri) => (
              <div key={ri} className="flex flex-wrap gap-1.5">
                {row.map((p) => (
                  <button
                    key={p}
                    onPointerDown={(e) => { e.preventDefault(); insertPreset(`${p} - `); }}
                    className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 active:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                  >
                    {p}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* footer: grouped actions */}
      {rows.length > 0 && (
        <div className="mt-8 space-y-2 px-4">
          {/* use now: view + playlist */}
          <div className="flex gap-2">
            <button
              onClick={() => setShowView(true)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 py-3 text-sm font-bold text-white active:bg-indigo-700"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
              콘티보기
            </button>
            {playlistUrl && (
              <a
                href={playlistUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => { e.preventDefault(); openYouTube(playlistUrl); }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-600 py-3 text-sm font-bold text-white active:bg-red-700"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.3 3.6-6.3 3.6Z" />
                </svg>
                플레이리스트
              </a>
            )}
          </div>

          {/* export: share + download */}
          <div className="flex gap-2">
            <button
              disabled={pdfBusy}
              onClick={async () => {
                setShareReady(null);
                setShareErr(null);
                setPdfBusy(true);
                flash("PDF를 만드는 중…");
                let built;
                try {
                  built = await buildContiPdf(active.name, conti, songById);
                } catch {
                  built = null;
                } finally {
                  setPdfBusy(false);
                }
                if (!built) {
                  flash("PDF 생성에 실패했어요");
                  return;
                }
                // try to share the PDF file directly; if it's blocked (installed
                // PWA, lost user-activation, or unsupported) flow straight into
                // the drive-link share — no extra tap.
                try {
                  if (navigator.canShare?.({ files: [built.file] })) {
                    await navigator.share({ files: [built.file] });
                    setToast(null);
                    return;
                  }
                } catch (e) {
                  const name = (e as { name?: string })?.name;
                  if (name === "AbortError") return; // user dismissed the share sheet
                  // any other error → fall through to the drive flow
                }
                if (driveEnabled()) {
                  await shareViaDrive(built.file);
                } else {
                  // no Drive: show the text-share fallback screen
                  setShareReady(built.file);
                  setShareErr("unsupported");
                }
              }}
              className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 active:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:active:bg-slate-800"
            >
              {pdfBusy ? "만드는 중…" : "콘티 공유"}
            </button>
            <button
              disabled={pdfBusy}
              onClick={async () => {
                setPdfBusy(true);
                flash("PDF를 만드는 중…");
                try {
                  const built = await buildContiPdf(active.name, conti, songById);
                  if (!built) flash("PDF 생성에 실패했어요");
                  else {
                    downloadContiFile(built.file);
                    flash("PDF를 다운로드했어요");
                  }
                } catch {
                  flash("PDF 생성에 실패했어요");
                } finally {
                  setPdfBusy(false);
                }
              }}
              className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 active:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:active:bg-slate-800"
            >
              다운로드
            </button>
          </div>
        </div>
      )}

      {shareReady && shareErr && (
        <>
          <button
            aria-hidden
            tabIndex={-1}
            onClick={() => { setShareReady(null); setShareErr(null); }}
            className="fixed inset-0 z-30 cursor-default bg-black/30"
          />
          <div className="fixed inset-x-0 bottom-24 z-40 flex flex-col items-center gap-3 px-4">
            <div className="max-w-xs rounded-lg bg-rose-600 px-3 py-2 text-center text-xs font-semibold leading-relaxed text-white shadow">
              앱에서는 PDF 파일 공유가 막혀 있어요.
              <br />
              텍스트로 공유하거나(악보 제외), 다운로드 후 파일에서 공유하세요.
            </div>
            <button
              onClick={async () => { await shareText(); setShareReady(null); setShareErr(null); }}
              className="flex items-center gap-2 rounded-full bg-indigo-600 px-6 py-3 text-sm font-bold text-white shadow-lg active:bg-indigo-700"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
              </svg>
              텍스트로 공유
            </button>
          </div>
        </>
      )}

      {driveLink && (
        <>
          <button
            aria-hidden
            tabIndex={-1}
            onClick={() => setDriveLink(null)}
            className="fixed inset-0 z-30 cursor-default bg-black/30"
          />
          <div className="fixed inset-x-0 bottom-24 z-40 flex flex-col items-center gap-3 px-4">
            <div className="max-w-xs rounded-lg bg-slate-800 px-3 py-2 text-center text-xs font-semibold leading-relaxed text-white shadow dark:bg-slate-700">
              드라이브에 PDF를 올렸어요.
              <br />
              아래 버튼으로 링크를 공유하세요.
            </div>
            <button
              onClick={shareDriveLink}
              className="flex items-center gap-2 rounded-full bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-lg active:bg-emerald-700"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
              </svg>
              드라이브 링크 공유
            </button>
          </div>
        </>
      )}

      {showView && (
        <ContiView name={active.name} items={conti} songById={songById} onClose={() => setShowView(false)} />
      )}

      {toast && !shareReady && !driveLink && (
        <div className="fixed inset-x-0 bottom-24 z-30 mx-auto w-fit rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-slate-200 dark:text-slate-900">
          {toast}
        </div>
      )}

      {confirmRemove && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-6"
          onClick={() => setConfirmRemove(null)}
        >
          <div
            className="w-full max-w-xs rounded-2xl bg-white p-5 text-center shadow-xl dark:bg-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">
              {songById.get(confirmRemove)?.title}
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">이 곡을 콘티에서 뺄까요?</p>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setConfirmRemove(null)}
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300"
              >
                취소
              </button>
              <button
                onClick={() => { remove(confirmRemove); setConfirmRemove(null); }}
                className="flex-1 rounded-lg bg-rose-600 py-2.5 text-sm font-semibold text-white active:bg-rose-700"
              >
                빼기
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmClear && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-6"
          onClick={() => setConfirmClear(false)}
        >
          <div
            className="w-full max-w-xs rounded-2xl bg-white p-5 text-center shadow-xl dark:bg-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
              콘티를 비우시겠습니까?
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              이 콘티의 곡이 모두 사라져요.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setConfirmClear(false)}
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300"
              >
                취소
              </button>
              <button
                onClick={() => { clear(); setConfirmClear(false); flash("콘티를 비웠어요"); }}
                className="flex-1 rounded-lg bg-rose-600 py-2.5 text-sm font-semibold text-white active:bg-rose-700"
              >
                비우기
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-6"
          onClick={() => setConfirmDelete(false)}
        >
          <div
            className="w-full max-w-xs rounded-2xl bg-white p-5 text-center shadow-xl dark:bg-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">
              {active.name}
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              이 콘티를 삭제할까요?
            </p>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300"
              >
                취소
              </button>
              <button
                onClick={() => { deleteConti(activeId); setConfirmDelete(false); }}
                className="flex-1 rounded-lg bg-rose-600 py-2.5 text-sm font-semibold text-white active:bg-rose-700"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
