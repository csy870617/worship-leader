import { useEffect, useRef, useState } from "react";
import type { SheetStroke, SheetText } from "../lib/useConti";
import {
  addSongSheet,
  removeSongSheet,
  replaceSongSheet,
  setSongMemo,
  setSongNote,
  setSongSheets,
  setSongSheetKey,
  setSongSheetDraws,
  setSongSheetTexts,
  setSongYoutube,
  useSongAttach,
} from "../lib/songAttach";
import {
  fetchSheetInteractive,
  fetchSheetInteractiveResult,
  loadSheet,
  removeSheetEverywhere,
  saveSheetFromFile,
} from "../lib/attachments";
import { driveEnabled } from "../lib/drive";
import { getSongById } from "../lib/catalog";
import { copyText, openExternal, openYouTube } from "../lib/share";
import { sheetSearchUrl } from "../data";
import { registerBack, useBackDismiss } from "../lib/backStack";
import { PRESET_ROWS } from "../lib/songForm";

// vivid, near-primary swatches (the previous yellow read as a dull mustard)
const TEXT_COLORS = ["#ff1e1e", "#000000", "#ffffff", "#1a4bff", "#00b81d", "#ffe600"];
const TEXT_SIZES: { label: string; value: number }[] = [
  { label: "아주작게", value: 0.02 },
  { label: "작게", value: 0.03 },
  { label: "보통", value: 0.045 },
  { label: "크게", value: 0.07 },
];
// stroke widths (fraction of image width) for 아주작게/작게/보통/크게, per tool
const PEN_WIDTHS = [0.0025, 0.004, 0.008, 0.014];
const HL_WIDTHS = [0.02, 0.03, 0.05, 0.08];
const HL_DEFAULT_COLOR = "#ffe600"; // yellow marker
const PEN_DEFAULT_COLOR = "#ff1e1e"; // red pen

// one undo/redo history entry — the full annotation state of a single sheet
type Snapshot = { annos: SheetText[]; strokes: SheetStroke[] };

/** Self-contained editor for a song's memo / YouTube link / sheet music. */
export default function SongAttachEditor({
  songId,
  songTitle,
  withMemo = false,
  className = "mt-1 ml-7 space-y-3 rounded-xl border border-slate-100 bg-white p-3 dark:border-slate-800 dark:bg-slate-900",
}: {
  songId: string;
  songTitle: string;
  withMemo?: boolean;
  className?: string;
}) {
  const attach = useSongAttach();
  const a = attach[songId];
  const youtubeUrl = a?.youtube;
  const sheetIds = a?.sheets ?? [];
  const sheetTexts = a?.sheetTexts ?? {};
  // a song with several keys can hold a separate sheet per key
  const songKeys = getSongById(songId)?.keys ?? [];
  const sheetKeys = a?.sheetKeys ?? {};

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);
  // queued crops carry an id: the crop dialog must be a *fresh* component per
  // file (it latches "closed" once done), so the id drives its React key
  const [cropQueue, setCropQueue] = useState<{ id: string; file: File }[]>([]);
  const [sheetMenu, setSheetMenu] = useState<string | null>(null);
  const [recrop, setRecrop] = useState<{ aid: string; file: File } | null>(null);
  const cropSeq = useRef(0);
  useBackDismiss(sheetMenu != null, () => setSheetMenu(null));

  // ---- drag-to-reorder sheets via a grip handle (same proven pattern as the
  // conti list: pointer-capture on the handle + rect hit-testing). Works for
  // mouse and touch; tapping the thumbnail still opens it. ----
  const [dragAid, setDragAid] = useState<string | null>(null);
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const dragAidRef = useRef<string | null>(null);
  const dragOrderRef = useRef<string[] | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const orderedIds = dragOrder ?? sheetIds;

  const aidFromPoint = (x: number, y: number): string | null => {
    const els = gridRef.current?.querySelectorAll<HTMLElement>("[data-thumb-aid]");
    if (!els) return null;
    for (const el of Array.from(els)) {
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        return el.getAttribute("data-thumb-aid");
      }
    }
    return null;
  };
  const onGripDown = (e: React.PointerEvent, aid: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.pointerType === "mouse" && e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    dragAidRef.current = aid;
    dragOrderRef.current = sheetIds.slice();
    setDragAid(aid);
    setDragOrder(sheetIds.slice());
  };
  const onGripMove = (e: React.PointerEvent) => {
    if (!dragAidRef.current || !dragOrderRef.current) return;
    const over = aidFromPoint(e.clientX, e.clientY);
    if (!over || over === dragAidRef.current) return;
    const order = dragOrderRef.current.slice();
    const from = order.indexOf(dragAidRef.current);
    const to = order.indexOf(over);
    if (from < 0 || to < 0) return;
    order.splice(to, 0, order.splice(from, 1)[0]);
    dragOrderRef.current = order;
    setDragOrder(order);
  };
  const onGripUp = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    const order = dragOrderRef.current;
    dragAidRef.current = null;
    dragOrderRef.current = null;
    setDragAid(null);
    setDragOrder(null);
    if (!order) return;
    // re-apply the drag's ordering to the *current* sheetIds instead of
    // committing the drag-start snapshot verbatim — otherwise a sheet
    // added/removed by a concurrent sync mid-drag would be silently reverted
    const rank = new Map(order.map((id, i) => [id, i]));
    const next = sheetIds.slice().sort((a, b) => {
      const ra = rank.get(a);
      const rb = rank.get(b);
      if (ra != null && rb != null) return ra - rb;
      if (ra != null) return -1;
      if (rb != null) return 1;
      return 0;
    });
    if (next.some((x, i) => x !== sheetIds[i])) setSongSheets(songId, next);
  };

  const startRecrop = async (aid: string) => {
    setSheetMenu(null);
    const dataUrl = (await loadSheet(aid)) ?? (await fetchSheetInteractive(aid));
    if (!dataUrl) return;
    try {
      const blob = await (await fetch(dataUrl)).blob();
      setRecrop({ aid, file: new File([blob], "sheet.jpg", { type: blob.type || "image/jpeg" }) });
    } catch {
      /* ignore */
    }
  };
  const onRecropDone = async (newFile: File | null, crop?: { x: number; y: number; w: number; h: number }) => {
    const t = recrop;
    setRecrop(null);
    if (newFile && t) {
      const newAid = await saveSheetFromFile(newFile, songTitle);
      replaceSongSheet(songId, t.aid, newAid, crop);
      removeSheetEverywhere(t.aid);
    }
  };
  const deleteSheetFromMenu = (aid: string) => {
    setSheetMenu(null);
    setViewer(null);
    removeSongSheet(songId, aid);
    removeSheetEverywhere(aid);
  };

  const onFiles = (files: FileList | null) => {
    if (!files) return;
    const imgs = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) return;
    setCropQueue((q) => [
      ...q,
      ...imgs.map((file, i) => ({ id: `cq_${Date.now().toString(36)}_${cropSeq.current + i}`, file })),
    ]);
    cropSeq.current += imgs.length;
  };
  const onCropDone = async (cropped: File | null) => {
    // always advance the queue, even if a save fails, so the crop view can't get stuck
    if (cropped) {
      setBusy(true);
      setErr(null);
      try {
        const aid = await saveSheetFromFile(cropped, songTitle);
        addSongSheet(songId, aid);
      } catch {
        setErr("악보 저장에 실패했어요");
      } finally {
        setBusy(false);
      }
    }
    setCropQueue((q) => q.slice(1));
  };

  return (
    <div className={className}>
      {withMemo && (
        <>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              송폼
            </label>
            <textarea
              value={a?.note ?? ""}
              onChange={(e) => setSongNote(songId, e.target.value)}
              rows={2}
              placeholder="송폼 입력"
              className="w-full resize-y rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              메모
            </label>
            <textarea
              value={a?.memo ?? ""}
              onChange={(e) => setSongMemo(songId, e.target.value)}
              rows={2}
              placeholder="메모 추가"
              className="w-full resize-y rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
          </div>
        </>
      )}

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
            key={songId}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== (youtubeUrl ?? "")) setSongYoutube(songId, v || null);
            }}
            placeholder="https://youtu.be/..."
            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          />
          {youtubeUrl && (
            <a
              href={youtubeUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => { e.preventDefault(); openYouTube(youtubeUrl); }}
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
        {orderedIds.length > 0 && (
          <div ref={gridRef} className="mb-2 flex flex-wrap gap-2">
            {orderedIds.map((aid, idx) => (
              <div key={aid} className="flex flex-col items-center gap-1">
              <div
                data-thumb-aid={aid}
                className={
                  "relative rounded-lg transition-transform duration-150 " +
                  (dragAid === aid
                    ? "z-10 scale-105 shadow-xl ring-2 ring-indigo-500"
                    : dragAid
                    ? "opacity-70"
                    : "")
                }
              >
                <SheetThumb
                  aid={aid}
                  onOpen={() => setViewer(idx)}
                  onRemove={() => {
                    removeSongSheet(songId, aid);
                    removeSheetEverywhere(aid);
                  }}
                />
                {orderedIds.length > 1 && (
                  <span className="pointer-events-none absolute left-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-bold leading-none text-white shadow">
                    {idx + 1}
                  </span>
                )}
                {sheetKeys[aid] && (
                  <span className="pointer-events-none absolute right-0.5 top-0.5 rounded-md bg-emerald-600 px-1 text-[10px] font-bold leading-4 text-white shadow">
                    {sheetKeys[aid]}
                  </span>
                )}
                {orderedIds.length > 1 && (
                  <span
                    onPointerDown={(e) => onGripDown(e, aid)}
                    onPointerMove={onGripMove}
                    onPointerUp={onGripUp}
                    onPointerCancel={onGripUp}
                    title="끌어서 순서 변경"
                    style={{ touchAction: "none" }}
                    className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex cursor-grab items-center justify-center rounded-md bg-slate-900/70 px-1.5 py-0.5 text-white active:cursor-grabbing"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <circle cx="8" cy="7" r="1.4" /><circle cx="16" cy="7" r="1.4" />
                      <circle cx="8" cy="12" r="1.4" /><circle cx="16" cy="12" r="1.4" />
                      <circle cx="8" cy="17" r="1.4" /><circle cx="16" cy="17" r="1.4" />
                    </svg>
                  </span>
                )}
              </div>
              {/* which key this sheet is for — only for songs with several keys.
                  "공통" (no key) keeps the sheet visible for every key. */}
              {songKeys.length > 1 && (
                <div className="flex flex-wrap justify-center gap-1">
                  <button
                    onClick={() => setSongSheetKey(songId, aid, null)}
                    title="모든 코드에서 보임"
                    className={
                      "rounded px-1.5 py-0.5 text-[10px] font-bold " +
                      (!sheetKeys[aid]
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400")
                    }
                  >
                    공통
                  </button>
                  {songKeys.map((k) => (
                    <button
                      key={k}
                      onClick={() => setSongSheetKey(songId, aid, k)}
                      title={`${k} 코드를 고른 콘티에서만 보임`}
                      className={
                        "rounded px-1.5 py-0.5 text-[10px] font-bold " +
                        (sheetKeys[aid] === k
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400")
                      }
                    >
                      {k}
                    </button>
                  ))}
                </div>
              )}
              </div>
            ))}
          </div>
        )}
        {viewer !== null && (
          <SheetLightbox
            ids={sheetIds}
            start={viewer}
            texts={sheetTexts}
            draws={a?.sheetDraws ?? {}}
            note={a?.note}
            memo={a?.memo}
            onNote={(v) => setSongNote(songId, v)}
            onMemo={(v) => setSongMemo(songId, v)}
            onTexts={(aid, list) => setSongSheetTexts(songId, aid, list)}
            onDraws={(aid, list) => setSongSheetDraws(songId, aid, list)}
            onMenu={(aid) => setSheetMenu(aid)}
            onClose={() => setViewer(null)}
          />
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* a real <label> wrapping the input: tapping anywhere on the label
              natively activates the file input, which is the most reliable way to
              open the picker across Android/iOS (an opacity-0 overlaid input can
              silently swallow the tap on some Android browsers) */}
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
              aria-label="악보 사진 선택"
              onChange={(e) => {
                onFiles(e.target.files);
                e.target.value = "";
              }}
              className="sr-only"
            />
          </label>
          {/* find a sheet to add: Google image search for "<곡 제목> 악보".
              openExternal so it also works from the installed app. */}
          <button
            onClick={() => openExternal(sheetSearchUrl(songTitle))}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 active:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
            </svg>
            악보 검색
          </button>
        </div>
        {err && <p className="mt-1 text-[11px] font-medium text-rose-500">{err}</p>}
      </div>

      {cropQueue.length > 0 && (
        <CropModal key={cropQueue[0].id} file={cropQueue[0].file} onDone={onCropDone} />
      )}
      {recrop && <CropModal file={recrop.file} onDone={onRecropDone} />}

      {sheetMenu && (
        <div
          className="fixed inset-0 z-[55] flex items-end justify-center bg-black/40 p-4"
          onClick={() => setSheetMenu(null)}
        >
          <div
            className="w-full max-w-xs space-y-1.5 rounded-2xl bg-white p-2 shadow-xl dark:bg-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => startRecrop(sheetMenu)}
              className="block w-full rounded-xl px-4 py-3 text-center text-sm font-semibold text-slate-700 active:bg-slate-100 dark:text-slate-200 dark:active:bg-slate-700"
            >
              자르기
            </button>
            <button
              onClick={() => deleteSheetFromMenu(sheetMenu)}
              className="block w-full rounded-xl px-4 py-3 text-center text-sm font-semibold text-rose-500 active:bg-rose-50 dark:active:bg-rose-500/10"
            >
              삭제
            </button>
            <button
              onClick={() => setSheetMenu(null)}
              className="block w-full rounded-xl px-4 py-3 text-center text-sm font-semibold text-slate-500 active:bg-slate-100 dark:text-slate-400 dark:active:bg-slate-700"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function CropModal({
  file,
  onDone,
}: {
  file: File;
  onDone: (cropped: File | null, crop?: { x: number; y: number; w: number; h: number }) => void;
}) {
  const [src, setSrc] = useState("");
  const imgRef = useRef<HTMLImageElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  // start with the whole image selected — most sheets need no cropping at all
  const [rect, setRect] = useState({ x: 0, y: 0, w: 1, h: 1 });
  const dragRef = useRef<{ mode: string; sx: number; sy: number; sr: typeof rect } | null>(null);
  const [working, setWorking] = useState(false);
  const MIN = 0.08;

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // mobile back button cancels the crop instead of leaving the page
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const closedRef = useRef(false);
  const dismissRef = useRef<((popHistory: boolean) => void) | null>(null);
  const finish = (result: File | null, crop?: { x: number; y: number; w: number; h: number }) => {
    if (closedRef.current) return;
    closedRef.current = true;
    onDoneRef.current(result, crop);
    dismissRef.current?.(true);
  };
  // Re-arm for every file: when several photos are cropped in a row the dialog
  // can be handed the next file without unmounting, and a latched closedRef (or
  // a spent back-registration) would leave its buttons dead.
  useEffect(() => {
    closedRef.current = false;
    setRect({ x: 0, y: 0, w: 1, h: 1 });
    setWorking(false);
    dismissRef.current = registerBack(() => {
      if (closedRef.current) return;
      closedRef.current = true;
      onDoneRef.current(null);
    });
    return () => dismissRef.current?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
  const rel = (clientX: number, clientY: number) => {
    const r = boxRef.current!.getBoundingClientRect();
    return { x: clamp((clientX - r.left) / r.width), y: clamp((clientY - r.top) / r.height) };
  };

  const startDrag = (e: React.PointerEvent, mode: string) => {
    e.stopPropagation();
    boxRef.current?.setPointerCapture?.(e.pointerId);
    const p = rel(e.clientX, e.clientY);
    dragRef.current = { mode, sx: p.x, sy: p.y, sr: rect };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const p = rel(e.clientX, e.clientY);
    if (d.mode === "move") {
      setRect({
        ...d.sr,
        x: clamp(d.sr.x + (p.x - d.sx), 0, 1 - d.sr.w),
        y: clamp(d.sr.y + (p.y - d.sy), 0, 1 - d.sr.h),
      });
    } else {
      let left = d.sr.x;
      let top = d.sr.y;
      let right = d.sr.x + d.sr.w;
      let bottom = d.sr.y + d.sr.h;
      if (d.mode.includes("w")) left = Math.min(p.x, right - MIN);
      if (d.mode.includes("e")) right = Math.max(p.x, left + MIN);
      if (d.mode.includes("n")) top = Math.min(p.y, bottom - MIN);
      if (d.mode.includes("s")) bottom = Math.max(p.y, top + MIN);
      setRect({ x: left, y: top, w: right - left, h: bottom - top });
    }
  };
  const onUp = () => {
    dragRef.current = null;
  };

  const apply = async () => {
    const img = imgRef.current;
    if (!img || !img.naturalWidth) return finish(null);
    setWorking(true);
    const { x, y, w, h } = rect;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    const cw = Math.max(1, Math.round(w * nw));
    const ch = Math.max(1, Math.round(h * nh));
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, Math.round(x * nw), Math.round(y * nh), cw, ch, 0, 0, cw, ch);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.92));
    setWorking(false);
    finish(blob ? new File([blob], "sheet.jpg", { type: "image/jpeg" }) : null, { x, y, w, h });
  };

  const corner = (c: string): React.CSSProperties => ({
    position: "absolute",
    ...(c.includes("n") ? { top: -11 } : { bottom: -11 }),
    ...(c.includes("w") ? { left: -11 } : { right: -11 }),
    cursor: `${c}-resize`,
  });

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/90 p-4">
      <p className="mb-2 text-center text-sm text-white/80">프레임을 옮기고 모서리로 크기를 맞추세요</p>
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div
          ref={boxRef}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className="relative inline-block touch-none select-none"
        >
          {src && <img ref={imgRef} src={src} alt="악보" draggable={false} className="block max-h-[68vh] max-w-full" />}
          <div
            onPointerDown={(e) => startDrag(e, "move")}
            className="absolute cursor-move border-2 border-white"
            style={{
              left: `${rect.x * 100}%`,
              top: `${rect.y * 100}%`,
              width: `${rect.w * 100}%`,
              height: `${rect.h * 100}%`,
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)",
            }}
          >
            {["nw", "ne", "sw", "se"].map((c) => (
              <div
                key={c}
                onPointerDown={(e) => startDrag(e, c)}
                style={corner(c)}
                className="h-6 w-6 rounded-full border-2 border-white bg-indigo-500"
              />
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-center gap-2">
        <button
          onClick={() => finish(null)}
          className="rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white"
        >
          취소
        </button>
        <button
          onClick={() => setRect({ x: 0, y: 0, w: 1, h: 1 })}
          className="rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white"
        >
          전체
        </button>
        <button
          onClick={apply}
          disabled={working}
          className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          {working ? "처리 중…" : "이 영역 사용"}
        </button>
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
  // "unavailable" = no local cache and Drive isn't usable right now (signed
  // out, or the file is genuinely gone) — shown as a tappable retry instead
  // of a permanent placeholder
  const [state, setState] = useState<"loading" | "ready" | "needsSync" | "unavailable">("loading");

  useEffect(() => {
    let alive = true;
    setState("loading");
    loadSheet(aid).then((u) => {
      if (!alive) return;
      if (u) {
        setUrl(u);
        setState("ready");
      } else {
        setState(driveEnabled() ? "needsSync" : "unavailable");
      }
    });
    return () => {
      alive = false;
    };
  }, [aid]);

  const retry = async () => {
    setState("loading");
    const u = await loadSheet(aid);
    if (u) {
      setUrl(u);
      setState("ready");
    } else {
      setState(driveEnabled() ? "needsSync" : "unavailable");
    }
  };

  const sync = async () => {
    setState("loading");
    const r = await fetchSheetInteractiveResult(aid);
    if (r.url) {
      setUrl(r.url);
      setState("ready");
    } else {
      setState(r.missing ? "unavailable" : "needsSync");
    }
  };

  return (
    <div className="relative h-20 w-16 overflow-hidden rounded-lg bg-slate-50 dark:bg-slate-800">
      {state === "ready" && url ? (
        <button onClick={onOpen} className="block h-full w-full" title="크게 보기">
          <img src={url} alt="악보" draggable={false} className="h-full w-full object-cover" />
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
      ) : state === "unavailable" ? (
        <button
          onClick={retry}
          className="flex h-full w-full items-center justify-center text-[10px] text-slate-400"
          title="다시 시도"
        >
          …
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

/** Dark, auto-growing 송폼/메모 field shown above the sheet in the lightbox. */
function LightboxNote({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange?: (v: string) => void;
  placeholder: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  useEffect(resize, [value]);
  if (!onChange) {
    return value ? (
      <p className="max-w-full whitespace-pre-wrap text-center text-sm text-white/80">{value}</p>
    ) : null;
  }
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onInput={resize}
      rows={1}
      placeholder={placeholder}
      className="w-full resize-none overflow-hidden rounded-lg bg-white/10 px-3 py-1.5 text-center text-sm text-white/90 outline-none placeholder:text-white/40 focus:bg-white/15"
    />
  );
}

export function SheetLightbox({
  ids,
  start,
  texts,
  draws,
  note,
  memo,
  onNote,
  onMemo,
  onTexts,
  onDraws,
  onMenu,
  onClose,
}: {
  ids: string[];
  start: number;
  texts: Record<string, SheetText[]>;
  draws?: Record<string, SheetStroke[]>;
  note?: string;
  memo?: string;
  onNote?: (v: string) => void;
  onMemo?: (v: string) => void;
  onTexts: (aid: string, list: SheetText[]) => void;
  onDraws?: (aid: string, list: SheetStroke[]) => void;
  onMenu?: (aid: string) => void;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(start);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [annos, setAnnos] = useState<SheetText[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  // active annotation tool: text placement, highlighter, freehand pen,
  // straight line, eraser, or none
  const [tool, setTool] = useState<"text" | "highlight" | "draw" | "line" | "erase" | null>(null);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [color, setColor] = useState(TEXT_COLORS[0]);
  const [sizeIdx, setSizeIdx] = useState(1); // 기본 글자 크기 '작게' (0은 '아주작게')
  const [boxW, setBoxW] = useState(0);
  const [boxH, setBoxH] = useState(0);
  const [strokes, setStrokes] = useState<SheetStroke[]>([]);
  const [liveStroke, setLiveStroke] = useState<{ x: number; y: number }[] | null>(null);
  // in-place text input: type directly on the sheet at (x,y). i=null → new text,
  // i>=0 → editing an existing annotation.
  const [editing, setEditing] = useState<{ i: number | null; x: number; y: number; value: string } | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [hasCopied, setHasCopied] = useState(false); // a text was copied → show 붙여넣기
  const boxRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLInputElement>(null);
  // canvas 2D context reused to measure the in-place edit text's real width
  const measureCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const annosRef = useRef<SheetText[]>([]);
  const strokesRef = useRef<SheetStroke[]>([]);
  const strokeDragRef = useRef<{ x: number; y: number }[] | null>(null);
  // drag state for a text label: start pointer position + the label's original
  // spot, so movement is slop-gated and applied as a delta (no jump-to-finger)
  const dragRef = useRef<{ i: number; moved: boolean; sx: number; sy: number; ox: number; oy: number } | null>(null);
  // last tap on a label, for manual double-tap detection (iOS has no dblclick)
  const lastTapRef = useRef<{ i: number; t: number; x: number; y: number } | null>(null);
  // combined undo/redo stack for the current sheet (text + strokes)
  const historyRef = useRef<Snapshot[]>([{ annos: [], strokes: [] }]);
  const histIndexRef = useRef(0);
  // the copied text keeps its full style (text + color + size) and source
  // position so paste reproduces it exactly
  const copiedRef = useRef<{ text: string; color: string; size: number; x: number; y: number } | null>(null);
  // style to apply when a pasted label is dropped by tapping (null → use current)
  const pendingStyleRef = useRef<{ color: string; size: number } | null>(null);
  const editingRef = useRef<typeof editing>(null);
  editingRef.current = editing;
  // mirror frequently-changing values into refs so keyboard handlers (whose
  // effects don't re-subscribe on every change) always read the latest
  const colorRef = useRef(color);
  colorRef.current = color;
  const sizeIdxRef = useRef(sizeIdx);
  sizeIdxRef.current = sizeIdx;
  const many = ids.length > 1;
  const currentId = ids[index];
  const drawing = tool === "draw" || tool === "highlight" || tool === "line";
  const erasing = tool === "erase";
  const placing = tool === "text";
  // erase-drag state (a whole swipe is one undo step)
  const erasingActiveRef = useRef(false);
  const eraseChangedRef = useRef(false);

  const go = (d: number) => setIndex((i) => (i + d + ids.length) % ids.length);

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
    return () => dismissRef.current?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setUrl(null);
    setSel(null);
    setTool(null);
    setPendingText(null);
    setLiveStroke(null);
    setEditing(null);
    strokeDragRef.current = null;
    const init = texts[ids[index]] ?? [];
    setAnnos(init);
    annosRef.current = init;
    const initD = draws?.[ids[index]] ?? [];
    setStrokes(initD);
    strokesRef.current = initD;
    // start a fresh undo/redo history from the loaded state
    historyRef.current = [{ annos: init, strokes: initD }];
    histIndexRef.current = 0;
    setCanUndo(false);
    setCanRedo(false);
    loadSheet(ids[index]).then((u) => {
      if (!alive) return;
      setUrl(u ?? null);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
    // depend on the current sheet id (not the array identity) so committing a
    // text edit doesn't reload the image and steal the in-flight tap
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  const measure = () => {
    const el = boxRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      setBoxW(r.width);
      setBoxH(r.height);
    }
  };
  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [url]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editingRef.current) return; // let the in-place input keep focus/keys
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [many, ids.length]);

  // keyboard actions on the selected text (PC): delete, copy, cut, edit, and
  // arrow-key nudging (1px per press, Shift = 10px) for fine positioning
  const nudgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const arrows = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
    const onKey = (e: KeyboardEvent) => {
      if (editingRef.current) return; // let the in-place input keep focus/keys
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      // The editor is modal: arrow keys belong to it and must never reach the
      // screen behind it (the conti list / 콘티보기 would flip pages or change
      // the focused control while a text is being nudged). Capture-phase
      // stopPropagation keeps them from ever getting there.
      if (arrows.includes(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        if (sel == null) {
          // nothing selected → arrows page through the attached sheets
          if (many && e.key === "ArrowRight") go(1);
          else if (many && e.key === "ArrowLeft") go(-1);
          return;
        }
      }
      if (sel == null) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        pushState(annosRef.current.filter((_, i) => i !== sel), strokesRef.current);
        setSel(null);
      } else if (mod && k === "c") {
        e.preventDefault();
        copySel();
      } else if (mod && k === "x") {
        e.preventDefault();
        cutSel();
      } else if (!mod && (e.key === "Enter" || e.key === "F2")) {
        e.preventDefault();
        editSel();
      } else if (!mod && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        const px = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -px / (boxW || 600) : e.key === "ArrowRight" ? px / (boxW || 600) : 0;
        const dy = e.key === "ArrowUp" ? -px / (boxH || 800) : e.key === "ArrowDown" ? px / (boxH || 800) : 0;
        const next = annosRef.current.map((a, i) =>
          i === sel
            ? { ...a, x: Math.min(1, Math.max(0, a.x + dx)), y: Math.min(1, Math.max(0, a.y + dy)) }
            : a
        );
        // move live without spamming the undo stack; a whole burst of presses
        // becomes ONE history entry once the keys go quiet
        writeState(next, strokesRef.current);
        if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
        nudgeTimer.current = setTimeout(() => {
          const hist = historyRef.current.slice(0, histIndexRef.current + 1);
          hist.push({ annos: annosRef.current, strokes: strokesRef.current });
          historyRef.current = hist;
          histIndexRef.current = hist.length - 1;
          setCanUndo(true);
          setCanRedo(false);
        }, 600);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, currentId, boxW, boxH, many, ids.length]);

  // ---- undo / redo: Ctrl/Cmd+Z, Ctrl+Shift+Z or Ctrl+Y (ignored while typing) ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); redo(); }
      else if (k === "v") { e.preventDefault(); void pasteViaKeyboard(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  // write the given state to the store + local refs (no history entry)
  const writeState = (nextAnnos: SheetText[], nextStrokes: SheetStroke[]) => {
    annosRef.current = nextAnnos;
    strokesRef.current = nextStrokes;
    setAnnos(nextAnnos);
    setStrokes(nextStrokes);
    onTexts(currentId, nextAnnos);
    onDraws?.(currentId, nextStrokes);
  };
  // commit an edit AND record it on the undo stack (drops any redo tail)
  const pushState = (nextAnnos: SheetText[], nextStrokes: SheetStroke[]) => {
    writeState(nextAnnos, nextStrokes);
    const hist = historyRef.current.slice(0, histIndexRef.current + 1);
    hist.push({ annos: nextAnnos, strokes: nextStrokes });
    historyRef.current = hist;
    histIndexRef.current = hist.length - 1;
    setCanUndo(true);
    setCanRedo(false);
  };
  const undo = () => {
    if (histIndexRef.current <= 0) return;
    editingRef.current = null;
    setEditing(null);
    setSel(null);
    histIndexRef.current -= 1;
    const s = historyRef.current[histIndexRef.current];
    writeState(s.annos, s.strokes);
    setCanUndo(histIndexRef.current > 0);
    setCanRedo(true);
  };
  const redo = () => {
    if (histIndexRef.current >= historyRef.current.length - 1) return;
    editingRef.current = null;
    setEditing(null);
    setSel(null);
    histIndexRef.current += 1;
    const s = historyRef.current[histIndexRef.current];
    writeState(s.annos, s.strokes);
    setCanUndo(true);
    setCanRedo(histIndexRef.current < historyRef.current.length - 1);
  };

  // pick a tool; toggle off if it's already active. Highlighter / pen start with
  // a sensible default color so they're usable in one tap.
  const pickTool = (t: "text" | "highlight" | "draw" | "line" | "erase") => {
    setSel(null);
    setPendingText(null);
    pendingStyleRef.current = null;
    if (tool === t) {
      setTool(null);
      return;
    }
    if (t === "highlight") setColor(HL_DEFAULT_COLOR);
    else if (t === "draw" || t === "line") setColor(PEN_DEFAULT_COLOR);
    setTool(t);
  };

  const addPreset = (label: string) => {
    setSel(null);
    pendingStyleRef.current = null; // presets use the current color/size
    setPendingText(label);
    setTool("text");
  };

  const onBoxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (drawing || erasing) return; // strokes are handled by the pointer handlers
    if (editingRef.current) return; // a tap outside the input blurs it → commits
    if (!placing) {
      setSel(null);
      return;
    }
    const el = boxRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (pendingText) {
      // preset / pasted label → drop it straight down. A pasted label keeps its
      // original color+size; presets use the current selection.
      const label = pendingText;
      const style = pendingStyleRef.current;
      const useColor = style ? style.color : color;
      const useSize = style ? style.size : TEXT_SIZES[sizeIdx].value;
      setTool(null);
      setPendingText(null);
      pendingStyleRef.current = null;
      const next = [...annosRef.current, { x, y, text: label, color: useColor, size: useSize }];
      pushState(next, strokesRef.current);
      setSel(next.length - 1);
    } else {
      // free text → open an in-place input right where you tapped, and focus it
      // within this tap gesture so the mobile keyboard reliably opens
      setTool(null);
      setSel(null);
      editingRef.current = { i: null, x, y, value: "" };
      setEditing({ i: null, x, y, value: "" });
      editRef.current?.focus();
    }
  };

  // finish the in-place editor: create / update / delete the annotation. Reads
  // the ref (not state) so a blur+Enter race can't commit the same edit twice.
  const commitEditing = () => {
    const ed = editingRef.current;
    if (!ed) return;
    editingRef.current = null;
    setEditing(null);
    const text = ed.value.trim();
    if (ed.i == null) {
      if (text) {
        const next = [...annosRef.current, { x: ed.x, y: ed.y, text, color, size: TEXT_SIZES[sizeIdx].value }];
        pushState(next, strokesRef.current);
        setSel(next.length - 1);
      }
      return;
    }
    const cur = annosRef.current[ed.i];
    if (!cur) return;
    if (!text) {
      pushState(annosRef.current.filter((_, i) => i !== ed.i), strokesRef.current);
      setSel(null);
    } else if (text !== cur.text) {
      pushState(annosRef.current.map((a, i) => (i === ed.i ? { ...a, text } : a)), strokesRef.current);
    }
  };

  // ---- freehand drawing (형광펜 / 그리기) ----
  const strokeWidth = () => (tool === "highlight" ? HL_WIDTHS : PEN_WIDTHS)[sizeIdx];
  const ptInBox = (clientX: number, clientY: number) => {
    const r = boxRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (clientY - r.top) / r.height)),
    };
  };
  // ---- eraser (형광펜/그림 지우기): drag over strokes to remove them ----
  // eraser radius in px, scaled by the 작게/보통/크게 selector
  const eraseRadiusPx = () => {
    const w = boxRef.current?.getBoundingClientRect().width ?? 300;
    return [0.012, 0.02, 0.035, 0.055][sizeIdx] * w + 6;
  };
  // erase every stroke the eraser touches at (clientX, clientY); live-remove so
  // strokes vanish under the finger, and remember that something changed
  const eraseAt = (clientX: number, clientY: number) => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r) return;
    const R = eraseRadiusPx();
    // distance from the eraser to a stroke *segment*, not just to its recorded
    // points — a straight line only has two of those, and its middle has to be
    // erasable too
    const nearSegment = (
      ax: number, ay: number, bx: number, by: number, thresh: number
    ) => {
      const vx = bx - ax;
      const vy = by - ay;
      const len2 = vx * vx + vy * vy;
      const t = len2 ? Math.max(0, Math.min(1, ((clientX - ax) * vx + (clientY - ay) * vy) / len2)) : 0;
      const dx = clientX - (ax + t * vx);
      const dy = clientY - (ay + t * vy);
      return dx * dx + dy * dy <= thresh * thresh;
    };
    const kept = strokesRef.current.filter((s) => {
      const thresh = R + (s.width * r.width) / 2;
      const px = (p: { x: number; y: number }) => r.left + p.x * r.width;
      const py = (p: { x: number; y: number }) => r.top + p.y * r.height;
      const hit =
        s.points.length === 1
          ? nearSegment(px(s.points[0]), py(s.points[0]), px(s.points[0]), py(s.points[0]), thresh)
          : s.points.some((p, i) =>
              i === 0 ? false : nearSegment(px(s.points[i - 1]), py(s.points[i - 1]), px(p), py(p), thresh)
            );
      return !hit;
    });
    if (kept.length !== strokesRef.current.length) {
      eraseChangedRef.current = true;
      writeState(annosRef.current, kept);
    }
  };
  const onBoxPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return; // ignore right/middle click
    if (erasing) {
      e.stopPropagation();
      boxRef.current?.setPointerCapture?.(e.pointerId);
      erasingActiveRef.current = true;
      eraseChangedRef.current = false;
      eraseAt(e.clientX, e.clientY);
      return;
    }
    if (!drawing) return;
    e.stopPropagation();
    boxRef.current?.setPointerCapture?.(e.pointerId);
    const p = ptInBox(e.clientX, e.clientY);
    strokeDragRef.current = [p];
    setLiveStroke([p]);
  };
  const onBoxPointerMove = (e: React.PointerEvent) => {
    if (erasing) {
      if (erasingActiveRef.current) eraseAt(e.clientX, e.clientY);
      return;
    }
    if (!drawing || !strokeDragRef.current) return;
    const p = ptInBox(e.clientX, e.clientY);
    // 직선: keep only where the drag started and where it is now
    const next = tool === "line" ? [strokeDragRef.current[0], p] : [...strokeDragRef.current, p];
    strokeDragRef.current = next;
    setLiveStroke(next);
  };
  const onBoxPointerUp = (e: React.PointerEvent) => {
    if (erasing) {
      if (!erasingActiveRef.current) return;
      erasingActiveRef.current = false;
      boxRef.current?.releasePointerCapture?.(e.pointerId);
      if (eraseChangedRef.current) {
        eraseChangedRef.current = false;
        // record the whole swipe as a single undo step
        const hist = historyRef.current.slice(0, histIndexRef.current + 1);
        hist.push({ annos: annosRef.current, strokes: strokesRef.current });
        historyRef.current = hist;
        histIndexRef.current = hist.length - 1;
        setCanUndo(true);
        setCanRedo(false);
      }
      return;
    }
    if (!strokeDragRef.current) return;
    boxRef.current?.releasePointerCapture?.(e.pointerId);
    const pts = strokeDragRef.current;
    strokeDragRef.current = null;
    setLiveStroke(null);
    if (pts.length >= 2) {
      const stroke: SheetStroke = { points: pts, color, width: strokeWidth() };
      if (tool === "highlight") stroke.highlight = true;
      pushState(annosRef.current, [...strokesRef.current, stroke]);
    }
  };

  const applyColor = (c: string) => {
    setColor(c);
    if (sel != null) pushState(annos.map((a, i) => (i === sel ? { ...a, color: c } : a)), strokesRef.current);
  };
  const applySize = (idx: number) => {
    setSizeIdx(idx);
    if (sel != null) pushState(annos.map((a, i) => (i === sel ? { ...a, size: TEXT_SIZES[idx].value } : a)), strokesRef.current);
  };
  const editAt = (i: number) => {
    const a = annosRef.current[i];
    if (!a) return;
    const ed = { i, x: a.x, y: a.y, value: a.text };
    setSel(null);
    editingRef.current = ed;
    setEditing(ed); // in-place edit
    editRef.current?.focus();
  };
  const editSel = () => {
    if (sel == null) return;
    editAt(sel);
  };
  const delSel = () => {
    if (sel == null) return;
    pushState(annos.filter((_, i) => i !== sel), strokesRef.current);
    setSel(null);
  };
  // copy the selected text to the clipboard (+ a local fallback) so it can be
  // pasted back onto the sheet or into another app
  const copySel = () => {
    if (sel == null) return;
    const a = annosRef.current[sel];
    if (!a?.text) return;
    // capture the whole styled annotation, not just the text
    copiedRef.current = { text: a.text, color: a.color, size: a.size, x: a.x, y: a.y };
    setHasCopied(true);
    void copyText(a.text);
  };
  const cutSel = () => {
    if (sel == null) return;
    copySel();
    pushState(annosRef.current.filter((_, i) => i !== sel), strokesRef.current);
    setSel(null);
  };
  // keyboard paste (Ctrl/Cmd+V): drop the copied text — with its original color
  // and size — slightly offset from the source, and select it. No tap needed.
  const pasteViaKeyboard = async () => {
    const c = copiedRef.current;
    let text = c?.text ?? null;
    let color = c?.color ?? colorRef.current;
    let size = c?.size ?? TEXT_SIZES[sizeIdxRef.current].value;
    if (!text) {
      // nothing copied in-app → allow plain text from the system clipboard
      try {
        const sys = await navigator.clipboard?.readText?.();
        if (sys && sys.trim()) text = sys.trim();
      } catch {
        /* clipboard blocked */
      }
    }
    if (!text) return;
    setHasCopied(true);
    const x = c ? Math.min(0.95, Math.max(0.05, c.x + 0.05)) : 0.5;
    const y = c ? Math.min(0.95, Math.max(0.05, c.y + 0.05)) : 0.5;
    const next = [...annosRef.current, { x, y, text, color, size }];
    pushState(next, strokesRef.current);
    setSel(next.length - 1);
    if (c) copiedRef.current = { ...c, x, y }; // cascade repeated pastes
  };
  // paste: arm placement with the copied text and its original style; the next
  // tap on the sheet drops it. Falls back to the system clipboard (plain text).
  const pasteText = async () => {
    const c = copiedRef.current;
    let text = c?.text ?? null;
    let style = c ? { color: c.color, size: c.size } : null;
    if (!text) {
      try {
        const sys = await navigator.clipboard?.readText?.();
        if (sys && sys.trim()) { text = sys.trim(); style = null; }
      } catch {
        /* clipboard blocked */
      }
    }
    if (!text) return;
    setHasCopied(true);
    setSel(null);
    pendingStyleRef.current = style; // null → use the current color/size
    setPendingText(text);
    setTool("text");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/90 p-4"
      onClick={close}
    >
      <button
        onClick={close}
        aria-label="닫기"
        className="fixed right-3 top-3 z-10 rounded-full bg-white/15 p-2 text-white active:bg-white/25"
      >
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>

      <div className="my-auto flex flex-col items-center gap-3">
        {onNote || onMemo ? (
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md space-y-1.5">
            <LightboxNote value={note ?? ""} onChange={onNote} placeholder="송폼 입력" />
            <LightboxNote value={memo ?? ""} onChange={onMemo} placeholder="메모 추가" />
          </div>
        ) : (
          note && (
            <p
              onClick={(e) => e.stopPropagation()}
              className="max-w-full whitespace-pre-wrap text-center text-sm text-white/80"
            >
              {note}
            </p>
          )
        )}
        {loading ? (
          <span className="text-sm text-white/70">불러오는 중…</span>
        ) : url ? (
          <div
            ref={boxRef}
            onClick={onBoxClick}
            onPointerDown={onBoxPointerDown}
            onPointerMove={onBoxPointerMove}
            onPointerUp={onBoxPointerUp}
            onPointerCancel={onBoxPointerUp}
            onContextMenu={onMenu ? (e) => { e.preventDefault(); onMenu(currentId); } : undefined}
            style={drawing || erasing ? { touchAction: "none" } : undefined}
            className={"relative inline-block " + (placing || drawing || erasing ? "cursor-crosshair" : "")}
          >
            <img src={url} alt="악보" onLoad={measure} draggable={false} className="block max-h-[62vh] max-w-full" />
            {(strokes.length > 0 || liveStroke) && boxW > 0 && (
              <svg
                width={boxW}
                height={boxH}
                className="pointer-events-none absolute left-0 top-0"
              >
                {strokes.map((s, i) => (
                  <polyline
                    key={i}
                    points={s.points.map((p) => `${p.x * boxW},${p.y * boxH}`).join(" ")}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={s.width * boxW}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={s.highlight ? 0.35 : 1}
                  />
                ))}
                {liveStroke && (
                  <polyline
                    points={liveStroke.map((p) => `${p.x * boxW},${p.y * boxH}`).join(" ")}
                    fill="none"
                    stroke={color}
                    strokeWidth={strokeWidth() * boxW}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={tool === "highlight" ? 0.35 : 1}
                  />
                )}
              </svg>
            )}
            {many && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); go(-1); }}
                  aria-label="이전"
                  className="absolute left-1 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white active:bg-black/60"
                >
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                  </svg>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); go(1); }}
                  aria-label="다음"
                  className="absolute right-1 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white active:bg-black/60"
                >
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  </svg>
                </button>
              </>
            )}
            {annos.map((a, i) =>
              editing?.i === i ? null : (
              <span
                key={i}
                onPointerDown={(e) => {
                  if (e.pointerType === "mouse" && e.button !== 0) return; // right-click opens the menu, not a drag
                  e.stopPropagation();
                  (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                  dragRef.current = { i, moved: false, sx: e.clientX, sy: e.clientY, ox: a.x, oy: a.y };
                  setSel(i);
                }}
                onPointerMove={(e) => {
                  const d = dragRef.current;
                  if (!d || d.i !== i) return;
                  const el = boxRef.current;
                  if (!el) return;
                  const dx = e.clientX - d.sx;
                  const dy = e.clientY - d.sy;
                  // finger jitter under ~6px stays a tap: no nudge, no bogus undo entry
                  if (!d.moved && Math.hypot(dx, dy) < 6) return;
                  d.moved = true;
                  const rect = el.getBoundingClientRect();
                  // move by delta from the label's original spot so it doesn't jump under the pointer
                  const nx = Math.min(1, Math.max(0, d.ox + dx / rect.width));
                  const ny = Math.min(1, Math.max(0, d.oy + dy / rect.height));
                  const next = annosRef.current.map((p, idx) => (idx === i ? { ...p, x: nx, y: ny } : p));
                  annosRef.current = next;
                  setAnnos(next);
                }}
                onPointerUp={(e) => {
                  const d = dragRef.current;
                  dragRef.current = null;
                  (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
                  if (d?.moved) {
                    pushState(annosRef.current, strokesRef.current);
                    lastTapRef.current = null;
                    return;
                  }
                  // double-tap → edit, detected manually: iOS Safari never
                  // synthesizes dblclick from touch, so onDoubleClick alone
                  // would leave iPhone users unable to edit a text
                  const prev = lastTapRef.current;
                  const now = Date.now();
                  if (prev && prev.i === i && now - prev.t < 350 && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 24) {
                    lastTapRef.current = null;
                    editAt(i);
                  } else {
                    lastTapRef.current = { i, t: now, x: e.clientX, y: e.clientY };
                  }
                }}
                onPointerCancel={() => {
                  dragRef.current = null;
                }}
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: "absolute",
                  left: `${a.x * 100}%`,
                  top: `${a.y * 100}%`,
                  transform: "translate(-50%, -50%)",
                  color: a.color,
                  fontSize: boxW ? a.size * boxW : 16,
                  fontWeight: 700,
                  lineHeight: 1,
                  whiteSpace: "nowrap",
                  cursor: "move",
                  touchAction: "none",
                  pointerEvents: drawing || erasing || editing ? "none" : "auto",
                  padding: "1px 3px",
                  borderRadius: 4,
                  outline: sel === i ? "2px solid #6366f1" : "none",
                  outlineOffset: 2,
                  boxShadow: sel === i ? "0 0 0 4px rgba(99,102,241,0.25)" : "none",
                }}
              >
                {a.text}
              </span>
            ))}
            {/* in-place text input — always mounted so it can be focused within
                the tap gesture (mobile keyboard); parked off-screen when idle */}
            <input
              ref={editRef}
              value={editing?.value ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                if (editingRef.current) editingRef.current = { ...editingRef.current, value: v };
                setEditing((ed) => (ed ? { ...ed, value: v } : ed));
              }}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); commitEditing(); editRef.current?.blur(); }
                else if (e.key === "Escape") { e.preventDefault(); editingRef.current = null; setEditing(null); editRef.current?.blur(); }
              }}
              onBlur={commitEditing}
              placeholder="입력"
              enterKeyHint="done"
              style={
                editing && boxW
                  ? (() => {
                      const fs =
                        (editing.i != null
                          ? annos[editing.i]?.size ?? TEXT_SIZES[sizeIdx].value
                          : TEXT_SIZES[sizeIdx].value) * boxW;
                      // size the input to the ACTUAL rendered text width (the old
                      // `ch`-based width truncated Korean, which is ~2ch per glyph)
                      if (!measureCtxRef.current)
                        measureCtxRef.current = document.createElement("canvas").getContext("2d");
                      const mctx = measureCtxRef.current;
                      let tw = 0;
                      if (mctx) {
                        mctx.font = `700 ${fs}px Pretendard, system-ui, -apple-system, sans-serif`;
                        tw = mctx.measureText(editing.value || "입력").width;
                      }
                      const width = Math.min(boxW * 0.96, Math.max(fs * 2, tw + fs * 0.6 + 12));
                      // keep the (centered) input inside the sheet horizontally
                      const cx = Math.min(Math.max(editing.x * boxW, width / 2), boxW - width / 2);
                      return {
                        position: "absolute" as const,
                        left: cx,
                        top: `${editing.y * 100}%`,
                        transform: "translate(-50%, -50%)",
                        color: editing.i != null ? annos[editing.i]?.color ?? color : color,
                        fontSize: fs,
                        fontWeight: 700,
                        lineHeight: 1.1,
                        textAlign: "center" as const,
                        background: "rgba(255,255,255,0.92)",
                        border: "1px solid #6366f1",
                        borderRadius: 4,
                        padding: "1px 4px",
                        outline: "none",
                        width,
                        caretColor: "#6366f1",
                        zIndex: 20,
                      };
                    })()
                  : { position: "absolute", left: -9999, top: 0, width: 1, height: 1, opacity: 0, pointerEvents: "none" }
              }
            />
          </div>
        ) : (
          <span className="text-sm text-white/70">악보를 불러올 수 없어요</span>
        )}

        {/* annotation toolbar — directly under the sheet */}
        {url && (
          <div
            className="w-full max-w-2xl space-y-2 rounded-xl bg-black/60 p-3 backdrop-blur"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={() => pickTool("text")}
                aria-label="텍스트 추가"
                title="텍스트 추가"
                className={
                  "flex h-9 w-9 items-center justify-center rounded-full " +
                  (tool === "text" && !pendingText ? "bg-indigo-600 text-white" : "bg-white/15 text-white")
                }
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 6.5V5h14v1.5M12 5v14m-3 0h6" />
                </svg>
              </button>
              <button
                onClick={() => pickTool("highlight")}
                aria-label="형광펜"
                title="형광펜"
                className={
                  "flex h-9 w-9 items-center justify-center rounded-full " +
                  (tool === "highlight" ? "bg-indigo-600 text-white" : "bg-white/15 text-white")
                }
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.3 4.6 19.4 8.7M7.4 16.5l-3.4 1 1-3.4L15.3 4.6a1.6 1.6 0 0 1 2.3 0l1.8 1.8a1.6 1.6 0 0 1 0 2.3L7.4 16.5Z" />
                  <path strokeLinecap="round" d="M4 20.5h16" />
                </svg>
              </button>
              <button
                onClick={() => pickTool("draw")}
                aria-label="그리기"
                title="그리기"
                className={
                  "flex h-9 w-9 items-center justify-center rounded-full " +
                  (tool === "draw" ? "bg-indigo-600 text-white" : "bg-white/15 text-white")
                }
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m16.5 3.5 4 4L8 20l-4 .5.5-4L16.5 3.5Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="m13.5 6.5 4 4" />
                </svg>
              </button>
              <button
                onClick={() => pickTool("line")}
                aria-label="선 긋기"
                title="선 긋기 (끌어서 직선)"
                className={
                  "flex h-9 w-9 items-center justify-center rounded-full " +
                  (tool === "line" ? "bg-indigo-600 text-white" : "bg-white/15 text-white")
                }
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                  <path strokeLinecap="round" d="M6.8 17.2 17.2 6.8" />
                  <circle cx="5.2" cy="18.8" r="1.9" />
                  <circle cx="18.8" cy="5.2" r="1.9" />
                </svg>
              </button>
              <button
                onClick={() => pickTool("erase")}
                aria-label="지우개"
                title="지우개 (형광펜·그림 지우기)"
                className={
                  "flex h-9 w-9 items-center justify-center rounded-full " +
                  (tool === "erase" ? "bg-indigo-600 text-white" : "bg-white/15 text-white")
                }
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 20.5H20M4.3 15.2l4.5 4.5a1.6 1.6 0 0 0 2.3 0l8.1-8.1a1.6 1.6 0 0 0 0-2.3l-4.5-4.5a1.6 1.6 0 0 0-2.3 0L4.3 12.9a1.6 1.6 0 0 0 0 2.3Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="m9 9.5 5.5 5.5" />
                </svg>
              </button>
              {/* undo / redo — covers every sheet edit (text + strokes) */}
              <button
                onClick={undo}
                disabled={!canUndo}
                aria-label="되돌리기(이전)"
                title="되돌리기 (Ctrl+Z)"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white disabled:opacity-30"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 14 4 9l5-5" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 9h11a5 5 0 0 1 0 10h-3" />
                </svg>
              </button>
              <button
                onClick={redo}
                disabled={!canRedo}
                aria-label="다시 실행(앞으로)"
                title="다시 실행 (Ctrl+Shift+Z)"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white disabled:opacity-30"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 14l5-5-5-5" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 9H9a5 5 0 0 0 0 10h3" />
                </svg>
              </button>
              {hasCopied && sel == null && !placing && (
                <button
                  onClick={pasteText}
                  aria-label="붙여넣기"
                  title="붙여넣기 (Ctrl+V)"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1H9V5Z" />
                  </svg>
                </button>
              )}
              {sel != null && (
                <>
                  <button
                    onClick={copySel}
                    aria-label="복사"
                    title="복사 (Ctrl+C)"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 9h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 15a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1" />
                    </svg>
                  </button>
                  <button
                    onClick={delSel}
                    aria-label="삭제"
                    title="삭제 (Delete)"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-600 text-white"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7m-7 0 .7 11a2 2 0 0 0 2 1.9h2.6a2 2 0 0 0 2-1.9L17 7" />
                    </svg>
                  </button>
                </>
              )}
              {many && (
                <span className="ml-1 text-xs font-semibold text-white/70">{index + 1} / {ids.length}</span>
              )}
            </div>
            {(placing || drawing || erasing) && (
              <p className="text-center text-xs font-medium text-white/70">
                {placing
                  ? "악보를 탭해 텍스트를 넣으세요"
                  : erasing
                  ? "지울 형광펜·그림 위를 드래그하세요"
                  : "악보 위를 드래그해 그리세요"}
              </p>
            )}
            <div className="flex items-center justify-center gap-3">
              {tool !== "erase" && (
              <div className="flex items-center gap-1.5">
                {TEXT_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => applyColor(c)}
                    aria-label={`색 ${c}`}
                    className={
                      "h-6 w-6 rounded-full border " +
                      (color === c ? "border-white ring-2 ring-white/60" : "border-white/40")
                    }
                    style={{ background: c }}
                  />
                ))}
              </div>
              )}
              <div className="flex items-center gap-1">
                {TEXT_SIZES.map((s, i) => (
                  <button
                    key={s.value}
                    onClick={() => applySize(i)}
                    className={
                      "rounded-md px-2 py-1 text-xs font-semibold " +
                      (sizeIdx === i ? "bg-white text-slate-900" : "bg-white/15 text-white")
                    }
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            {/* quick-insert presets (not while erasing) */}
            {tool !== "erase" && (
            <div className="space-y-1.5">
              {PRESET_ROWS.map((row, ri) => (
                <div key={ri} className="flex flex-wrap items-center justify-center gap-1.5">
                  {row.map((p) => (
                    <button
                      key={p}
                      onClick={() => addPreset(p)}
                      className={
                        "rounded-md px-2.5 py-1 text-xs font-bold text-white active:bg-white/30 " +
                        (pendingText === p ? "bg-indigo-600" : "bg-white/15")
                      }
                    >
                      {p}
                    </button>
                  ))}
                </div>
              ))}
            </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
