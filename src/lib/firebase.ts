// Firebase is OPTIONAL. Without VITE_FIREBASE_* env vars the app runs fully
// on localStorage; with them, Google sign-in + per-user Firestore sync turn on.
import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  GoogleAuthProvider,
  getAuth,
  getRedirectResult,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

// trim guards against trailing spaces / newlines accidentally pasted into secrets
const env = (v: unknown): string | undefined =>
  typeof v === "string" ? v.trim() : undefined;
const config = {
  apiKey: env(import.meta.env.VITE_FIREBASE_API_KEY),
  authDomain: env(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
  projectId: env(import.meta.env.VITE_FIREBASE_PROJECT_ID),
  storageBucket: env(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: env(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
  appId: env(import.meta.env.VITE_FIREBASE_APP_ID),
};

export const isFirebaseConfigured = Boolean(config.apiKey && config.projectId && config.appId);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

// surface auth errors to the UI (popup + redirect paths)
let lastError: string | null = null;
const errListeners = new Set<(e: string | null) => void>();
function setError(e: string | null) {
  lastError = e;
  errListeners.forEach((l) => l(e));
}
export function onAuthError(cb: (e: string | null) => void): () => void {
  errListeners.add(cb);
  cb(lastError);
  return () => errListeners.delete(cb);
}

if (isFirebaseConfigured) {
  app = initializeApp(config);
  auth = getAuth(app);
  db = getFirestore(app);
  // complete any redirect-based sign-in and surface its errors
  getRedirectResult(auth).catch((e) => setError(e?.code || e?.message || String(e)));

  // FAITHS SSO: when opened inside the FAITHS in-app browser (same-origin
  // iframe) and not already signed in, ask the parent for the Google ID
  // token it already has and sign in with it so users skip this app's own
  // login screen.
  const FAITHS_ORIGIN = "https://csy870617.github.io";
  // tracks the listener from the most recent request so repeated sign-out
  // events (when the parent never replies) don't accumulate duplicate handlers
  let pendingSsoListener: ((e: MessageEvent) => void) | null = null;
  onAuthStateChanged(auth, (user) => {
    if (user) {
      // signed in (by any means) — drop a still-pending SSO listener so a late
      // parent reply can't silently switch the session to another account
      if (pendingSsoListener) {
        window.removeEventListener("message", pendingSsoListener);
        pendingSsoListener = null;
      }
      return;
    }
    if (window.parent === window) return;
    if (pendingSsoListener) {
      window.removeEventListener("message", pendingSsoListener);
      pendingSsoListener = null;
    }
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== FAITHS_ORIGIN) return;
      if (!e.data || e.data.type !== "faiths-google-idtoken" || !e.data.idToken) return;
      window.removeEventListener("message", onMsg);
      pendingSsoListener = null;
      const cred = GoogleAuthProvider.credential(e.data.idToken);
      signInWithCredential(auth!, cred).catch((err) =>
        console.log("FAITHS SSO 실패:", err?.code || err?.message || String(err)),
      );
    };
    pendingSsoListener = onMsg;
    window.addEventListener("message", onMsg);
    window.parent.postMessage({ type: "faiths-request-idtoken" }, FAITHS_ORIGIN);
  });
}

export { auth, db };

export function onAuth(cb: (user: User | null) => void): () => void {
  if (!auth) {
    cb(null);
    return () => {};
  }
  return onAuthStateChanged(auth, cb);
}

// popup failures where falling back to a full-page redirect is appropriate
const POPUP_FALLBACK = new Set([
  "auth/popup-blocked",
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
  "auth/operation-not-supported-in-this-environment",
  "auth/web-storage-unsupported",
  "auth/internal-error",
]);

export async function signInWithGoogle(): Promise<void> {
  if (!auth) return;
  setError(null);
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
  } catch (e: any) {
    const code: string = e?.code || "";
    if (POPUP_FALLBACK.has(code)) {
      // popup didn't work in this browser — use a full-page redirect instead
      try {
        await signInWithRedirect(auth, provider);
      } catch (e2: any) {
        setError(e2?.code || e2?.message || String(e2));
      }
    } else {
      setError(code || e?.message || String(e));
    }
  }
}

export async function signOutUser(): Promise<void> {
  if (!auth) return;
  await signOut(auth);
}
