// Firebase is OPTIONAL. Without VITE_FIREBASE_* env vars the app runs fully
// on localStorage; with them, Google sign-in + per-user Firestore sync turn on.
import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  GoogleAuthProvider,
  getAuth,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
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
