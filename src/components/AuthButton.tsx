import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import {
  isFirebaseConfigured,
  onAuth,
  onAuthError,
  signInWithGoogle,
  signOutUser,
} from "../lib/firebase";
import { isInAppBrowser, tryOpenExternal } from "../lib/inapp";
import { copyText } from "../lib/share";

export default function AuthButton() {
  const [user, setUser] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => onAuth(setUser), []);
  useEffect(() => onAuthError(setError), []);

  if (!isFirebaseConfigured) return null;

  // In-app browsers (KakaoTalk, etc.) can't do Google OAuth → guide to a real browser.
  if (!user && isInAppBrowser()) {
    return (
      <div className="relative">
        <button
          onClick={async () => {
            if (tryOpenExternal()) return; // KakaoTalk/Line jump out directly
            const ok = await copyText(location.href);
            setHint(ok ? "주소 복사됨 · 외부 브라우저에 붙여넣어 여세요" : "메뉴(⋮)에서 외부 브라우저로 열어주세요");
          }}
          className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700 active:bg-amber-200 dark:bg-amber-500/20 dark:text-amber-300"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
          브라우저로 열기
        </button>
        <span className="absolute right-0 top-full mt-1 w-56 rounded bg-slate-800 px-2 py-1.5 text-[10px] leading-snug text-white shadow dark:bg-slate-700">
          {hint ?? "카카오톡 등 인앱 브라우저에선 구글 로그인이 막힙니다. Chrome/Safari로 열어주세요."}
        </span>
      </div>
    );
  }

  if (user) {
    return (
      <button
        onClick={() => signOutUser()}
        title={user.email ?? undefined}
        className="flex items-center gap-1.5 rounded-full bg-slate-100 py-0.5 pl-0.5 pr-2 text-xs font-medium text-slate-600 active:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
      >
        {user.photoURL ? (
          <img src={user.photoURL} alt="" className="h-6 w-6 rounded-full" />
        ) : (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-bold text-white">
            {(user.displayName ?? user.email ?? "?").slice(0, 1).toUpperCase()}
          </span>
        )}
        로그아웃
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={async () => {
          setBusy(true);
          await signInWithGoogle();
          setBusy(false);
        }}
        disabled={busy}
        className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 active:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
          <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.46 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z" />
        </svg>
        Google 로그인
      </button>
      {error && (
        <span className="absolute right-0 top-full mt-1 whitespace-nowrap rounded bg-rose-600 px-2 py-1 text-[10px] font-medium text-white shadow">
          {error}
        </span>
      )}
    </div>
  );
}

