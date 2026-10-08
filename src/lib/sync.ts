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
import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import { db, onAuth } from "./firebase";
import type { Song } from "../types";
import {
  getHiddenIds,
  getOverrides,
  getUserSongs,
  setHiddenIds,
  setOverrides,
  setUserSongs,
  subscribeCatalog,
} from "./catalog";
import {
  getFavoriteIds,
  setFavoriteIds,
  subscribeFavorites,
} from "./useFavorites";
import {
  getContiState,
  setContiState,
  subscribeConti,
  type Conti,
  type ContiItem,
} from "./useConti";
import {
  getHistoryMap,
  setHistoryMap,
  subscribeHistory,
} from "./useHistory";
import {
  getSongAttachStore,
  setSongAttachStore,
  subscribeSongAttach,
  type SongAttach,
} from "./songAttach";
import { mergeAttach } from "./mergeAttach";

interface CloudDoc {
  userSongs: Song[];
  favorites: string[];
  contis: Conti[];
  activeContiId: string;
  history: Record<string, string>;
  hidden: string[];
  overrides: Record<string, Partial<Song>>;
  songAttach: Record<string, SongAttach>;
  updatedAt: number;
}
type LocalSnapshot = Omit<CloudDoc, "updatedAt">;

// read conti collection from a doc, migrating the old single-conti shape
function readContis(d: any): { contis: Conti[]; activeContiId: string } {
  if (Array.isArray(d?.contis)) {
    return { contis: d.contis, activeContiId: d.activeContiId ?? d.contis[0]?.id ?? "" };
  }
  if (Array.isArray(d?.conti)) {
    const c: Conti = { id: "c_legacy", name: "콘티 1", items: d.conti as ContiItem[] };
    return { contis: [c], activeContiId: c.id };
  }
  return { contis: [], activeContiId: "" };
}

function snapshotLocal(): LocalSnapshot {
  const cs = getContiState();
  return {
    userSongs: getUserSongs(),
    favorites: getFavoriteIds(),
    contis: cs.contis,
    activeContiId: cs.activeId,
    history: getHistoryMap(),
    hidden: getHiddenIds(),
    overrides: getOverrides(),
    songAttach: getSongAttachStore(),
  };
}

/** Union merge — used for the first login (preserve local + remote) and for
 *  conflicts. `firstSync`: this device has never synced, so its untouched
 *  default conti ("콘티 1", nothing in it) is not real data. */
function mergeUnion(local: LocalSnapshot, remote: Partial<CloudDoc>, firstSync = false): LocalSnapshot {
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

  // overrides: union by song id (local wins on conflict)
  const overrides = { ...(remote.overrides ?? {}), ...local.overrides };
  // song attachments: field-level union so a memo/송폼/sheet present on only one
  // device is never erased by a stale copy from the other (see mergeAttach)
  const songAttach = mergeAttach(local.songAttach, remote.songAttach ?? {});

  // contis: union by id (local wins); prefer local active selection
  const lc = readContis(local);
  const rc = readContis(remote);
  // A new device always starts with an empty "콘티 1" under a fresh id. Unioned
  // in, it was added to the account on every new device/browser and — being the
  // local active one — replaced the user's real conti on screen. Drop it when
  // the account already has contis.
  const remoteIds = new Set(rc.contis.map((c) => c.id));
  const localContis =
    firstSync && rc.contis.length
      ? lc.contis.filter((c) => remoteIds.has(c.id) || (c.items?.length ?? 0) > 0 || !!c.note)
      : lc.contis;
  const cById = new Map<string, Conti>();
  for (const c of rc.contis) cById.set(c.id, c);
  for (const c of localContis) cById.set(c.id, c);
  const contis = [...cById.values()];
  const localActive = localContis.some((c) => c.id === lc.activeContiId) ? lc.activeContiId : "";
  const activeContiId = localActive || rc.activeContiId || contis[0]?.id || "";

  return { userSongs: [...byId.values()], favorites, contis, activeContiId, history, hidden, overrides, songAttach };
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
  try {
    localStorage.setItem(META, JSON.stringify({ uid, at, dirty }));
  } catch (e) {
    console.warn("[sync] meta persist failed", e);
  }
}
function markDirty() {
  const m = getMeta();
  if (m && !m.dirty) saveMeta(m.uid, m.at, true);
}

// ---- runtime state ----
let applyingRemote = false;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let currentUser: User | null = null;
let unsubscribeDoc: (() => void) | null = null;
// true once this login's first reconcile with the cloud has finished. Until
// then a local edit must not push: a full-replace write of the not-yet-merged
// local state would overwrite whatever other devices saved (and an offline
// start whose first read failed would do exactly that once back online).
let ready = false;
// bumped on every local edit, so a push can tell whether more edits arrived
// while it was in flight (and must not mark them as already pushed)
let localSeq = 0;

const userRef = (uid: string) => doc(db!, "users", uid);

// strip undefined / non-plain values so Firestore never rejects the whole write
function clean<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

// live-apply remote changes pushed from another device
function startLiveListener(uid: string) {
  unsubscribeDoc?.();
  unsubscribeDoc = onSnapshot(
    userRef(uid),
    (snap) => {
      if (!currentUser || currentUser.uid !== uid) return;
      if (snap.metadata.hasPendingWrites) return; // our own un-acked write echoing back
      if (!snap.exists()) return;
      const remote = snap.data() as CloudDoc;
      const meta = getMeta();
      if (!meta || meta.uid !== uid) return;
      // any stamp other than the one this device last wrote/applied means
      // another device wrote. Not ">": stamps come from each device's own clock,
      // so a device whose clock runs ahead would ignore everyone else's edits
      // (and then overwrite them with its next push)
      if (remote.updatedAt !== meta.at) {
        if (meta.dirty) {
          // another device pushed while we hold un-pushed edits → merge both
          // sides (never drop either's memo) and push the reconciled result,
          // instead of ignoring the remote and later clobbering it on our push
          applyDoc(mergeUnion(snapshotLocal(), remote));
          schedulePush();
        } else {
          // no local edits → accept the newer remote (deletions land)
          applyDoc(remote);
          saveMeta(uid, remote.updatedAt, false);
        }
      }
    },
    (e) => console.warn("[sync] live listener error", e)
  );
}

function applyDoc(d: Partial<CloudDoc> | LocalSnapshot) {
  applyingRemote = true;
  // a setter can throw (e.g. localStorage quota); finally guarantees the flag
  // resets, otherwise every later local edit would be silently ignored
  try {
    setUserSongs(d.userSongs ?? []);
    setFavoriteIds(d.favorites ?? []);
    const rc = readContis(d);
    setContiState({ contis: rc.contis, activeId: rc.activeContiId });
    setHistoryMap(d.history ?? {});
    setHiddenIds(d.hidden ?? []);
    setOverrides(d.overrides ?? {});
    setSongAttachStore(d.songAttach ?? {});
  } finally {
    applyingRemote = false;
  }
}

async function pushNow() {
  if (!db || !currentUser) return;
  const uid = currentUser.uid;
  const seq = localSeq;
  const payload: CloudDoc = clean({ ...snapshotLocal(), updatedAt: Date.now() });
  try {
    await setDoc(userRef(uid), payload); // full replace → deletions propagate
    // edits made while this write was in flight aren't in it: stay dirty so
    // they are still pushed (a quick close would otherwise drop them)
    if (currentUser?.uid === uid) saveMeta(uid, payload.updatedAt, localSeq !== seq);
  } catch (e) {
    console.warn("[sync] push failed", e);
  }
}

function schedulePush() {
  if (!currentUser || !ready) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(pushNow, 800);
}

/** Push any pending local changes immediately (e.g. when the app is backgrounded). */
function flush() {
  if (!currentUser || !ready) return;
  const m = getMeta();
  if (!m || !m.dirty) return; // nothing un-pushed
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  void pushNow();
}

function onLocalChange() {
  if (applyingRemote) return;
  localSeq++;
  markDirty();
  schedulePush();
}

let reconciling = false;
async function onLogin(user: User) {
  currentUser = user;
  if (!db || reconciling) return;
  ready = false;
  reconciling = true;
  try {
    const snap = await getDoc(userRef(user.uid));
    if (currentUser?.uid !== user.uid) return; // auth changed during await

    const remote = snap.exists() ? (snap.data() as CloudDoc) : null;
    const meta = getMeta();

    if (!remote && meta && meta.uid !== user.uid) {
      // a different account used this device and this one has no cloud data
      // yet: what's here is the previous account's (safe in ITS cloud doc).
      // Seeding would copy it into this account — start this one empty instead.
      applyDoc({});
      saveMeta(user.uid, 0, false);
    } else if (!remote) {
      // mark dirty before pushing so a failed/offline push doesn't leave sync
      // meta permanently unset (which would silently disable dirty-tracking)
      if (!meta) saveMeta(user.uid, 0, true);
      await pushNow(); // seed the cloud from local
    } else if (!meta) {
      // first sync ever on this device → union so pre-login local survives
      saveMeta(user.uid, 0, true);
      applyDoc(mergeUnion(snapshotLocal(), remote, true));
      await pushNow();
    } else if (meta.uid !== user.uid) {
      // different account on this device → take cloud as truth
      applyDoc(remote);
      saveMeta(user.uid, remote.updatedAt, false);
    } else if (remote.updatedAt !== meta.at) {
      // same user returning, and another device wrote since (see the live
      // listener on why this isn't a ">" clock comparison)
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
    // keep pulling changes other devices make while this one stays open
    if (currentUser?.uid === user.uid) {
      startLiveListener(user.uid);
      ready = true;
      // edits made while reconciling were held back — send them now
      if (getMeta()?.dirty) schedulePush();
    }
  } catch (e) {
    // stays not-ready (no pushes) — retried when back online / visible
    console.warn("[sync] initial sync failed", e);
    applyingRemote = false;
  } finally {
    reconciling = false;
    // the account changed while we were reconciling the previous one
    if (currentUser && currentUser.uid !== user.uid && !ready) void onLogin(currentUser);
  }
}

/** Retry a first reconcile that failed (e.g. the app was opened offline). */
function retryLogin() {
  if (currentUser && !ready && !reconciling) void onLogin(currentUser);
}

function onLogout() {
  currentUser = null;
  ready = false;
  unsubscribeDoc?.();
  unsubscribeDoc = null;
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
  subscribeSongAttach(onLocalChange);

  // flush pending changes promptly when the app is hidden/closed so a quick
  // edit-then-close doesn't wait until the next login to reach the cloud
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
    else retryLogin();
  });
  window.addEventListener("pagehide", flush);
  window.addEventListener("online", retryLogin);

  onAuth((user) => {
    if (user) onLogin(user);
    else onLogout();
  });
}
