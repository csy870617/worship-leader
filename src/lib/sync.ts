// Per-user cloud sync: merge-on-login, then debounced push of local changes.
// Kept deliberately simple (no live multi-tab listener) to avoid echo loops —
// cross-device sync happens whenever the app loads and the user is signed in.
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

function snapshotLocal(): Omit<CloudDoc, "updatedAt"> {
  return {
    userSongs: getUserSongs(),
    favorites: getFavoriteIds(),
    conti: getContiItems(),
    history: getHistoryMap(),
    hidden: getHiddenIds(),
  };
}

function merge(local: Omit<CloudDoc, "updatedAt">, remote: Partial<CloudDoc>) {
  // user songs: union by id (local wins on conflict — most recently edited here)
  const byId = new Map<string, Song>();
  for (const s of remote.userSongs ?? []) byId.set(s.id, s);
  for (const s of local.userSongs) byId.set(s.id, s);

  // favorites + hidden: union
  const favorites = [...new Set([...(remote.favorites ?? []), ...local.favorites])];
  const hidden = [...new Set([...(remote.hidden ?? []), ...local.hidden])];

  // history: keep the most recent date per song
  const history: Record<string, string> = { ...(remote.history ?? {}) };
  for (const [id, date] of Object.entries(local.history)) {
    const cur = history[id];
    if (!cur || date > cur) history[id] = date;
  }

  // conti is a single working set: keep local if present, else take remote
  const conti = local.conti.length ? local.conti : remote.conti ?? [];

  return { userSongs: [...byId.values()], favorites, conti, history, hidden };
}

let applyingRemote = false;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let unsubStores: Array<() => void> = [];
let currentUser: User | null = null;

function userRef(uid: string) {
  return doc(db!, "users", uid);
}

async function pushNow() {
  if (!db || !currentUser) return;
  const payload: CloudDoc = { ...snapshotLocal(), updatedAt: Date.now() };
  try {
    await setDoc(userRef(currentUser.uid), payload, { merge: true });
  } catch (e) {
    console.warn("[sync] push failed", e);
  }
}

function schedulePush() {
  if (applyingRemote || !currentUser) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(pushNow, 800);
}

function startWatching() {
  unsubStores = [
    subscribeCatalog(schedulePush),
    subscribeFavorites(schedulePush),
    subscribeConti(schedulePush),
    subscribeHistory(schedulePush),
  ];
}

function stopWatching() {
  unsubStores.forEach((u) => u());
  unsubStores = [];
}

async function onLogin(user: User) {
  // drop any previous watchers/timer before re-binding (auth can re-fire)
  stopWatching();
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  currentUser = user;
  if (!db) return;
  try {
    const snap = await getDoc(userRef(user.uid));
    // bail if auth changed during the await (logout / different user)
    if (currentUser?.uid !== user.uid) return;
    const remote = (snap.exists() ? snap.data() : {}) as Partial<CloudDoc>;
    const merged = merge(snapshotLocal(), remote);

    // apply merged result to local stores without triggering a push storm
    applyingRemote = true;
    setUserSongs(merged.userSongs);
    setFavoriteIds(merged.favorites);
    setContiItems(merged.conti);
    setHistoryMap(merged.history);
    setHiddenIds(merged.hidden);
    applyingRemote = false;

    await pushNow(); // persist the merged state
  } catch (e) {
    console.warn("[sync] initial sync failed", e);
    applyingRemote = false;
  }
  // only start watching if we're still logged in as this user
  if (currentUser?.uid === user.uid) startWatching();
}

function onLogout() {
  currentUser = null;
  stopWatching();
  if (pushTimer) clearTimeout(pushTimer);
}

let started = false;
/** Call once at app startup. No-op when Firebase isn't configured. */
export function initSync() {
  if (started || !db) return;
  started = true;
  onAuth((user) => {
    if (user) onLogin(user);
    else onLogout();
  });
}
