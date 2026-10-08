// Routes the Android/browser back button to transient UI — overlays (lightbox,
// conti viewer, crop modal) and floating popups (menus, confirm dialogs). Each
// registrant pushes a tagged history entry; a SINGLE global popstate listener
// sends a back press to the TOP registrant only, so nested popups close one at a
// time instead of all at once (or closing their parent).
import { useEffect, useRef } from "react";

type Entry = { onBack: () => void; consumed: boolean };
const stack: Entry[] = [];
let ignore = 0; // popstate events caused by our own history.back() to swallow
let seq = 0;
let listening = false;
// History entries whose popup is gone but whose entry is still in the browser
// history — e.g. a parent closed the popup directly, or a menu and the viewer
// under it closed together (only the top entry can be popped right away). Left
// alone, the next back press would just land on such an entry and do nothing.
const dead = new Set<number>();

const currentId = () => (window.history.state as { __wlBack?: number } | null)?.__wlBack;

/** If the entry we're on belongs to a popup that's already gone, step past it. */
function skipDead() {
  const cur = currentId();
  if (cur != null && dead.has(cur)) {
    dead.delete(cur);
    ignore++;
    window.history.back();
  }
}

function handlePop() {
  if (ignore > 0) {
    ignore--;
  } else {
    const top = stack.pop();
    if (top) {
      top.consumed = true; // its entry is already off history
      top.onBack();
    }
  }
  // keep going past any dead entries this back press (or our own) exposed
  skipDead();
}

/**
 * Register a dismissable popup/overlay with the back stack. Pushes a tagged
 * history entry and returns a `dismiss(popHistory)` to remove it:
 *  - `onBack` runs when the user presses back (the entry is already off history).
 *  - call the returned fn with `true` to close programmatically; it pops our
 *    history entry only if it's still on top — so navigating elsewhere (which
 *    replaces the top entry) never gets undone.
 */
export function registerBack(onBack: () => void): (popHistory: boolean) => void {
  if (!listening) {
    window.addEventListener("popstate", handlePop);
    listening = true;
  }
  const id = ++seq;
  const entry: Entry = { onBack, consumed: false };
  stack.push(entry);
  window.history.pushState({ __wlBack: id }, "");
  let removed = false;
  // `popHistory` is kept for callers' clarity; the entry is now always cleaned
  // up: popped if it's on top, otherwise skipped once back reaches it
  return (_popHistory: boolean) => {
    if (removed) return;
    removed = true;
    const idx = stack.lastIndexOf(entry);
    if (idx !== -1) stack.splice(idx, 1);
    if (entry.consumed) return; // the back press already took its entry
    dead.add(id);
    // after this tick: several popups closing together (or React StrictMode's
    // unmount/remount) settle first, so only a truly orphaned top entry pops.
    // A navigation that already moved past it just leaves it to be skipped.
    queueMicrotask(skipDead);
  };
}

/** How many app pages lie behind this one in the tab's history (react-router's
 *  index). 0 = opened directly (fresh launch, shared link): navigate(-1) would
 *  do nothing, or leave the app. */
export function historyIdx(): number {
  return (window.history.state as { idx?: number } | null)?.idx ?? 0;
}

/** How many popups/overlays are open right now (0 = just the page). */
export function backStackDepth(): number {
  return stack.length;
}

/**
 * Hook: while `open`, the back button (and our history entry) will close the
 * popup via `onClose` instead of navigating away. Pair with a backdrop/outside
 * click for pointer dismissal.
 */
export function useBackDismiss(open: boolean, onClose: () => void) {
  const cb = useRef(onClose);
  cb.current = onClose;
  useEffect(() => {
    if (!open) return;
    const dismiss = registerBack(() => cb.current());
    return () => dismiss(true);
  }, [open]);
}
