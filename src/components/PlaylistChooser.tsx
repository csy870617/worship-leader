import { useBackDismiss } from "../lib/backStack";

/** Bottom sheet asking whether to play the conti's playlist in YouTube or
 *  YouTube Music. Both open the same ad-hoc playlist built from the songs'
 *  YouTube links. */
export default function PlaylistChooser({
  onPick,
  onClose,
}: {
  onPick: (target: "youtube" | "music") => void;
  onClose: () => void;
}) {
  useBackDismiss(true, onClose);
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-3"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl bg-white p-4 shadow-2xl ring-1 ring-black/5 dark:bg-slate-800 dark:ring-white/10"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "wlSheetUp .18s ease-out" }}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-200 dark:bg-slate-600" />
        <p className="mb-3 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">
          재생목록을 어디서 열까요?
        </p>
        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={() => onPick("youtube")}
            className="flex flex-col items-center gap-1.5 rounded-2xl bg-red-50 py-4 text-red-600 transition active:scale-95 active:bg-red-100 dark:bg-red-500/15 dark:text-red-400"
          >
            <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.3 3.6-6.3 3.6Z" />
            </svg>
            <span className="text-sm font-bold">유튜브</span>
          </button>
          <button
            onClick={() => onPick("music")}
            className="flex flex-col items-center gap-1.5 rounded-2xl bg-rose-50 py-4 text-rose-600 transition active:scale-95 active:bg-rose-100 dark:bg-rose-500/15 dark:text-rose-400"
          >
            <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 18.5a8.5 8.5 0 1 1 0-17 8.5 8.5 0 0 1 0 17Zm-2-12.9 6.5 3.9-6.5 3.9V7.6Z" />
            </svg>
            <span className="text-sm font-bold">유튜브 뮤직</span>
          </button>
        </div>
        <button
          onClick={onClose}
          className="mt-2.5 w-full rounded-2xl py-3 text-sm font-semibold text-slate-500 active:bg-slate-100 dark:text-slate-400 dark:active:bg-slate-700"
        >
          취소
        </button>
      </div>
    </div>
  );
}
