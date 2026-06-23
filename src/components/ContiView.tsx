import { useEffect, useMemo, useRef, useState } from "react";
import type { Song } from "../types";
import type { ContiItem, SheetText } from "../lib/useConti";
import { removeSongSheet, replaceSongSheet, setSongSheetTexts, useSongAttach } from "../lib/songAttach";
import { youtubePlaylistUrl, openYouTube } from "../lib/share";
import { fetchSheetInteractive, loadSheet, removeSheetEverywhere, saveSheetFromFile } from "../lib/attachments";
import { driveEnabled } from "../lib/drive";
import { registerBack, useBackDismiss } from "../lib/backStack";
import { CropModal, SheetLightbox } from "./SongAttach";

type Page =
  | { kind: "info"; item: ContiItem; song: Song; aid?: string; n: number }
  | { kind: "sheet"; item: ContiItem; song: Song; aid: string; n: number };

/** In-app, read-only view of a conti (same content as the shared PDF). */
export default function ContiView({
  name,
  items,
  songById,
  onClose,
}: {
  name: string;
  items: ContiItem[];
  songById: Map<string, Song>;
  onClose: () => void;
}) {
  const attach = useSongAttach();
  const playlistUrl = youtubePlaylistUrl(items.map((c) => attach[c.id]?.youtube));
  const [mode, setMode] = useState<"scroll" | "page">("page");
  const [page, setPage] = useState(0);
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  const [sheetMenu, setSheetMenu] = useState<{ songId: string; aid: string } | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const cropTarget = useRef<{ songId: string; aid: string } | null>(null);
  const [textTarget, setTextTarget] = useState<{ songId: string; aid: string } | null>(null);
  useBackDismiss(sheetMenu != null, () => setSheetMenu(null));

  const startText = (songId: string, aid: string) => {
    setSheetMenu(null);
    setTextTarget({ songId, aid });
  };

  const startCrop = async (songId: string, aid: string) => {
    setSheetMenu(null);
    const dataUrl = (await loadSheet(aid)) ?? (await fetchSheetInteractive(aid));
    if (!dataUrl) return;
    try {
      const blob = await (await fetch(dataUrl)).blob();
      cropTarget.current = { songId, aid };
      setCropFile(new File([blob], "sheet.jpg", { type: blob.type || "image/jpeg" }));
    } catch {
      /* ignore */
    }
  };
  const onCropDone = async (newFile: File | null, crop?: { x: number; y: number; w: number; h: number }) => {
    const t = cropTarget.current;
    cropTarget.current = null;
    setCropFile(null);
    if (newFile && t) {
      const newAid = await saveSheetFromFile(newFile, songById.get(t.songId)?.title ?? "");
      replaceSongSheet(t.songId, t.aid, newAid, crop);
      removeSheetEverywhere(t.aid);
    }
  };
  const deleteSheet = (songId: string, aid: string) => {
    setSheetMenu(null);
    removeSongSheet(songId, aid);
    removeSheetEverywhere(aid);
  };

  const rows = useMemo(
    () =>
      items
        .map((it) => ({ item: it, song: songById.get(it.id) }))
        .filter((r): r is { item: ContiItem; song: Song } => Boolean(r.song)),
    [items, songById]
  );

  // flatten to PDF-like pages: info(+first sheet), then one page per extra sheet
  const pages = useMemo(() => {
    const p: Page[] = [];
    rows.forEach(({ item, song }, i) => {
      const sheets = attach[item.id]?.sheets ?? [];
      p.push({ kind: "info", item, song, aid: sheets[0], n: i + 1 });
      for (let k = 1; k < sheets.length; k++) p.push({ kind: "sheet", item, song, aid: sheets[k], n: i + 1 });
    });
    return p;
  }, [rows, attach]);
  const total = pages.length;

  // ---- close on mobile back / Esc ----
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const closedRef = useRef(false);
  const dismissRef = useRef<((popHistory: boolean) => void) | null>(null);
  const close = () => {
    if (closedRef.current) return;
    closedRef.current = true;
    onCloseRef.current();
    dismissRef.current?.(true);
  };
  useEffect(() => {
    dismissRef.current = registerBack(() => {
      if (closedRef.current) return;
      closedRef.current = true;
      onCloseRef.current();
    });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      dismissRef.current?.(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = (d: number) => setPage((p) => Math.min(total - 1, Math.max(0, p + d)));
  useEffect(() => {
    if (page > total - 1) setPage(Math.max(0, total - 1));
  }, [total, page]);
  useEffect(() => {
    if (mode !== "page") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, total]);

  const cur = pages[page];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-slate-900 dark:text-slate-50">{name}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">{rows.length}곡</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {/* scroll / page toggle */}
          <div className="flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
            <button
              onClick={() => setMode("scroll")}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                mode === "scroll" ? "bg-white text-indigo-600 shadow-sm dark:bg-slate-700 dark:text-indigo-300" : "text-slate-500 dark:text-slate-400"
              }`}
            >
              스크롤
            </button>
            <button
              onClick={() => setMode("page")}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                mode === "page" ? "bg-white text-indigo-600 shadow-sm dark:bg-slate-700 dark:text-indigo-300" : "text-slate-500 dark:text-slate-400"
              }`}
            >
              한 장씩
            </button>
          </div>
          {playlistUrl && (
            <a
              href={playlistUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => { e.preventDefault(); openYouTube(playlistUrl); }}
              aria-label="유튜브 재생목록"
              className="rounded-full p-1 text-red-600 active:bg-red-50 dark:text-red-500"
            >
              <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.3 3.6-6.3 3.6Z" />
              </svg>
            </a>
          )}
          <button
            onClick={close}
            aria-label="닫기"
            className="rounded-full p-1.5 text-slate-500 active:bg-slate-100 dark:text-slate-300 dark:active:bg-slate-800"
          >
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {mode === "scroll" ? (
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-8 px-4 py-6 pb-24">
            {rows.map(({ item, song }, i) => (
              <SongBlock
                key={item.id}
                item={item}
                song={song}
                n={i + 1}
                attach={attach}
                onMenu={(aid) => setSheetMenu({ songId: item.id, aid })}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="relative flex-1 overflow-hidden">
          <div
            className="flex h-full justify-center px-3 py-3"
            style={{ touchAction: "pan-y" }}
            onPointerDown={(e) => {
              if (e.pointerType !== "touch") return;
              swipeRef.current = { x: e.clientX, y: e.clientY };
            }}
            onPointerUp={(e) => {
              const s = swipeRef.current;
              swipeRef.current = null;
              if (!s) return;
              const dx = e.clientX - s.x;
              const dy = e.clientY - s.y;
              if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
            }}
            onPointerCancel={() => {
              swipeRef.current = null;
            }}
          >
            <div className="flex h-full w-full max-w-3xl flex-col">
              {cur &&
                (cur.kind === "info" ? (
                  <>
                    <div className="shrink-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xl font-extrabold text-indigo-300 dark:text-indigo-400/70">{cur.n}</span>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50">{cur.song.title}</h2>
                        {(cur.item.key || cur.song.keys.length > 0) && (
                          <span className="text-sm font-bold text-indigo-600 dark:text-indigo-300">
                            {cur.item.key ? cur.item.key : cur.song.keys.join(" / ")}
                          </span>
                        )}
                      </div>
                      {attach[cur.item.id]?.note && (
                        <p className="ml-7 mt-1 whitespace-pre-wrap text-lg text-slate-600 dark:text-slate-300">
                          {attach[cur.item.id]!.note}
                        </p>
                      )}
                    </div>
                    {cur.aid && (
                      <div className="mt-3 min-h-0 flex-1">
                        <SheetFigure
                          key={cur.aid}
                          aid={cur.aid}
                          texts={attach[cur.item.id]?.sheetTexts?.[cur.aid] ?? []}
                          fit
                          onMenu={() => setSheetMenu({ songId: cur.item.id, aid: cur.aid! })}
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="mb-1 flex shrink-0 items-baseline gap-2">
                      <span className="text-sm font-bold text-indigo-300 dark:text-indigo-400/70">{cur.n}</span>
                      <span className="truncate text-sm font-semibold text-slate-500 dark:text-slate-400">{cur.song.title}</span>
                    </div>
                    <div className="min-h-0 flex-1">
                      <SheetFigure
                        key={cur.aid}
                        aid={cur.aid}
                        texts={attach[cur.item.id]?.sheetTexts?.[cur.aid] ?? []}
                        fit
                        onMenu={() => setSheetMenu({ songId: cur.item.id, aid: cur.aid })}
                      />
                    </div>
                  </>
                ))}
            </div>
          </div>

          {total > 1 && (
            <>
              <button
                onClick={() => go(-1)}
                disabled={page === 0}
                aria-label="이전"
                className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-slate-900/10 p-2 text-slate-700 active:bg-slate-900/20 disabled:opacity-30 dark:bg-white/10 dark:text-slate-200"
              >
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                </svg>
              </button>
              <button
                onClick={() => go(1)}
                disabled={page >= total - 1}
                aria-label="다음"
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-slate-900/10 p-2 text-slate-700 active:bg-slate-900/20 disabled:opacity-30 dark:bg-white/10 dark:text-slate-200"
              >
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </button>
              <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-slate-900/70 px-3 py-1 text-xs font-semibold text-white">
                {page + 1} / {total}
              </span>
            </>
          )}
        </div>
      )}

      {sheetMenu && (
        <div
          className="fixed inset-0 z-[55] flex items-end justify-center bg-black/50 p-3 backdrop-blur-sm"
          onClick={() => setSheetMenu(null)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-white p-4 shadow-2xl ring-1 ring-black/5 dark:bg-slate-800 dark:ring-white/10"
            onClick={(e) => e.stopPropagation()}
            style={{ animation: "wlSheetUp .18s ease-out" }}
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-200 dark:bg-slate-600" />
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => startCrop(sheetMenu.songId, sheetMenu.aid)}
                className="flex flex-col items-center gap-1.5 rounded-2xl bg-slate-50 py-4 text-slate-700 transition active:scale-95 active:bg-slate-100 dark:bg-slate-700/50 dark:text-slate-200 dark:active:bg-slate-700"
              >
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                  <circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 8l12 8M8 16L20 8" />
                </svg>
                <span className="text-sm font-semibold">자르기</span>
              </button>
              <button
                onClick={() => startText(sheetMenu.songId, sheetMenu.aid)}
                className="flex flex-col items-center gap-1.5 rounded-2xl bg-slate-50 py-4 text-slate-700 transition active:scale-95 active:bg-slate-100 dark:bg-slate-700/50 dark:text-slate-200 dark:active:bg-slate-700"
              >
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 7V5.5h16V7M12 5.5V19m-3 0h6" />
                </svg>
                <span className="text-sm font-semibold">텍스트</span>
              </button>
              <button
                onClick={() => setSheetMenu(null)}
                className="flex flex-col items-center gap-1.5 rounded-2xl bg-slate-50 py-4 text-slate-500 transition active:scale-95 active:bg-slate-100 dark:bg-slate-700/50 dark:text-slate-400 dark:active:bg-slate-700"
              >
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
                <span className="text-sm font-semibold">취소</span>
              </button>
              <button
                onClick={() => deleteSheet(sheetMenu.songId, sheetMenu.aid)}
                className="flex flex-col items-center gap-1.5 rounded-2xl bg-rose-50 py-4 text-rose-600 transition active:scale-95 active:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400 dark:active:bg-rose-500/20"
              >
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7m-7 0 .7 11a2 2 0 0 0 2 1.9h2.6a2 2 0 0 0 2-1.9L17 7" />
                </svg>
                <span className="text-sm font-semibold">삭제</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {cropFile && <CropModal file={cropFile} onDone={onCropDone} />}

      {textTarget && (
        <SheetLightbox
          ids={[textTarget.aid]}
          start={0}
          texts={{ [textTarget.aid]: attach[textTarget.songId]?.sheetTexts?.[textTarget.aid] ?? [] }}
          onTexts={(aid, list) => setSongSheetTexts(textTarget.songId, aid, list)}
          onClose={() => setTextTarget(null)}
        />
      )}
    </div>
  );
}

function SongBlock({
  item,
  song,
  n,
  attach,
  firstSheetOnly = false,
  onMenu,
}: {
  item: ContiItem;
  song: Song;
  n: number;
  attach: ReturnType<typeof useSongAttach>;
  firstSheetOnly?: boolean;
  onMenu?: (aid: string) => void;
}) {
  const a = attach[item.id];
  const keys = item.key ? item.key : song.keys.join(" / ");
  const sheets = a?.sheets ?? [];
  const shown = firstSheetOnly ? sheets.slice(0, 1) : sheets;
  return (
    <section>
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-extrabold text-indigo-300 dark:text-indigo-400/70">{n}</span>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50">{song.title}</h2>
        {keys && <span className="text-sm font-bold text-indigo-600 dark:text-indigo-300">{keys}</span>}
      </div>
      {a?.note && (
        <p className="ml-7 mt-1 whitespace-pre-wrap text-lg text-slate-600 dark:text-slate-300">{a.note}</p>
      )}
      {shown.map((aid) => (
        <SheetFigure
          key={aid}
          aid={aid}
          texts={a?.sheetTexts?.[aid] ?? []}
          onMenu={onMenu ? () => onMenu(aid) : undefined}
        />
      ))}
    </section>
  );
}

function SheetFigure({
  aid,
  texts,
  fit = false,
  onMenu,
}: {
  aid: string;
  texts: SheetText[];
  fit?: boolean;
  onMenu?: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [needsSync, setNeedsSync] = useState(false);
  const [w, setW] = useState(0);
  const [box, setBox] = useState<{ l: number; t: number; w: number; h: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    loadSheet(aid).then((u) => {
      if (!alive) return;
      if (u) setUrl(u);
      else setNeedsSync(driveEnabled());
    });
    return () => {
      alive = false;
    };
  }, [aid]);

  const measure = () => {
    const img = imgRef.current;
    if (!img) return;
    if (fit && wrapRef.current) {
      const ir = img.getBoundingClientRect();
      const cr = wrapRef.current.getBoundingClientRect();
      setBox({ l: ir.left - cr.left, t: ir.top - cr.top, w: ir.width, h: ir.height });
    } else {
      setW(img.clientWidth);
    }
  };
  useEffect(() => {
    measure();
    // re-measure after layout settles (flex / fold / address-bar changes)
    const raf = requestAnimationFrame(measure);
    let ro: ResizeObserver | undefined;
    if (fit && wrapRef.current && "ResizeObserver" in window) {
      ro = new ResizeObserver(() => measure());
      ro.observe(wrapRef.current);
    }
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const sync = async () => {
    const u = await fetchSheetInteractive(aid);
    if (u) {
      setNeedsSync(false);
      setUrl(u);
    }
  };

  const overlay = (width: number) =>
    texts.map((t, i) => (
      <span
        key={i}
        style={{
          position: "absolute",
          left: `${t.x * 100}%`,
          top: `${t.y * 100}%`,
          transform: "translate(-50%, -50%)",
          color: t.color,
          fontSize: width ? t.size * width : 16,
          fontWeight: 700,
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}
      >
        {t.text}
      </span>
    ));

  if (url && fit) {
    return (
      <div ref={wrapRef} className="relative flex h-full w-full items-center justify-center">
        <img
          ref={imgRef}
          src={url}
          alt="악보"
          onLoad={measure}
          onContextMenu={onMenu ? (e) => { e.preventDefault(); onMenu(); } : undefined}
          className="block max-h-full max-w-full"
        />
        {box && (
          <div className="pointer-events-none absolute" style={{ left: box.l, top: box.t, width: box.w, height: box.h }}>
            {overlay(box.w)}
          </div>
        )}
      </div>
    );
  }
  if (url) {
    return (
      <div className="relative ml-7 mt-3">
        <img
          ref={imgRef}
          src={url}
          alt="악보"
          onLoad={measure}
          onContextMenu={onMenu ? (e) => { e.preventDefault(); onMenu(); } : undefined}
          className="block w-full"
        />
        {overlay(w)}
      </div>
    );
  }
  if (needsSync) {
    return (
      <div className={fit ? "flex h-full items-center justify-center" : ""}>
        <button
          onClick={sync}
          className={(fit ? "" : "ml-7 mt-3 ") + "rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-indigo-600 dark:bg-slate-800 dark:text-indigo-400"}
        >
          악보 불러오기
        </button>
      </div>
    );
  }
  return (
    <div
      className={(fit ? "h-full" : "ml-7 mt-3 h-24") + " animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800"}
    />
  );
}
