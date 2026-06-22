import { useEffect, useRef, useState } from "react";
import type { SheetText } from "../lib/useConti";
import {
  addSongSheet,
  removeSongSheet,
  replaceSongSheet,
  setSongNote,
  setSongSheetTexts,
  setSongYoutube,
  useSongAttach,
} from "../lib/songAttach";
import {
  fetchSheetInteractive,
  loadSheet,
  removeSheetEverywhere,
  saveSheetFromFile,
} from "../lib/attachments";
import { driveEnabled } from "../lib/drive";
import { registerBack, useBackDismiss } from "../lib/backStack";

const TEXT_COLORS = ["#ef4444", "#000000", "#ffffff", "#2563eb", "#16a34a", "#eab308"];
const TEXT_SIZES: { label: string; value: number }[] = [
  { label: "작게", value: 0.03 },
  { label: "보통", value: 0.045 },
  { label: "크게", value: 0.07 },
];
const TEXT_PRESET_ROWS = [
  ["Int", "V", "V1", "V2", "PC", "C", "C1", "C2"],
  ["B", "Itl4", "Itl8", "Tag", "Out", "Rit"],
];

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

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);
  const [cropQueue, setCropQueue] = useState<File[]>([]);
  const [sheetMenu, setSheetMenu] = useState<string | null>(null);
  const [recrop, setRecrop] = useState<{ aid: string; file: File } | null>(null);
  useBackDismiss(sheetMenu != null, () => setSheetMenu(null));

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
    if (imgs.length) setCropQueue((q) => [...q, ...imgs]);
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
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            메모
          </label>
          <textarea
            value={a?.note ?? ""}
            onChange={(e) => setSongNote(songId, e.target.value)}
            rows={2}
            placeholder="메모 추가"
            className="w-full resize-y rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          />
        </div>
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
                  removeSongSheet(songId, aid);
                  removeSheetEverywhere(aid);
                }}
              />
            ))}
          </div>
        )}
        {viewer !== null && (
          <SheetLightbox
            ids={sheetIds}
            start={viewer}
            texts={sheetTexts}
            onTexts={(aid, list) => setSongSheetTexts(songId, aid, list)}
            onMenu={(aid) => setSheetMenu(aid)}
            onClose={() => setViewer(null)}
          />
        )}
        {/* the real <input> is overlaid (opacity 0) so the tap lands on it
            directly — the most reliable way to open the gallery picker */}
        <div
          className={
            "relative inline-flex items-center gap-1.5 overflow-hidden rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300 " +
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
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>
        {err && <p className="mt-1 text-[11px] font-medium text-rose-500">{err}</p>}
      </div>

      {cropQueue.length > 0 && <CropModal file={cropQueue[0]} onDone={onCropDone} />}
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
  const [rect, setRect] = useState({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
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
  useEffect(() => {
    dismissRef.current = registerBack(() => {
      if (closedRef.current) return;
      closedRef.current = true;
      onDoneRef.current(null);
    });
    return () => dismissRef.current?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    <div className="relative h-20 w-16 overflow-hidden rounded-lg bg-slate-50 dark:bg-slate-800">
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

export function SheetLightbox({
  ids,
  start,
  texts,
  onTexts,
  onMenu,
  onClose,
}: {
  ids: string[];
  start: number;
  texts: Record<string, SheetText[]>;
  onTexts: (aid: string, list: SheetText[]) => void;
  onMenu?: (aid: string) => void;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(start);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [annos, setAnnos] = useState<SheetText[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [placing, setPlacing] = useState(false);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [color, setColor] = useState(TEXT_COLORS[0]);
  const [size, setSize] = useState(TEXT_SIZES[1].value);
  const [boxW, setBoxW] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const annosRef = useRef<SheetText[]>([]);
  const dragRef = useRef<{ i: number; moved: boolean } | null>(null);
  const many = ids.length > 1;
  const currentId = ids[index];

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
    setPlacing(false);
    setPendingText(null);
    const init = texts[ids[index]] ?? [];
    setAnnos(init);
    annosRef.current = init;
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
    if (el) setBoxW(el.getBoundingClientRect().width);
  };
  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [url]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight" && many) go(1);
      else if (e.key === "ArrowLeft" && many) go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [many, ids.length]);

  // delete the selected text with the keyboard (PC)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (sel == null) return;
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      commit(annosRef.current.filter((_, i) => i !== sel));
      setSel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, currentId]);

  const commit = (next: SheetText[]) => {
    annosRef.current = next;
    setAnnos(next);
    onTexts(currentId, next);
  };

  const addPreset = (label: string) => {
    setSel(null);
    setPendingText(label);
    setPlacing(true);
  };

  const onBoxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!placing) {
      setSel(null);
      return;
    }
    const el = boxRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const text = pendingText ?? prompt("텍스트 입력");
    setPlacing(false);
    setPendingText(null);
    if (text && text.trim()) {
      const next = [...annosRef.current, { x, y, text: text.trim(), color, size }];
      commit(next);
      setSel(next.length - 1);
    }
  };

  const applyColor = (c: string) => {
    setColor(c);
    if (sel != null) commit(annos.map((a, i) => (i === sel ? { ...a, color: c } : a)));
  };
  const applySize = (s: number) => {
    setSize(s);
    if (sel != null) commit(annos.map((a, i) => (i === sel ? { ...a, size: s } : a)));
  };
  const editSel = () => {
    if (sel == null) return;
    const t = prompt("텍스트 수정", annos[sel].text);
    if (t == null) return;
    if (!t.trim()) {
      commit(annos.filter((_, i) => i !== sel));
      setSel(null);
    } else {
      commit(annos.map((a, i) => (i === sel ? { ...a, text: t.trim() } : a)));
    }
  };
  const delSel = () => {
    if (sel == null) return;
    commit(annos.filter((_, i) => i !== sel));
    setSel(null);
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
        {loading ? (
          <span className="text-sm text-white/70">불러오는 중…</span>
        ) : url ? (
          <div
            ref={boxRef}
            onClick={onBoxClick}
            onContextMenu={onMenu ? (e) => { e.preventDefault(); onMenu(currentId); } : undefined}
            className={"relative inline-block " + (placing ? "cursor-crosshair" : "")}
          >
            <img src={url} alt="악보" onLoad={measure} className="block max-h-[62vh] max-w-full rounded-lg" />
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
            {annos.map((a, i) => (
              <span
                key={i}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                  dragRef.current = { i, moved: false };
                  setSel(i);
                }}
                onPointerMove={(e) => {
                  const d = dragRef.current;
                  if (!d || d.i !== i) return;
                  const el = boxRef.current;
                  if (!el) return;
                  const rect = el.getBoundingClientRect();
                  const nx = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
                  const ny = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
                  d.moved = true;
                  const next = annosRef.current.map((p, idx) => (idx === i ? { ...p, x: nx, y: ny } : p));
                  annosRef.current = next;
                  setAnnos(next);
                }}
                onPointerUp={(e) => {
                  const d = dragRef.current;
                  dragRef.current = null;
                  (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
                  if (d?.moved) onTexts(currentId, annosRef.current);
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
                  padding: "1px 3px",
                  outline: sel === i ? "1px dashed rgba(255,255,255,0.8)" : "none",
                }}
              >
                {a.text}
              </span>
            ))}
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
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => { setSel(null); setPendingText(null); setPlacing((p) => !p); }}
                className={
                  "rounded-full px-3 py-1.5 text-sm font-semibold " +
                  (placing && !pendingText ? "bg-indigo-600 text-white" : "bg-white/15 text-white")
                }
              >
                {placing ? "위치를 탭하세요" : "＋ 텍스트"}
              </button>
              {sel != null && (
                <>
                  <button onClick={editSel} className="rounded-full bg-white/15 px-3 py-1.5 text-sm font-semibold text-white">수정</button>
                  <button onClick={delSel} className="rounded-full bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white">삭제</button>
                </>
              )}
              {many && (
                <span className="ml-1 text-xs font-semibold text-white/70">{index + 1} / {ids.length}</span>
              )}
            </div>
            <div className="flex items-center justify-center gap-3">
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
              <div className="flex items-center gap-1">
                {TEXT_SIZES.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => applySize(s.value)}
                    className={
                      "rounded-md px-2 py-1 text-xs font-semibold " +
                      (size === s.value ? "bg-white text-slate-900" : "bg-white/15 text-white")
                    }
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            {/* quick-insert presets */}
            <div className="space-y-1.5">
              {TEXT_PRESET_ROWS.map((row, ri) => (
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
          </div>
        )}
      </div>
    </div>
  );
}
