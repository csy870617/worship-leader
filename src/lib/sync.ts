// Per-user cloud sync with document-level Last-Write-Wins.
//
// A small sync record { uid, at, dirty } is kept in localStorage:
//   • at    = updatedAt of the cloud doc this device last synced with
//   • dirty = local has un-pushed changes since then
//
// On login we compare the cloud doc's updatedAt against `at` to decide who wins,
// so deletions made on one device propagate to others (no union-resurrection).
// First-ever login on a device unions (to preserve pre-login local data); an
// account switch takes the cloud as truth (no cross-account contamination).
import { doc, getDoc, setDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import { db, onAuth } from "./firebase";
import type { Song } from "../types";
import {
  getHiddenIds,
  getUserSongs,
  setHiddenIds,
  setUserSongs,
  subscribeCatalog,
} from "./catalog";
import {
  getFavoriteIds,
  setFavoriteIds,
  subscribeFavorites,
} from "./useFavorites";
import {
  getContiItems,
  setContiItems,
  subscribeConti,
  type ContiItem,
} from "./useConti";
import {
  getHistoryMap,
  setHistoryMap,
  subscribeHistory,
} from "./useHistory";

interface CloudDoc {
  userSongs: Song[];
  favorites: string[];
  conti: ContiItem[];
  history: Record<string, string>;
  hidden: string[];
  updatedAt: number;
}
type LocalSnapshot = Omit<CloudDoc, "updatedAt">;

function snapshotLocal(): LocalSnapshot {
  return {
    userSongs: getUserSongs(),
    favorites: getFavoriteIds(),
    conti: getContiItems(),
    history: getHistoryMap(),
    hidden: getHiddenIds(),
  };
}

/** Union merge — only used for the first login (preserve local + remote). */
function mergeUnion(local: LocalSnapshot, remote: Partial<CloudDoc>): LocalSnapshot {
  const byId = new Map<string, Song>();
  for (const s of remote.userSongs ?? []) byId.set(s.id, s);
  for (const s of local.userSongs) byId.set(s.id, s);

  const favorites = [...new Set([...(remote.favorites ?? []), ...local.favorites])];
  const hidden = [...new Set([...(remote.hidden ?? []), ...local.hidden])];

  const history: Record<string, string> = { ...(remote.history ?? {}) };
  for (const [id, date] of Object.entries(local.history)) {
    const cur = history[id];
    if (!cur || date > cur) history[id] = date;
  }

  const conti = local.conti.length ? local.conti : remote.conti ?? [];
  return { userSongs: [...byId.values()], favorites, conti, history, hidden };
}

// ---- sync meta (per device) ----
const META = "wl.sync";
interface SyncMeta {
  uid: string;
  at: number;
  dirty: boolean;
}
function getMeta(): SyncMeta | null {
  try {
    const raw = localStorage.getItem(META);
    const o = raw ? JSON.parse(raw) : null;
    return o && typeof o.uid === "string" ? o : null;
  } catch {
    return null;
  }
}
function saveMeta(uid: string, at: number, dirty: boolean) {
  localStorage.setItem(META, JSON.stringify({ uid, at, dirty }));
}
function markDirty() {
  const m = getMeta();
  if (m && !m.dirty) saveMeta(m.uid, m.at, true);
}

// ---- runtime state ----
let applyingRemote = false;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let currentUser: User | null = null;

const userRef = (uid: string) => doc(db!, "users", uid);

function applyDoc(d: Partial<CloudDoc> | LocalSnapshot) {
  applyingRemote = true;
  setUserSongs(d.userSongs ?? []);
  setFavoriteIds(d.favorites ?? []);
  setContiItems(d.conti ?? []);
  setHistoryMap(d.history ?? {});
  setHiddenIds(d.hidden ?? []);
  applyingRemote = false;
}

async function pushNow() {
  if (!db || !currentUser) return;
  const uid = currentUser.uid;
  const payload: CloudDoc = { ...snapshotLocal(), updatedAt: Date.now() };
  try {
    await setDoc(userRef(uid), payload); // full replace → deletions propagate
    if (currentUser?.uid === uid) saveMeta(uid, payload.updatedAt, false);
  } catch (e) {
    console.warn("[sync] push failed", e);
  }
}

function schedulePush() {
  if (!currentUser) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(pushNow, 800);
}

function onLocalChange() {
  if (applyingRemote) return;
  markDirty();
  schedulePush();
}

async function onLogin(user: User) {
  currentUser = user;
  if (!db) return;
  try {
    const snap = await getDoc(userRef(user.uid));
    if (currentUser?.uid !== user.uid) return; // auth changed during await

    const remote = snap.exists() ? (snap.data() as CloudDoc) : null;
    const meta = getMeta();

    if (!remote) {
      await pushNow(); // seed the cloud from local
      return;
    }
    if (!meta) {
      // first sync ever on this device → union so pre-login local survives
      applyDoc(mergeUnion(snapshotLocal(), remote));
      await pushNow();
      return;
    }
    if (meta.uid !== user.uid) {
      // different account on this device → take cloud as truth
      applyDoc(remote);
      saveMeta(user.uid, remote.updatedAt, false);
      return;
    }
    // same user returning → document-level last-write-wins
    if (remote.updatedAt > meta.at) {
      if (meta.dirty) {
        // both sides changed → union (avoids data loss in this rare conflict)
        applyDoc(mergeUnion(snapshotLocal(), remote));
        await pushNow();
      } else {
        // remote is newer and we have no local edits → accept it (deletions land)
        applyDoc(remote);
        saveMeta(user.uid, remote.updatedAt, false);
      }
    } else if (meta.dirty) {
      await pushNow(); // our local edits win
    } else {
      saveMeta(user.uid, remote.updatedAt, false); // already in sync
    }
  } catch (e) {
    console.warn("[sync] initial sync failed", e);
    applyingRemote = false;
  }
}

function onLogout() {
  currentUser = null;
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
}

let started = false;
/** Call once at app startup. No-op when Firebase isn't configured. */
export function initSync() {
  if (started || !db) return;
  started = true;
  // a single always-on watcher: record local edits (dirty) and push when logged in
  subscribeCatalog(onLocalChange);
  subscribeFavorites(onLocalChange);
  subscribeConti(onLocalChange);
  subscribeHistory(onLocalChange);
  onAuth((user) => {
    if (user) onLogin(user);
    else onLogout();
  });
}
