import { useEffect, useRef, useState } from "react";
import type { Song } from "../types";
import type { ContiItem, SheetText } from "../lib/useConti";
import { useSongAttach } from "../lib/songAttach";
import { youtubePlaylistUrl } from "../lib/share";
import { fetchSheetInteractive, loadSheet } from "../lib/attachments";
import { driveEnabled } from "../lib/drive";

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

  // mobile back button closes the view instead of leaving the page
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const closedRef = useRef(false);
  const pushedRef = useRef(false);
  const close = () => {
    if (closedRef.current) return;
    closedRef.current = true;
    onCloseRef.current();
    if (pushedRef.current) {
      pushedRef.current = false;
      window.history.back();
    }
  };
  useEffect(() => {
    window.history.pushState({ wlView: true }, "");
    pushedRef.current = true;
    const onPop = () => {
      pushedRef.current = false;
      close();
    };
    window.addEventListener("popstate", onPop);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = items
    .map((it) => ({ item: it, song: songById.get(it.id) }))
    .filter((r): r is { item: ContiItem; song: Song } => Boolean(r.song));

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-white dark:bg-slate-900">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-slate-900 dark:text-slate-50">{name}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">{rows.length}곡</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {playlistUrl && (
            <a
              href={playlistUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="유튜브 재생목록"
              className="rounded-full p-1.5 text-red-600 active:bg-red-50 dark:text-red-500"
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

      <div className="mx-auto max-w-3xl space-y-8 px-4 py-6 pb-24">
        {rows.map(({ item, song }, i) => {
          const a = attach[item.id];
          const keys = item.key ? item.key : song.keys.join(" / ");
          return (
            <section key={item.id}>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-extrabold text-indigo-300 dark:text-indigo-400/70">{i + 1}</span>
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50">{song.title}</h2>
                {keys && <span className="text-sm font-bold text-indigo-600 dark:text-indigo-300">{keys}</span>}
              </div>
              {a?.note && (
                <p className="ml-7 mt-1 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{a.note}</p>
              )}
              {(a?.sheets ?? []).map((aid) => (
                <SheetFigure key={aid} aid={aid} texts={a?.sheetTexts?.[aid] ?? []} />
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function SheetFigure({ aid, texts }: { aid: string; texts: SheetText[] }) {
  const [url, setUrl] = useState<string | null>(null);
  const [needsSync, setNeedsSync] = useState(false);
  const [w, setW] = useState(0);
  const imgRef = useRef<HTMLImageElement>(null);

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
    if (imgRef.current) setW(imgRef.current.clientWidth);
  };
  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [url]);

  const sync = async () => {
    const u = await fetchSheetInteractive(aid);
    if (u) {
      setNeedsSync(false);
      setUrl(u);
    }
  };

  if (url) {
    return (
      <div className="relative ml-7 mt-3">
        <img
          ref={imgRef}
          src={url}
          alt="악보"
          onLoad={measure}
          className="block w-full rounded-lg border border-slate-200 dark:border-slate-700"
        />
        {texts.map((t, i) => (
          <span
            key={i}
            style={{
              position: "absolute",
              left: `${t.x * 100}%`,
              top: `${t.y * 100}%`,
              transform: "translate(-50%, -50%)",
              color: t.color,
              fontSize: w ? t.size * w : 16,
              fontWeight: 700,
              lineHeight: 1,
              whiteSpace: "nowrap",
            }}
          >
            {t.text}
          </span>
        ))}
      </div>
    );
  }
  if (needsSync) {
    return (
      <button
        onClick={sync}
        className="ml-7 mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-indigo-600 dark:bg-slate-800 dark:text-indigo-400"
      >
        악보 불러오기
      </button>
    );
  }
  return <div className="ml-7 mt-3 h-24 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />;
}
